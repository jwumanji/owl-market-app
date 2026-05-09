import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

type InventorySource = {
  card_id: string | null;
  manual_card_name: string | null;
  manual_card_number: string | null;
  manual_set_code: string | null;
  item_nickname: string | null;
  pending_card_match: boolean | null;
  inventory_type: string;
  status: string;
  graded_rating: string | null;
  shipping_tracking: string | null;
  shipping_label_url: string | null;
  shipped_at: string | null;
  sale_channel: string | null;
  sold_date: string | null;
  sold_price: number | null;
  acquired_at: string | null;
  cost_basis: number | null;
  notes: string | null;
};

const CONDITIONS = new Set(["raw", "damaged", "graded", "sealed"]);
const STATUSES = new Set(["new", "grading", "sale", "ship", "sold"]);
const GRADED_RATINGS = new Set(["TAG 10", "PSA 10", "PSA 9", "BGS 10", "BGS 9.5"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if ("card_id" in body) {
    const cardId = typeof body.card_id === "string" && body.card_id.trim() ? body.card_id.trim() : null;
    const manualName = typeof body.manual_card_name === "string" ? body.manual_card_name.trim() : "";

    if (!cardId && !manualName) {
      return NextResponse.json({ error: "Select a card or enter a manual card name" }, { status: 400 });
    }

    if (typeof body.inventory_type !== "string" || !CONDITIONS.has(body.inventory_type)) {
      return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
    }

    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (
      body.graded_rating !== null &&
      body.graded_rating !== undefined &&
      (typeof body.graded_rating !== "string" || !GRADED_RATINGS.has(body.graded_rating))
    ) {
      return NextResponse.json({ error: "Invalid graded rating" }, { status: 400 });
    }

    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return NextResponse.json({ error: "Quantity must be between 1 and 100" }, { status: 400 });
    }

    const rows = Array.from({ length: quantity }, () => ({
      card_id: cardId,
      manual_card_name: cardId ? null : manualName,
      manual_card_number: cardId || typeof body.manual_card_number !== "string" ? null : body.manual_card_number.trim() || null,
      manual_set_code: cardId || typeof body.manual_set_code !== "string" ? null : body.manual_set_code.trim() || null,
      item_nickname: typeof body.item_nickname === "string" ? body.item_nickname.trim() || null : null,
      pending_card_match: !cardId,
      inventory_type: body.inventory_type,
      status: body.status,
      quantity: 1,
      graded_rating: body.inventory_type === "graded" ? body.graded_rating ?? null : null,
      sale_channel: "not_sold",
      sold_date: null,
      sold_price: null,
      cost_basis: body.cost_basis ? body.cost_basis : 0,
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
    .select("card_id, manual_card_name, manual_card_number, manual_set_code, item_nickname, pending_card_match, inventory_type, status, graded_rating, shipping_tracking, shipping_label_url, shipped_at, sale_channel, sold_date, sold_price, acquired_at, cost_basis, notes")
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
      item_nickname: item.item_nickname,
      pending_card_match: item.pending_card_match ?? false,
      inventory_type: item.inventory_type,
      status: item.status,
      quantity: 1,
      graded_rating: item.graded_rating,
      shipping_tracking: item.shipping_tracking,
      shipping_label_url: item.shipping_label_url,
      shipped_at: item.shipped_at,
      sale_channel: item.sale_channel,
      sold_date: item.sold_date,
      sold_price: item.sold_price,
      acquired_at: item.acquired_at,
      cost_basis: item.cost_basis,
      notes: item.notes,
    })
    .select("id, inventory_type, status, quantity, item_nickname, graded_rating, shipping_tracking, shipping_label_url, shipped_at, sale_channel, sold_date, sold_price")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
