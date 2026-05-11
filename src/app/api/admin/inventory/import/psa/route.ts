import { NextResponse } from "next/server";
import { inflateRawSync } from "zlib";
import { createServiceClient } from "@/lib/supabase-server";
import { isUploadFile, uploadInventoryScan } from "@/lib/inventory-scans";
import {
  lookupPsaCertDetails,
  matchInventoryCard,
  parsePsaImport,
  type CardLookupForImport,
  type PsaImportRow,
} from "@/lib/psa-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ScanPair = {
  front: File | null;
  back: File | null;
};

function filesFrom(formData: FormData, key: string) {
  return formData.getAll(key).filter(isUploadFile);
}

function fileMatchesRow(file: File, row: PsaImportRow) {
  const name = file.name.toLowerCase();
  const cert = row.certificationNumber?.toLowerCase();
  const cardNumber = row.cardNumber?.toLowerCase();

  return Boolean((cert && name.includes(cert)) || (cardNumber && name.includes(cardNumber)));
}

function assignScans(rows: PsaImportRow[], frontFiles: File[], backFiles: File[]) {
  const pairs = new Map<number, ScanPair>();
  const usedFront = new Set<File>();
  const usedBack = new Set<File>();

  rows.forEach((row) => {
    const front = frontFiles.find((file) => !usedFront.has(file) && fileMatchesRow(file, row)) ?? null;
    const back = backFiles.find((file) => !usedBack.has(file) && fileMatchesRow(file, row)) ?? null;

    if (front) usedFront.add(front);
    if (back) usedBack.add(back);

    pairs.set(row.sourceIndex, { front, back });
  });

  rows.forEach((row) => {
    const current = pairs.get(row.sourceIndex) ?? { front: null, back: null };
    if (!current.front) {
      const fallback = frontFiles.find((file) => !usedFront.has(file)) ?? null;
      if (fallback) {
        current.front = fallback;
        usedFront.add(fallback);
      }
    }
    if (!current.back) {
      const fallback = backFiles.find((file) => !usedBack.has(file)) ?? null;
      if (fallback) {
        current.back = fallback;
        usedBack.add(fallback);
      }
    }
    pairs.set(row.sourceIndex, current);
  });

  return pairs;
}


type ZipImageEntry = {
  name: string;
  data: Buffer;
};

type ArchiveScanPair = ScanPair & {
  attempted: boolean;
  downloaded: boolean;
  imageCount: number;
};

