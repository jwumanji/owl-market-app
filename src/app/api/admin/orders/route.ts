import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

type RequestBody = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stringValue(body: RequestBody, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(body: RequestBody, key: string) {
  const value = stringValue(body, key);
  return value || null;
}

function booleanValue(body: RequestBody, key: string) {
  return body[key] === true;
}

function inventoryItemIds(body: RequestBody) {
  if (!Array.isArray(body.inventory_item_ids)) return [];
  return Array.from(
    new Set(
      body.inventory_item_ids
        .filter((id: unknown): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => UUID_PATTERN.test(id))
    )
  );
}

function todayStamp() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function nextOrderId(supabase: ReturnType<typeof createServiceClient>) {
  const prefix = `OM-${todayStamp()}-`;
  const { data, error } = await supabase
    .from("customer_orders")
    .select("id")
    .like("id", `${prefix}%`)
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const lastId = data?.[0]?.id as string | undefined;
  const lastSequence = lastId?.startsWith(prefix) ? Number(lastId.slice(prefix.length)) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

async function validateInventoryItems(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[]
) {
  if (ids.length === 0) {
    return { error: "Choose at least one inventory item" };
  }

  const inventoryRes = await supabase
    .from("inventory_items")
    .select("id")
    .in("id", ids);

  if (inventoryRes.error) {
    return { error: inventoryRes.error.message };
  }

  if ((inventoryRes.data?.length ?? 0) !== ids.length) {
    return { error: "One or more inventory items were not found" };
  }

  const assignedRes = await supabase
    .from("customer_order_items")
    .select("inventory_item_id")
    .in("inventory_item_id", ids);

  if (assignedRes.error) {
    return { error: assignedRes.error.message };
  }

  if ((assignedRes.data?.length ?? 0) > 0) {
    return { error: "One or more inventory items are already assigned to an order" };
  }

  return { error: null };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestBody = body as RequestBody;
  const customerName = stringValue(requestBody, "customer_name");
  const ids = inventoryItemIds(requestBody);

  if (!customerName) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const inventoryValidation = await validateInventoryItems(supabase, ids);
  if (inventoryValidation.error) {
    return NextResponse.json({ error: inventoryValidation.error }, { status: 400 });
  }

  const markedShipped = booleanValue(requestBody, "marked_shipped");
  const shippingLabel = nullableStringValue(requestBody, "shipping_label");
  const trackingNumber = nullableStringValue(requestBody, "tracking_number");
  const orderId = await nextOrderId(supabase);

  const { data: order, error: orderError } = await supabase
    .from("customer_orders")
    .insert({
      id: orderId,
      nickname: nullableStringValue(requestBody, "nickname"),
      customer_name: customerName,
      shipping_label: shippingLabel,
      marked_shipped: markedShipped,
      tracking_number: trackingNumber,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const linkRows = ids.map((inventoryItemId) => ({
    order_id: orderId,
    inventory_item_id: inventoryItemId,
  }));
  const { error: linkError } = await supabase.from("customer_order_items").insert(linkRows);

  if (linkError) {
    await supabase.from("customer_orders").delete().eq("id", orderId);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const { error: inventoryError } = await supabase
    .from("inventory_items")
    .update({
      status: markedShipped ? "sold" : "ship",
      customer_name: customerName,
      shipping_label_url: shippingLabel,
      shipping_tracking: trackingNumber,
      shipped_at: markedShipped ? new Date().toISOString() : null,
    })
    .in("id", ids);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  return NextResponse.json({ id: (order as { id: string }).id });
}
