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

async function validateInventoryItems(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
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
    .select("order_id, inventory_item_id")
    .in("inventory_item_id", ids);

  if (assignedRes.error) {
    return { error: assignedRes.error.message };
  }

  const assignedElsewhere = (assignedRes.data ?? []).some((row) => row.order_id !== orderId);
  if (assignedElsewhere) {
    return { error: "One or more inventory items are already assigned to another order" };
  }

  return { error: null };
}

async function currentInventoryIds(supabase: ReturnType<typeof createServiceClient>, orderId: string) {
  const linksRes = await supabase
    .from("customer_order_items")
    .select("inventory_item_id")
    .eq("order_id", orderId);

  if (linksRes.error) {
    throw new Error(linksRes.error.message);
  }

  return ((linksRes.data ?? []) as { inventory_item_id: string }[]).map((row) => row.inventory_item_id);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
  const inventoryValidation = await validateInventoryItems(supabase, params.id, ids);
  if (inventoryValidation.error) {
    return NextResponse.json({ error: inventoryValidation.error }, { status: 400 });
  }

  const existingIds = await currentInventoryIds(supabase, params.id);
  const nextIds = new Set(ids);
  const previousIds = new Set(existingIds);
  const removedIds = existingIds.filter((id) => !nextIds.has(id));
  const addedIds = ids.filter((id) => !previousIds.has(id));
  const markedShipped = booleanValue(requestBody, "marked_shipped");
  const shippingLabel = nullableStringValue(requestBody, "shipping_label");
  const trackingNumber = nullableStringValue(requestBody, "tracking_number");

  const { error: orderError } = await supabase
    .from("customer_orders")
    .update({
      nickname: nullableStringValue(requestBody, "nickname"),
      customer_name: customerName,
      shipping_label: shippingLabel,
      marked_shipped: markedShipped,
      tracking_number: trackingNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("customer_order_items")
      .delete()
      .eq("order_id", params.id)
      .in("inventory_item_id", removedIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    await supabase
      .from("inventory_items")
      .update({
        status: "sale",
        customer_name: null,
        shipping_label_url: null,
        shipping_tracking: null,
        shipped_at: null,
      })
      .in("id", removedIds);
  }

  if (addedIds.length > 0) {
    const { error: addError } = await supabase
      .from("customer_order_items")
      .insert(addedIds.map((inventoryItemId) => ({ order_id: params.id, inventory_item_id: inventoryItemId })));

    if (addError) {
      return NextResponse.json({ error: addError.message }, { status: 500 });
    }
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

  return NextResponse.json({ id: params.id });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const existingIds = await currentInventoryIds(supabase, params.id);

  const { error } = await supabase
    .from("customer_orders")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existingIds.length > 0) {
    await supabase
      .from("inventory_items")
      .update({
        status: "sale",
        customer_name: null,
        shipping_label_url: null,
        shipping_tracking: null,
        shipped_at: null,
      })
      .in("id", existingIds);
  }

  return NextResponse.json({ id: params.id });
}