function contentTypeForZipImage(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function isZipImage(name: string) {
  return /\.(?:jpe?g|png|webp|gif)$/i.test(name);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractZipImageEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return [];

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipImageEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.toString("utf8", centralOffset + 46, centralOffset + 46 + fileNameLength);

    if (!name.endsWith("/") && isZipImage(name) && buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const data = compressionMethod === 0 ? compressed : compressionMethod === 8 ? inflateRawSync(compressed) : null;
      if (data) entries.push({ name, data });
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function fileFromZipEntry(entry: ZipImageEntry) {
  const bytes = entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength) as ArrayBuffer;
  return new File([bytes], entry.name.split(/[\\/]/).pop() ?? entry.name, {
    type: contentTypeForZipImage(entry.name),
  });
}

function scanPairFromEntries(entries: ZipImageEntry[]) {
  const front = entries.find((entry) => /front|obverse/i.test(entry.name)) ?? entries[0] ?? null;
  const back = entries.find((entry) => /back|reverse/i.test(entry.name)) ?? entries.find((entry) => entry !== front) ?? null;

  return {
    front: front ? fileFromZipEntry(front) : null,
    back: back ? fileFromZipEntry(back) : null,
  } satisfies ScanPair;
}

async function downloadPsaImageArchive(url: string | null) {
  if (!url) {
    return { front: null, back: null, attempted: false, downloaded: false, imageCount: 0 } satisfies ArchiveScanPair;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return { front: null, back: null, attempted: true, downloaded: false, imageCount: 0 } satisfies ArchiveScanPair;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const entries = extractZipImageEntries(buffer);
    return {
      ...scanPairFromEntries(entries),
      attempted: true,
      downloaded: true,
      imageCount: entries.length,
    } satisfies ArchiveScanPair;
  } catch {
    return { front: null, back: null, attempted: true, downloaded: false, imageCount: 0 } satisfies ArchiveScanPair;
  }
}

function setCodeFor(card: CardLookupForImport | null) {
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;
  return set?.code ?? null;
}

function certificationKey(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid import upload" }, { status: 400 });
  }

  const psaFile = formData.get("psa_file");
  if (!isUploadFile(psaFile)) {
    return NextResponse.json({ error: "Choose a PSA CSV file to import" }, { status: 400 });
  }

  const text = await psaFile.text();
  const rows = parsePsaImport(text).filter((row) => row.certificationNumber || row.cardName || row.cardNumber);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No PSA rows found in the uploaded file" }, { status: 400 });
  }

  if (rows.length > 200) {
    return NextResponse.json({ error: "Import 200 PSA rows or fewer at a time" }, { status: 400 });
  }

  const frontFiles = filesFrom(formData, "front_images");
  const backFiles = filesFrom(formData, "back_images");
  const scanPairs = assignScans(rows, frontFiles, backFiles);
  const supabase = createServiceClient();
  const hasCertRows = rows.some((row) => certificationKey(row.certificationNumber));
  const existingCertificationKeys = new Set<string>();

  if (hasCertRows) {
    const { data: existingCertData, error: existingCertError } = await supabase
      .from("inventory_items")
      .select("certification_number")
      .not("certification_number", "is", null)
      .limit(50000);

    if (existingCertError) {
      return NextResponse.json({ error: existingCertError.message }, { status: 500 });
    }

    for (const item of existingCertData ?? []) {
      const key = certificationKey(item.certification_number);
      if (key) existingCertificationKeys.add(key);
    }
  }

  const { data: cardData, error: cardsError } = await supabase
    .from("cards")
    .select(`
      id, name, card_number,
      sets (code)
    `)
    .limit(10000);

  if (cardsError) {
    return NextResponse.json({ error: cardsError.message }, { status: 500 });
  }

  const cards = (cardData ?? []) as unknown as CardLookupForImport[];
  const importRows = [];
  const summaryRows = [];
  const importCertificationKeys = new Set<string>();

  for (const row of rows) {
    const certificationNumber = row.certificationNumber;
    const certKey = certificationKey(certificationNumber);
    const isExistingDuplicate = Boolean(certKey && existingCertificationKeys.has(certKey));
    const isFileDuplicate = Boolean(certKey && importCertificationKeys.has(certKey));

    if (isExistingDuplicate || isFileDuplicate) {
      summaryRows.push({
        certification_number: certificationNumber,
        matched: false,
        card_name: row.cardName,
        card_number: row.cardNumber,
        set_code: row.setCode,
        front_image_uploaded: false,
        back_image_uploaded: false,
        skipped_duplicate: true,
        image_status: isExistingDuplicate ? "Skipped - cert already in inventory" : "Skipped - duplicate cert in CSV",
      });
      continue;
    }

    const pair = scanPairs.get(row.sourceIndex) ?? { front: null, back: null };
    const match = matchInventoryCard(row, cards);
    const psaCertDetails = await lookupPsaCertDetails(row.certificationNumber);
    const archivePair = await downloadPsaImageArchive(row.imageArchiveUrl);
    const frontScan = pair.front ?? archivePair.front;
    const backScan = pair.back ?? archivePair.back;
    const gradedRating = row.gradedRating ?? psaCertDetails.gradedRating;
    let customImageFrontUrl: string | null = row.frontImageUrl;
    let customImageBackUrl: string | null = row.backImageUrl;

    try {
      if (!customImageFrontUrl) {
        customImageFrontUrl = await uploadInventoryScan(supabase, frontScan, {
          certificationNumber: row.certificationNumber,
          side: "front",
        });
      }
      if (!customImageBackUrl) {
        customImageBackUrl = await uploadInventoryScan(supabase, backScan, {
          certificationNumber: row.certificationNumber,
          side: "back",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload PSA scan image.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    customImageFrontUrl ??= psaCertDetails.frontImageUrl;
    customImageBackUrl ??= psaCertDetails.backImageUrl;

    importRows.push({
      card_id: match?.id ?? null,
      manual_card_name: match ? null : row.cardName,
      manual_card_number: match ? null : row.cardNumber,
      manual_set_code: match ? null : row.setCode,
      pending_card_match: !match,
      inventory_type: "graded",
      status: "new",
      quantity: 1,
      graded_rating: gradedRating,
      certification_number: row.certificationNumber,
      custom_image_front_url: customImageFrontUrl,
      custom_image_back_url: customImageBackUrl,
      sale_channel: "not_sold",
      sold_date: null,
      sold_price: null,
      cost_basis: 0,
      purchased_from: null,
      notes: row.notes ?? row.description,
    });

    summaryRows.push({
      certification_number: row.certificationNumber,
      matched: Boolean(match),
      card_name: match?.name ?? row.cardName,
      card_number: match?.card_number ?? row.cardNumber,
      set_code: setCodeFor(match) ?? row.setCode,
      front_image_uploaded: Boolean(customImageFrontUrl),
      back_image_uploaded: Boolean(customImageBackUrl),
      image_status:
        customImageFrontUrl && customImageBackUrl
          ? "Front/back scans imported"
          : archivePair.attempted && !archivePair.downloaded
            ? "PSA ZIP unavailable"
            : archivePair.downloaded && archivePair.imageCount === 0
              ? "PSA ZIP had no images"
              : "No scans imported",
      skipped_duplicate: false,
    });

    if (certKey) importCertificationKeys.add(certKey);
  }

  if (importRows.length === 0) {
    return NextResponse.json({
      count: 0,
      matched: 0,
      pending_match: 0,
      skipped_duplicates: summaryRows.filter((row) => row.skipped_duplicate).length,
      rows: summaryRows,
    });
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert(importRows)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    matched: summaryRows.filter((row) => row.matched).length,
    pending_match: summaryRows.filter((row) => !row.matched && !row.skipped_duplicate).length,
    skipped_duplicates: summaryRows.filter((row) => row.skipped_duplicate).length,
    rows: summaryRows,
  });
}
