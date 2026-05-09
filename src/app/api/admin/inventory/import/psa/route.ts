import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { isUploadFile, uploadInventoryScan } from "@/lib/inventory-scans";
import {
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

function setCodeFor(card: CardLookupForImport | null) {
  const set = Array.isArray(card?.sets) ? card?.sets[0] : card?.sets;
  return set?.code ?? null;
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

  for (const row of rows) {
    const pair = scanPairs.get(row.sourceIndex) ?? { front: null, back: null };
    const match = matchInventoryCard(row, cards);
    let customImageFrontUrl: string | null = row.frontImageUrl;
    let customImageBackUrl: string | null = row.backImageUrl;

    try {
      if (!customImageFrontUrl) {
        customImageFrontUrl = await uploadInventoryScan(supabase, pair.front, {
          certificationNumber: row.certificationNumber,
          side: "front",
        });
      }
      if (!customImageBackUrl) {
        customImageBackUrl = await uploadInventoryScan(supabase, pair.back, {
          certificationNumber: row.certificationNumber,
          side: "back",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload PSA scan image.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    importRows.push({
      card_id: match?.id ?? null,
      manual_card_name: match ? null : row.cardName,
      manual_card_number: match ? null : row.cardNumber,
      manual_set_code: match ? null : row.setCode,
      pending_card_match: !match,
      inventory_type: "graded",
      status: "new",
      quantity: 1,
      graded_rating: row.gradedRating,
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
    pending_match: summaryRows.filter((row) => !row.matched).length,
    rows: summaryRows,
  });
}
