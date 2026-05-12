import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CATALOG_MATCH_STATUSES, GRADED_RATINGS, type CatalogMatchStatus } from "@/lib/inventory-options";
import { isUploadFile, uploadInventoryScan } from "@/lib/inventory-scans";

type InventorySource = {
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  catalog_match_status: CatalogMatchStatus | null;
  item_nickname: string | null;
  pending_card_match: boolean | null;
  inventory_type: string;
  status: string;
  graded_rating: string | null;
  certification_number: string | null;
  custom_image_front_url: string | null;
  custom_image_back_url: string | null;
  customer_name: string | null;
  shipping_tracking: string | null;
  shipping_label_url: string | null;
  shipped_at: string | null;
  sale_channel: string | null;
  sold_date: string | null;
  sold_price: number | null;
  acquired_at: string | null;
  cost_basis: number | null;
  purchased_from: string | null;
  notes: string | null;
};

const CONDITIONS = new Set(["raw", "damaged", "graded", "sealed"]);
const STATUSES = new Set(["new", "grading", "sale", "ship", "sold"]);
const GRADED_RATING_VALUES = new Set<string>(GRADED_RATINGS);
const CATALOG_MATCH_STATUS_VALUES = new Set<string>(CATALOG_MATCH_STATUSES);
const PURCHASED_FROM_OPTIONS = new Set(["facebook", "ebay", "instagram", "direct_person", "event"]);

type RequestBody = Record<string, unknown>;

function stringValue(body: RequestBody, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function resolveCatalogMatchStatus(body: RequestBody, cardId: string | null) {
  const requestedStatus = stringValue(body, "catalog_match_status")?.trim() || null;
  if (requestedStatus && !CATALOG_MATCH_STATUS_VALUES.has(requestedStatus)) {
    return { error: "Invalid catalog match status" };
  }

  if (cardId) {
    return { value: "matched" as CatalogMatchStatus };
  }

  return {
    value: requestedStatus === "custom_verified" ? "custom_verified" as const : "needs_match" as const,
  };
}

async function readCreateRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json().catch(() => null);
    return {
      body: body && typeof body === "object" ? (body as RequestBody) : null,
      frontFile: null,
      backFile: null,
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return { body: null, frontFile: null, backFile: null };
  }

  const body: RequestBody = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      body[key] = value;
    }
  });

  const front = formData.get("custom_image_front");
  const back = formData.get("custom_image_back");

  return {
    body,
    frontFile: isUploadFile(front) ? front : null,
    backFile: isUploadFile(back) ? back : null,
  };
}

function parseOptionalNumeric(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === "") {
    return { value: null as string | number | null };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { value };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { value: null as string | number | null };
    if (Number.isFinite(Number(trimmed))) return { value: trimmed };
  }

  return { error: `Invalid ${fieldName}` };
}

