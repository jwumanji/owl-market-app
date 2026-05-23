import { NextResponse } from "next/server";
import { INVENTORY_STATUSES, type InventoryStatus } from "@/lib/inventory-options";
import { SALE_CHANNELS, type SaleChannel } from "@/lib/sale-options";
import {
  gameParamFromBody,
  gameParamFromRequest,
  resolveGameScope,
} from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

type RequestBody = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVENTORY_STATUS_VALUES = new Set<string>(INVENTORY_STATUSES);
const SALE_CHANNEL_VALUES = new Set<string>(SALE_CHANNELS);

function stringValue(body: RequestBody, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(body: RequestBody, key: string) {
  const value = stringValue(body, key);
  return value || null;
}

function statusValue(body: RequestBody) {
  const value = stringValue(body, "status") || "new";
  if (!INVENTORY_STATUS_VALUES.has(value)) {
    return { error: "Invalid bundle status" };
  }

  return { value: value as InventoryStatus };
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
    .from("inventory_bundle_items")
    .select("inventory_item_id")
    .in("inventory_item_id", ids);

  if (assignedRes.error) {
    return { error: assignedRes.error.message };
  }

  if ((assignedRes.data?.length ?? 0) > 0) {
    return { error: "One or more inventory items are already assigned to a bundle" };
  }

  return { error: null };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestBody = body as RequestBody;
  const name = stringValue(requestBody, "name");
  const ids = inventoryItemIds(requestBody);

  if (!name) {
    return NextResponse.json({ error: "Bundle name is required" }, { status: 400 });
  }

  const status = statusValue(requestBody);
  if (status.error || !status.value) {
    return NextResponse.json({ error: status.error ?? "Invalid bundle status" }, { status: 400 });
  }

  const saleChannel = saleChannelValue(requestBody);
  if (saleChannel.error || !saleChannel.value) {
    return NextResponse.json({ error: saleChannel.error ?? "Invalid sold at value" }, { status: 400 });
  }

  const soldDate = nullableStringValue(requestBody, "sold_date");
  const soldPrice = parseOptionalNumeric(requestBody.sold_price, "sold price");
  if (soldPrice.error) {
    return NextResponse.json({ error: soldPrice.error }, { status: 400 });
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

  const inventoryValidation = await validateInventoryItems(supabase, game.id, ids);
  if (inventoryValidation.error) {
    return NextResponse.json({ error: inventoryValidation.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const bundleRes = await supabase
    .from("inventory_bundles")
    .insert({
      name,
      notes: nullableStringValue(requestBody, "notes"),
      status: status.value,
      sale_channel: saleChannel.value,
      sold_date: saleChannel.value === "not_sold" ? null : soldDate,
      sold_price: "value" in soldPrice ? soldPrice.value : null,
      updated_at: now,
    })
    .select("id")
    .single();

  if (bundleRes.error) {
    return NextResponse.json({ error: bundleRes.error.message }, { status: 500 });
  }

  const bundleId = (bundleRes.data as { id: string }).id;
  const linkRows = ids.map((inventoryItemId, index) => ({
    bundle_id: bundleId,
    inventory_item_id: inventoryItemId,
    position: index,
  }));
  const { error: linkError } = await supabase.from("inventory_bundle_items").insert(linkRows);

  if (linkError) {
    await supabase.from("inventory_bundles").delete().eq("id", bundleId);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const { error: inventoryError } = await supabase
    .from("inventory_items")
    .update({
      status: status.value,
      sale_channel: saleChannel.value,
      sold_date: saleChannel.value === "not_sold" ? null : soldDate,
    })
    .eq("game_id", game.id)
    .in("id", ids);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  return NextResponse.json({ id: bundleId });
}
