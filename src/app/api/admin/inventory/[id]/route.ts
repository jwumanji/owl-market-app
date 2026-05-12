import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { CATALOG_MATCH_STATUSES, GRADED_RATINGS } from "@/lib/inventory-options";

const STATUSES = new Set(["new", "grading", "sale", "ship", "sold"]);
const CONDITIONS = new Set(["raw", "damaged", "graded", "sealed"]);
const GRADED_RATING_VALUES = new Set<string>(GRADED_RATINGS);
const CATALOG_MATCH_STATUS_VALUES = new Set<string>(CATALOG_MATCH_STATUSES);
const SALE_CHANNELS = new Set(["not_sold", "ebay", "fb", "instagram", "in_person", "traded"]);
const PURCHASED_FROM_OPTIONS = new Set(["facebook", "ebay", "instagram", "direct_person", "event"]);

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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, string | number | boolean | null> = {};

  if ("card_id" in body) {
    if (body.card_id !== null && typeof body.card_id !== "string") {
      return NextResponse.json({ error: "Invalid card match" }, { status: 400 });
    }

    const cardId = body.card_id?.trim() || null;
    updates.card_id = cardId;

    if (cardId) {
      updates.manual_card_name = null;
      updates.manual_card_number = null;
      updates.manual_set_code = null;
      updates.catalog_match_status = "matched";
      updates.pending_card_match = false;
    }
  }

  if ("manual_card_name" in body) {
    if (body.manual_card_name !== null && typeof body.manual_card_name !== "string") {
      return NextResponse.json({ error: "Invalid manual card name" }, { status: 400 });
    }
    updates.manual_card_name = body.manual_card_name?.trim() || null;
  }

  if ("manual_card_number" in body) {
    if (body.manual_card_number !== null && typeof body.manual_card_number !== "string") {
      return NextResponse.json({ error: "Invalid manual card number" }, { status: 400 });
    }
    updates.manual_card_number = body.manual_card_number?.trim() || null;
  }

  if ("manual_set_code" in body) {
    if (body.manual_set_code !== null && typeof body.manual_set_code !== "string") {
      return NextResponse.json({ error: "Invalid manual set code" }, { status: 400 });
    }
    updates.manual_set_code = body.manual_set_code?.trim() || null;
  }

  if ("pending_card_match" in body) {
    if (typeof body.pending_card_match !== "boolean") {
      return NextResponse.json({ error: "Invalid match review state" }, { status: 400 });
    }
    updates.pending_card_match = body.pending_card_match;
    updates.catalog_match_status = body.pending_card_match ? "needs_match" : "custom_verified";
  }

  if ("catalog_match_status" in body) {
    if (typeof body.catalog_match_status !== "string" || !CATALOG_MATCH_STATUS_VALUES.has(body.catalog_match_status)) {
      return NextResponse.json({ error: "Invalid catalog match status" }, { status: 400 });
    }

    updates.catalog_match_status = body.catalog_match_status;
    updates.pending_card_match = body.catalog_match_status === "needs_match";
  }

  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if ("graded_rating" in body) {
    if (body.graded_rating !== null && (typeof body.graded_rating !== "string" || !GRADED_RATING_VALUES.has(body.graded_rating))) {
      return NextResponse.json({ error: "Invalid graded rating" }, { status: 400 });
    }
    updates.graded_rating = body.graded_rating;
  }

  if ("certification_number" in body) {
    if (body.certification_number !== null && typeof body.certification_number !== "string") {
      return NextResponse.json({ error: "Invalid certification number" }, { status: 400 });
    }
    updates.certification_number = body.certification_number?.trim() || null;
  }

  if ("inventory_type" in body) {
    if (typeof body.inventory_type !== "string" || !CONDITIONS.has(body.inventory_type)) {
      return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
    }
    updates.inventory_type = body.inventory_type;
  }

  if ("item_nickname" in body) {
    if (body.item_nickname !== null && typeof body.item_nickname !== "string") {
      return NextResponse.json({ error: "Invalid nickname" }, { status: 400 });
    }
    updates.item_nickname = body.item_nickname?.trim() || null;
  }

  if ("shipping_tracking" in body) {
    if (body.shipping_tracking !== null && typeof body.shipping_tracking !== "string") {
      return NextResponse.json({ error: "Invalid shipping tracking" }, { status: 400 });
    }
    const tracking = body.shipping_tracking?.trim() || null;
    updates.shipping_tracking = tracking;
  }

  if ("customer_name" in body) {
    if (body.customer_name !== null && typeof body.customer_name !== "string") {
      return NextResponse.json({ error: "Invalid customer name" }, { status: 400 });
    }
    updates.customer_name = body.customer_name?.trim() || null;
  }

  if ("shipping_label_url" in body) {
    if (body.shipping_label_url !== null && typeof body.shipping_label_url !== "string") {
      return NextResponse.json({ error: "Invalid shipping label" }, { status: 400 });
    }
    updates.shipping_label_url = body.shipping_label_url?.trim() || null;
  }

  if ("custom_image_front_url" in body) {
    if (body.custom_image_front_url !== null && typeof body.custom_image_front_url !== "string") {
      return NextResponse.json({ error: "Invalid front image URL" }, { status: 400 });
    }
    updates.custom_image_front_url = body.custom_image_front_url?.trim() || null;
  }

  if ("custom_image_back_url" in body) {
    if (body.custom_image_back_url !== null && typeof body.custom_image_back_url !== "string") {
      return NextResponse.json({ error: "Invalid back image URL" }, { status: 400 });
    }
    updates.custom_image_back_url = body.custom_image_back_url?.trim() || null;
  }

  if ("shipped_at" in body) {
    if (body.shipped_at !== null && typeof body.shipped_at !== "string") {
      return NextResponse.json({ error: "Invalid shipped date" }, { status: 400 });
    }
    updates.shipped_at = body.shipped_at || null;
  }

  if ("sale_channel" in body) {
    if (typeof body.sale_channel !== "string" || !SALE_CHANNELS.has(body.sale_channel)) {
      return NextResponse.json({ error: "Invalid sale channel" }, { status: 400 });
    }
    updates.sale_channel = body.sale_channel;
    if (body.sale_channel !== "not_sold" && !("sold_date" in body)) {
      updates.sold_date = new Date().toISOString().slice(0, 10);
    }
  }

  if ("sold_date" in body) {
    if (body.sold_date !== null && typeof body.sold_date !== "string") {
      return NextResponse.json({ error: "Invalid sold date" }, { status: 400 });
    }
    updates.sold_date = body.sold_date || null;
  }

  if ("sold_price" in body) {
    const soldPrice = parseOptionalNumeric(body.sold_price, "sold price");
    if ("error" in soldPrice) {
      return NextResponse.json({ error: soldPrice.error }, { status: 400 });
    }
    updates.sold_price = soldPrice.value;
  }

  if ("acquired_at" in body) {
    if (body.acquired_at !== null && typeof body.acquired_at !== "string") {
      return NextResponse.json({ error: "Invalid acquired date" }, { status: 400 });
    }
    updates.acquired_at = body.acquired_at || null;
  }

  if ("cost_basis" in body) {
    const costBasis = parseOptionalNumeric(body.cost_basis, "cost basis");
    if ("error" in costBasis) {
      return NextResponse.json({ error: costBasis.error }, { status: 400 });
    }
    updates.cost_basis = costBasis.value;
  }

  if ("purchased_from" in body) {
    const purchasedFrom =
      typeof body.purchased_from === "string" ? body.purchased_from.trim() : body.purchased_from;
    if (
      purchasedFrom !== null &&
      purchasedFrom !== "" &&
      (typeof purchasedFrom !== "string" || !PURCHASED_FROM_OPTIONS.has(purchasedFrom))
    ) {
      return NextResponse.json({ error: "Invalid purchase origin" }, { status: 400 });
    }
    updates.purchased_from = purchasedFrom || null;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
    }
    updates.notes = body.notes?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  if (typeof updates.card_id === "string" && updates.card_id) {
    updates.catalog_match_status = "matched";
    updates.pending_card_match = false;
  }

  updates.updated_at = new Date().toISOString();

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("status")
    .eq("id", params.id)
    .single();

  const { data, error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", params.id)
    .select("id, card_id, manual_card_name, manual_card_number, manual_set_code, catalog_match_status, pending_card_match, status, graded_rating, certification_number, custom_image_front_url, custom_image_back_url")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.status && existing?.status !== updates.status) {
    await supabase.from("inventory_status_history").insert({
      inventory_item_id: params.id,
      from_status: existing?.status ?? null,
      to_status: updates.status,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: params.id });
}
