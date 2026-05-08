import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

const STATUSES = new Set(["new", "grading", "sale", "sold"]);
const CONDITIONS = new Set(["raw", "damaged", "graded", "sealed"]);
const GRADED_RATINGS = new Set(["TAG 10", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5"]);
const SALE_CHANNELS = new Set(["not_sold", "ebay", "fb", "instagram", "in_person", "traded"]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, string | number | null> = {};

  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if ("graded_rating" in body) {
    if (body.graded_rating !== null && (typeof body.graded_rating !== "string" || !GRADED_RATINGS.has(body.graded_rating))) {
      return NextResponse.json({ error: "Invalid graded rating" }, { status: 400 });
    }
    updates.graded_rating = body.graded_rating;
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
    updates.shipped_at = tracking ? new Date().toISOString() : null;
  }

  if ("sale_channel" in body) {
    if (typeof body.sale_channel !== "string" || !SALE_CHANNELS.has(body.sale_channel)) {
      return NextResponse.json({ error: "Invalid sale channel" }, { status: 400 });
    }
    updates.sale_channel = body.sale_channel;
    updates.status = body.sale_channel === "not_sold" ? "sale" : "sold";
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
    if (body.sold_price !== null && typeof body.sold_price !== "string") {
      return NextResponse.json({ error: "Invalid sold price" }, { status: 400 });
    }
    updates.sold_price = body.sold_price?.trim() || null;
  }

  if ("acquired_at" in body) {
    if (body.acquired_at !== null && typeof body.acquired_at !== "string") {
      return NextResponse.json({ error: "Invalid acquired date" }, { status: 400 });
    }
    updates.acquired_at = body.acquired_at || null;
  }

  if ("cost_basis" in body) {
    if (body.cost_basis !== null && typeof body.cost_basis !== "string") {
      return NextResponse.json({ error: "Invalid cost basis" }, { status: 400 });
    }
    updates.cost_basis = body.cost_basis?.trim() || null;
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
    .select("id, status, graded_rating")
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
