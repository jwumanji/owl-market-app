import { NextResponse } from "next/server";
import { inflateRawSync } from "zlib";
import { findBestCardAliasMatch, loadCardMatchAliases, type CardMatchAliasRow } from "@/lib/card-match-aliases";
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

type PsaImportSummaryRow = {
  source_index: number;
  inventory_item_id: string | null;
  certification_number: string | null;
  graded_rating: string | null;
  matched: boolean;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  front_image_uploaded: boolean;
  back_image_uploaded: boolean;
  skipped_duplicate: boolean;
  image_status: string;
};

type ExistingCertificationItem = {
  id: string;
  certification_number: string | null;
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  graded_rating: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
  catalog_match_status: string | null;
};

type ExistingPsaSubmission = {
  id: string;
  name: string | null;
  source_filename: string | null;
  submitted_at: string | null;
  created_at: string | null;
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

function matchImportedCard(row: PsaImportRow, cards: CardLookupForImport[], aliases: CardMatchAliasRow[]) {
  const alias = findBestCardAliasMatch(
    {
      rawName: row.cardName,
      rawCardNumber: row.cardNumber,
      rawSetHint: row.setCode,
      sourceType: "psa_import",
    },
    aliases
  );
  const aliasCard = alias ? cards.find((card) => card.id === alias.card_id) ?? null : null;
  return aliasCard ?? matchInventoryCard(row, cards);
}

function certificationKey(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function formStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formBooleanValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "true" || value === "on" || value === "1";
}

function defaultSubmissionName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "PSA Submission";
}

function psaOrderNumberFromFilename(value: string | null | undefined) {
  if (!value) return null;
  return value.match(/psa[-_\s]?order[-_\s]?(\d+)/i)?.[1] ?? value.match(/(\d{5,})/)?.[1] ?? null;
}

