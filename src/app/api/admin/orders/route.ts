import { NextResponse } from "next/server";
import {
  CUSTOMER_ORDER_ID_MAX,
  CUSTOMER_ORDER_ID_START,
  isShortCustomerOrderId,
} from "@/lib/customer-orders";
import { SALE_CHANNELS, type SaleChannel } from "@/lib/sale-options";
import { createServiceClient } from "@/lib/supabase-server";

type RequestBody = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALE_CHANNEL_VALUES = new Set<string>(SALE_CHANNELS);

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

function saleChannelValue(body: RequestBody) {
  const value = stringValue(body, "sale_channel") || "not_sold";
  if (!SALE_CHANNEL_VALUES.has(value)) {
    return { error: "Invalid sold at value" };
  }

  return { value: value as SaleChannel };
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

function missingOrderSaleColumns(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("sale_channel") || error?.message?.includes("sold_date") || error?.message?.includes("sold_price"));
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

async function nextOrderId(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("customer_orders")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  const existingIds = new Set((data ?? []).map((row) => String(row.id)));
  const numericIds = Array.from(existingIds)
    .filter(isShortCustomerOrderId)
    .map((id) => Number(id))
    .filter(Number.isFinite);
  const highestNumericId = numericIds.length > 0 ? Math.max(...numericIds) : CUSTOMER_ORDER_ID_START - 1;

  for (
    let nextId = Math.max(CUSTOMER_ORDER_ID_START, highestNumericId + 1);
    nextId <= CUSTOMER_ORDER_ID_MAX;
    nextId += 1
  ) {
    const candidate = String(nextId);
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Customer order number range is full");
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
  const saleChannel = saleChannelValue(requestBody);
  if (saleChannel.error || !saleChannel.value) {
    return NextResponse.json({ error: saleChannel.error ?? "Invalid sold at value" }, { status: 400 });
  }
  const soldDate = nullableStringValue(requestBody, "sold_date");
  const soldPrice = parseOptionalNumeric(requestBody.sold_price, "sold price");
  if (soldPrice.error) {
    return NextResponse.json({ error: soldPrice.error }, { status: 400 });
  }
  const orderId = await nextOrderId(supabase);

  const orderInsert = {
    id: orderId,
    nickname: nullableStringValue(requestBody, "nickname"),
    customer_name: customerName,
    shipping_label: shippingLabel,
    marked_shipped: markedShipped,
    tracking_number: trackingNumber,
    sale_channel: saleChannel.value,
    sold_date: saleChannel.value === "not_sold" ? null : soldDate,
    sold_price: soldPrice.value,
    updated_at: new Date().toISOString(),
  };

  let orderRes = await supabase
    .from("customer_orders")
    .insert(orderInsert)
    .select("id")
    .single();

  if (missingOrderSaleColumns(orderRes.error)) {
    const legacyOrderInsert = {
      id: orderInsert.id,
      nickname: orderInsert.nickname,
      customer_name: orderInsert.customer_name,
      shipping_label: orderInsert.shipping_label,
      marked_shipped: orderInsert.marked_shipped,
      tracking_number: orderInsert.tracking_number,
      updated_at: orderInsert.updated_at,
    };
    orderRes = await supabase
      .from("customer_orders")
      .insert(legacyOrderInsert)
      .select("id")
      .single();
  }

  if (orderRes.error) {
    return NextResponse.json({ error: orderRes.error.message }, { status: 500 });
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
      sale_channel: saleChannel.value,
      sold_date: saleChannel.value === "not_sold" ? null : soldDate,
    })
    .in("id", ids);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  return NextResponse.json({ id: (orderRes.data as { id: string }).id });
}