export async function POST(request: Request) {
  const { body, frontFile, backFile } = await readCreateRequest(request);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if ("card_id" in body) {
    const cardId = stringValue(body, "card_id")?.trim() || null;
    const manualName = stringValue(body, "manual_card_name")?.trim() ?? "";
    const inventoryType = stringValue(body, "inventory_type");
    const status = stringValue(body, "status");
    const catalogMatchStatus = resolveCatalogMatchStatus(body, cardId);

    if ("error" in catalogMatchStatus) {
      return NextResponse.json({ error: catalogMatchStatus.error }, { status: 400 });
    }

    if (!cardId && !manualName) {
      return NextResponse.json({ error: "Select a card or enter a manual card name" }, { status: 400 });
    }

    if (!inventoryType || !CONDITIONS.has(inventoryType)) {
      return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
    }

    if (!status || !STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const gradedRating = stringValue(body, "graded_rating")?.trim() || null;
    if (
      gradedRating !== null &&
      !GRADED_RATING_VALUES.has(gradedRating)
    ) {
      return NextResponse.json({ error: "Invalid graded rating" }, { status: 400 });
    }

    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return NextResponse.json({ error: "Quantity must be between 1 and 100" }, { status: 400 });
    }

    const costBasis = parseOptionalNumeric(body.cost_basis, "cost basis");
    if ("error" in costBasis) {
      return NextResponse.json({ error: costBasis.error }, { status: 400 });
    }

    if (body.acquired_at !== null && body.acquired_at !== undefined && typeof body.acquired_at !== "string") {
      return NextResponse.json({ error: "Invalid acquired date" }, { status: 400 });
    }
    const acquiredAt =
      typeof body.acquired_at === "string" && body.acquired_at.trim() ? body.acquired_at.trim() : null;

    const purchasedFromValue =
      typeof body.purchased_from === "string" ? body.purchased_from.trim() : body.purchased_from;
    if (
      purchasedFromValue !== null &&
      purchasedFromValue !== undefined &&
      purchasedFromValue !== "" &&
      (typeof purchasedFromValue !== "string" || !PURCHASED_FROM_OPTIONS.has(purchasedFromValue))
    ) {
      return NextResponse.json({ error: "Invalid purchase origin" }, { status: 400 });
    }
    const purchasedFrom = typeof purchasedFromValue === "string" && purchasedFromValue ? purchasedFromValue : null;

    const certificationNumber =
      inventoryType === "graded" ? stringValue(body, "certification_number")?.trim() || null : null;
    let customImageFrontUrl: string | null = null;
    let customImageBackUrl: string | null = null;

    try {
      customImageFrontUrl = await uploadInventoryScan(supabase, frontFile, {
        certificationNumber,
        side: "front",
      });
      customImageBackUrl = await uploadInventoryScan(supabase, backFile, {
        certificationNumber,
        side: "back",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload inventory scans.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const rows = Array.from({ length: quantity }, () => ({
      card_id: cardId,
      manual_card_name: cardId ? null : manualName,
      manual_card_number: cardId ? null : stringValue(body, "manual_card_number")?.trim() || null,
      manual_set_code: cardId ? null : stringValue(body, "manual_set_code")?.trim() || null,
      catalog_match_status: catalogMatchStatus.value,
      item_nickname: stringValue(body, "item_nickname")?.trim() || null,
      pending_card_match: catalogMatchStatus.value === "needs_match",
      inventory_type: inventoryType,
      status,
      quantity: 1,
      graded_rating: inventoryType === "graded" ? gradedRating : null,
      certification_number: certificationNumber,
      custom_image_front_url: inventoryType === "graded" ? customImageFrontUrl : null,
      custom_image_back_url: inventoryType === "graded" ? customImageBackUrl : null,
      sale_channel: "not_sold",
      sold_date: null,
      sold_price: null,
      ...(acquiredAt ? { acquired_at: acquiredAt } : {}),
      cost_basis: costBasis.value ?? 0,
      purchased_from: purchasedFrom,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    }));

    const { data, error } = await supabase
      .from("inventory_items")
      .insert(rows)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: data?.length ?? 0 });
  }

  if (typeof body.source_id !== "string") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const sourceId = body.source_id.trim();
  if (!sourceId) {
    return NextResponse.json({ error: "Invalid source item" }, { status: 400 });
  }

  const { data: source, error: sourceError } = await supabase
    .from("inventory_items")
    .select("card_id, manual_card_name, manual_card_number, manual_set_code, catalog_match_status, item_nickname, pending_card_match, inventory_type, status, graded_rating, certification_number, custom_image_front_url, custom_image_back_url, customer_name, shipping_tracking, shipping_label_url, shipped_at, sale_channel, sold_date, sold_price, acquired_at, cost_basis, purchased_from, notes")
    .eq("id", sourceId)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "Source inventory item not found" }, { status: 404 });
  }

  const item = source as InventorySource;
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      card_id: item.card_id,
      manual_card_name: item.manual_card_name,
      manual_card_number: item.manual_card_number,
      manual_set_code: item.manual_set_code,
      catalog_match_status: item.catalog_match_status ?? (item.card_id ? "matched" : item.pending_card_match ? "needs_match" : "custom_verified"),
      item_nickname: item.item_nickname,
      pending_card_match: item.catalog_match_status
        ? item.catalog_match_status === "needs_match"
        : item.pending_card_match ?? false,
      inventory_type: item.inventory_type,
      status: item.status,
      quantity: 1,
      graded_rating: item.graded_rating,
      certification_number: item.certification_number,
      custom_image_front_url: item.custom_image_front_url,
      custom_image_back_url: item.custom_image_back_url,
      customer_name: item.customer_name,
      shipping_tracking: item.shipping_tracking,
      shipping_label_url: item.shipping_label_url,
      shipped_at: item.shipped_at,
      sale_channel: item.sale_channel,
      sold_date: item.sold_date,
      sold_price: item.sold_price,
      acquired_at: item.acquired_at,
      cost_basis: item.cost_basis,
      purchased_from: item.purchased_from,
      notes: item.notes,
    })
    .select("id, created_at, inventory_type, status, quantity, catalog_match_status, item_nickname, graded_rating, certification_number, custom_image_front_url, custom_image_back_url, customer_name, shipping_tracking, shipping_label_url, shipped_at, sale_channel, sold_date, sold_price, acquired_at, cost_basis, purchased_from")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0).map((id: string) => id.trim())))
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Choose inventory items to delete" }, { status: 400 });
  }

  if (ids.length > 500) {
    return NextResponse.json({ error: "Delete 500 inventory items or fewer at a time" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    deleted_ids: (data ?? []).map((item) => item.id),
    requested_count: ids.length,
    deleted_count: data?.length ?? 0,
  });
}