function dateRank(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function submittedAtValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

async function findExistingPsaSubmissionByOrderNumber({
  supabase,
  orderNumber,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  orderNumber: string;
}) {
  const { data, error } = await supabase
    .from("psa_submissions")
    .select("id, name, source_filename, submitted_at, created_at")
    .not("source_filename", "is", null)
    .limit(50000);

  if (error) {
    return { submission: null, error };
  }

  const existing = ((data ?? []) as ExistingPsaSubmission[])
    .filter((submission) => psaOrderNumberFromFilename(submission.source_filename) === orderNumber)
    .sort((a, b) => dateRank(b.created_at ?? b.submitted_at) - dateRank(a.created_at ?? a.submitted_at))[0];

  return { submission: existing ?? null, error: null };
}

async function recordPsaSubmission({
  supabase,
  submissionName,
  sourceFilename,
  submittedAt,
  summaryRows,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  submissionName: string;
  sourceFilename: string;
  submittedAt: string;
  summaryRows: PsaImportSummaryRow[];
}) {
  const skippedDuplicates = summaryRows.filter((row) => row.skipped_duplicate).length;
  const matched = summaryRows.filter((row) => row.matched).length;
  const pendingMatch = summaryRows.filter((row) => !row.matched && !row.skipped_duplicate).length;
  const imported = summaryRows.filter((row) => !row.skipped_duplicate && row.inventory_item_id).length;

  const { data: submission, error: submissionError } = await supabase
    .from("psa_submissions")
    .insert({
      name: submissionName,
      source_filename: sourceFilename,
      submitted_at: submittedAt,
      total_rows: summaryRows.length,
      imported_count: imported,
      matched_count: matched,
      pending_match_count: pendingMatch,
      skipped_duplicate_count: skippedDuplicates,
    })
    .select("id")
    .single();

  if (submissionError) {
    return { warning: submissionError.message, submissionId: null };
  }

  const submissionId = (submission as { id: string }).id;
  const itemRows = summaryRows.map((row, index) => ({
    submission_id: submissionId,
    inventory_item_id: row.inventory_item_id,
    row_number: index + 1,
    certification_number: row.certification_number,
    graded_rating: row.graded_rating,
    card_name: row.card_name,
    card_number: row.card_number,
    set_code: row.set_code,
    matched: row.matched,
    skipped_duplicate: row.skipped_duplicate,
    image_status: row.image_status,
    result_status: row.skipped_duplicate
      ? row.inventory_item_id
        ? "already_in_inventory"
        : "skipped_duplicate"
      : row.matched
        ? "matched"
        : "needs_match",
  }));

  const { error: itemsError } = await supabase.from("psa_submission_items").insert(itemRows);
  if (itemsError) {
    return { warning: itemsError.message, submissionId };
  }

  return { warning: null, submissionId };
}

async function createInventoryBundleFromPsaRows({
  supabase,
  bundleName,
  summaryRows,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  bundleName: string;
  summaryRows: PsaImportSummaryRow[];
}) {
  const inventoryIds = Array.from(
    new Set(summaryRows.map((row) => row.inventory_item_id).filter((id): id is string => Boolean(id)))
  );

  if (inventoryIds.length === 0) {
    return { bundleId: null, warning: "No inventory items were available to bundle." };
  }

  const assignedRes = await supabase
    .from("inventory_bundle_items")
    .select("inventory_item_id")
    .in("inventory_item_id", inventoryIds);

  if (assignedRes.error) {
    return { bundleId: null, warning: assignedRes.error.message };
  }

  if ((assignedRes.data?.length ?? 0) > 0) {
    return {
      bundleId: null,
      warning: "Bundle was not created because one or more imported cards are already assigned to a bundle.",
    };
  }

  const { data: bundle, error: bundleError } = await supabase
    .from("inventory_bundles")
    .insert({
      name: bundleName,
      status: "new",
      sale_channel: "not_sold",
      sold_date: null,
      sold_price: null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (bundleError) {
    return { bundleId: null, warning: bundleError.message };
  }

  const bundleId = (bundle as { id: string }).id;
  const linkRows = inventoryIds.map((inventoryItemId, index) => ({
    bundle_id: bundleId,
    inventory_item_id: inventoryItemId,
    position: index,
  }));

  const { error: linkError } = await supabase.from("inventory_bundle_items").insert(linkRows);
  if (linkError) {
    await supabase.from("inventory_bundles").delete().eq("id", bundleId);
    return { bundleId: null, warning: linkError.message };
  }

  const { error: inventoryError } = await supabase
    .from("inventory_items")
    .update({
      status: "new",
      sale_channel: "not_sold",
      sold_date: null,
    })
    .in("id", inventoryIds);

  if (inventoryError) {
    return { bundleId, warning: inventoryError.message };
  }

  return { bundleId, warning: null };
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

  const submissionName = formStringValue(formData, "submission_name") || defaultSubmissionName(psaFile.name);
  const submittedAt = submittedAtValue(formStringValue(formData, "submitted_at"));
  const shouldCreateBundle = formBooleanValue(formData, "create_bundle");
  const bundleName = formStringValue(formData, "bundle_name") || submissionName;
  const supabase = createServiceClient();
  const psaOrderNumber = psaOrderNumberFromFilename(psaFile.name);

  if (psaOrderNumber) {
    const duplicateResult = await findExistingPsaSubmissionByOrderNumber({
      supabase,
      orderNumber: psaOrderNumber,
    });

    if (duplicateResult.error) {
      return NextResponse.json({ error: duplicateResult.error.message }, { status: 500 });
    }

    if (duplicateResult.submission) {
      return NextResponse.json(
        {
          error: `PSA order #${psaOrderNumber} has already been imported as "${
            duplicateResult.submission.name ?? "PSA Submission"
          }". Duplicate submissions are not allowed.`,
          existing_submission_id: duplicateResult.submission.id,
          existing_submission_name: duplicateResult.submission.name,
          existing_source_filename: duplicateResult.submission.source_filename,
        },
        { status: 409 }
      );
    }
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
  const hasCertRows = rows.some((row) => certificationKey(row.certificationNumber));
  const existingCertificationItems = new Map<string, ExistingCertificationItem>();

  if (hasCertRows) {
    const { data: existingCertData, error: existingCertError } = await supabase
      .from("inventory_items")
      .select(`
        id, certification_number, card_id, manual_card_name, manual_card_number, manual_set_code, graded_rating,
        custom_image_front_url, custom_image_back_url, catalog_match_status
      `)
      .not("certification_number", "is", null)
      .limit(50000);

    if (existingCertError) {
      return NextResponse.json({ error: existingCertError.message }, { status: 500 });
    }

    for (const item of (existingCertData ?? []) as ExistingCertificationItem[]) {
      const key = certificationKey(item.certification_number);
      if (key) existingCertificationItems.set(key, item);
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
  const aliasResult = await loadCardMatchAliases(supabase);
  const aliases = aliasResult.aliases;
  const importRows = [];
  const importSummaryIndexes: number[] = [];
  const summaryRows: PsaImportSummaryRow[] = [];
  const importCertificationKeys = new Set<string>();

  for (const row of rows) {
    const certificationNumber = row.certificationNumber;
    const certKey = certificationKey(certificationNumber);
    const existingItem = certKey ? existingCertificationItems.get(certKey) ?? null : null;
    const isExistingDuplicate = Boolean(existingItem);
    const isFileDuplicate = Boolean(certKey && importCertificationKeys.has(certKey));

    if (isExistingDuplicate || isFileDuplicate) {
      const match = matchImportedCard(row, cards, aliases);
      summaryRows.push({
        source_index: row.sourceIndex,
        inventory_item_id: existingItem?.id ?? null,
        certification_number: certificationNumber,
        graded_rating: row.gradedRating ?? existingItem?.graded_rating ?? null,
        matched: Boolean(match || existingItem?.card_id || existingItem?.catalog_match_status === "matched"),
        card_name: match?.name ?? row.cardName ?? existingItem?.manual_card_name ?? null,
        card_number: match?.card_number ?? row.cardNumber ?? existingItem?.manual_card_number ?? null,
        set_code: setCodeFor(match) ?? row.setCode ?? existingItem?.manual_set_code ?? null,
        front_image_uploaded: Boolean(existingItem?.custom_image_front_url),
        back_image_uploaded: Boolean(existingItem?.custom_image_back_url),
        skipped_duplicate: true,
        image_status: isExistingDuplicate ? "Already in inventory - linked to existing item" : "Skipped - duplicate cert in CSV",
      });
      continue;
    }

    const pair = scanPairs.get(row.sourceIndex) ?? { front: null, back: null };
    const match = matchImportedCard(row, cards, aliases);
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
      catalog_match_status: match ? "matched" : "needs_match",
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
      source_index: row.sourceIndex,
      inventory_item_id: null,
      certification_number: row.certificationNumber,
      graded_rating: gradedRating,
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
    importSummaryIndexes.push(summaryRows.length - 1);
  }

  if (importRows.length === 0) {
    const submissionResult = await recordPsaSubmission({
      supabase,
      submissionName,
      sourceFilename: psaFile.name,
      submittedAt,
      summaryRows,
    });
    const bundleResult = shouldCreateBundle
      ? await createInventoryBundleFromPsaRows({ supabase, bundleName, summaryRows })
      : { bundleId: null, warning: null };

    return NextResponse.json({
      count: 0,
      matched: summaryRows.filter((row) => row.matched).length,
      pending_match: summaryRows.filter((row) => !row.matched && !row.skipped_duplicate).length,
      skipped_duplicates: summaryRows.filter((row) => row.skipped_duplicate).length,
      submission_id: submissionResult.submissionId,
      submission_warning: submissionResult.warning,
      bundle_id: bundleResult.bundleId,
      bundle_warning: bundleResult.warning,
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

  ((data ?? []) as { id: string }[]).forEach((insertedRow, index) => {
    const summaryIndex = importSummaryIndexes[index];
    if (typeof summaryIndex === "number" && summaryRows[summaryIndex]) {
      summaryRows[summaryIndex].inventory_item_id = insertedRow.id;
    }
  });

  const submissionResult = await recordPsaSubmission({
    supabase,
    submissionName,
    sourceFilename: psaFile.name,
    submittedAt,
    summaryRows,
  });
  const bundleResult = shouldCreateBundle
    ? await createInventoryBundleFromPsaRows({ supabase, bundleName, summaryRows })
    : { bundleId: null, warning: null };

  return NextResponse.json({
    count: data?.length ?? 0,
    matched: summaryRows.filter((row) => row.matched).length,
    pending_match: summaryRows.filter((row) => !row.matched && !row.skipped_duplicate).length,
    skipped_duplicates: summaryRows.filter((row) => row.skipped_duplicate).length,
    submission_id: submissionResult.submissionId,
    submission_warning: submissionResult.warning,
    bundle_id: bundleResult.bundleId,
    bundle_warning: bundleResult.warning,
    rows: summaryRows,
  });
}
