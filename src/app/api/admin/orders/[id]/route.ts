import { NextResponse } from "next/server";
import { SALE_CHANNELS, type SaleChannel } from "@/lib/sale-options";
import {
  gameParamFromBody,
  gameParamFromRequest,
  resolveGameScope,
} from "@/lib/game-scope";
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
  if (!("sale_channel" in body)) {
    return { provided: false as const };
  }

  const value = stringValue(body, "sale_channel") || "not_sold";
  if (!SALE_CHANNEL_VALUES.has(value)) {
    return { provided: true as const, error: "Invalid sold at value" };
  }

  return { provided: true as const, value: value as SaleChannel };
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

async function validateInventoryItems(
  supabase: ReturnType<typeof createServiceClient>,
  gameId: string,
  orderId: string,
  ids: string[]
) {
  if (ids.length === 0) {
    return { error: "Choose at least one inventory item" };
  }

  const inventoryRes = await supabase
    .from("inventory_items")
    .select("id")
    .eq("game_id", gameId)
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
    .eq("game_id", gameId)
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

async function currentInventoryIds(supabase: ReturnType<typeof createServiceClient>, gameId: string, orderId: string) {
  const linksRes = await supabase
    .from("customer_order_items")
    .select("inventory_item_id")
    .eq("game_id", gameId)
    .eq("order_id", orderId);

  if (linksRes.error) {
    throw new Error(linksRes.error.message);
  }

  return ((linksRes.data ?? []) as { inventory_item_id: string }[]).map((row) => row.inventory_item_id);
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  const gameResult = await resolveGameScope(
    supabase,
    gameParamFromBody(requestBody) ?? gameParamFromRequest(request)
  );

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const inventoryValidation = await validateInventoryItems(supabase, game.id, params.id, ids);
  if (inventoryValidation.error) {
    return NextResponse.json({ error: inventoryValidation.error }, { status: 400 });
  }

  const existingIds = await currentInventoryIds(supabase, game.id, params.id);
  const nextIds = new Set(ids);
  const previousIds = new Set(existingIds);
  const removedIds = existingIds.filter((id) => !nextIds.has(id));
  const addedIds = ids.filter((id) => !previousIds.has(id));
  const markedShipped = booleanValue(requestBody, "marked_shipped");
  const shippingLabel = nullableStringValue(requestBody, "shipping_label");
  const trackingNumber = nullableStringValue(requestBody, "tracking_number");
  const saleChannel = saleChannelValue(requestBody);
  if (saleChannel.error) {
    return NextResponse.json({ error: saleChannel.error }, { status: 400 });
  }
  const soldDateProvided = "sold_date" in requestBody;
  const soldDate = soldDateProvided ? nullableStringValue(requestBody, "sold_date") : null;
  const soldPriceProvided = "sold_price" in requestBody;
  const soldPrice = soldPriceProvided ? parseOptionalNumeric(requestBody.sold_price, "sold price") : { value: null };
  if (soldPrice.error) {
    return NextResponse.json({ error: soldPrice.error }, { status: 400 });
  }
  const clearSoldDate = saleChannel.provided && saleChannel.value === "not_sold";

  const orderUpdates: Record<string, string | number | boolean | null> = {
    nickname: nullableStringValue(requestBody, "nickname"),
    customer_name: customerName,
    shipping_label: shippingLabel,
    marked_shipped: markedShipped,
    tracking_number: trackingNumber,
    updated_at: new Date().toISOString(),
  };

  if (saleChannel.provided && saleChannel.value) {
    orderUpdates.sale_channel = saleChannel.value;
  }

  if (soldDateProvided) {
    orderUpdates.sold_date = clearSoldDate ? null : soldDate;
  }

  if (soldPriceProvided) {
    const orderSoldPrice = "value" in soldPrice ? soldPrice.value ?? null : null;
    orderUpdates.sold_price = orderSoldPrice;
  }

  let orderRes = await supabase
    .from("customer_orders")
    .update(orderUpdates)
    .eq("game_id", game.id)
    .eq("id", params.id);

  if (missingOrderSaleColumns(orderRes.error)) {
    const legacyOrderUpdates = { ...orderUpdates };
    delete legacyOrderUpdates.sale_channel;
    delete legacyOrderUpdates.sold_date;
    delete legacyOrderUpdates.sold_price;
    orderRes = await supabase
      .from("customer_orders")
      .update(legacyOrderUpdates)
      .eq("game_id", game.id)
      .eq("id", params.id);
  }

  if (orderRes.error) {
    return NextResponse.json({ error: orderRes.error.message }, { status: 500 });
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("customer_order_items")
      .delete()
      .eq("game_id", game.id)
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
      .eq("game_id", game.id)
      .in("id", removedIds);
  }

  if (addedIds.length > 0) {
    const { error: addError } = await supabase
      .from("customer_order_items")
      .insert(addedIds.map((inventoryItemId) => ({
        game_id: game.id,
        order_id: params.id,
        inventory_item_id: inventoryItemId,
      })));

    if (addError) {
      return NextResponse.json({ error: addError.message }, { status: 500 });
    }
  }

  const inventoryUpdates: Record<string, string | boolean | null> = {
    status: markedShipped ? "sold" : "ship",
    customer_name: customerName,
    shipping_label_url: shippingLabel,
    shipping_tracking: trackingNumber,
    shipped_at: markedShipped ? new Date().toISOString() : null,
  };

  if (saleChannel.provided && saleChannel.value) {
    inventoryUpdates.sale_channel = saleChannel.value;
  }

  if (soldDateProvided) {
    inventoryUpdates.sold_date = clearSoldDate ? null : soldDate;
  }

  const { error: inventoryError } = await supabase
    .from("inventory_items")
    .update(inventoryUpdates)
    .eq("game_id", game.id)
    .in("id", ids);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  return NextResponse.json({ id: params.id });
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const existingIds = await currentInventoryIds(supabase, game.id, params.id);

  const { error } = await supabase
    .from("customer_orders")
    .delete()
    .eq("game_id", game.id)
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
      .eq("game_id", game.id)
      .in("id", existingIds);
  }

  return NextResponse.json({ id: params.id });
}
