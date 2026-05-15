import { NextResponse } from "next/server";
import { INVENTORY_STATUSES, type InventoryStatus } from "@/lib/inventory-options";
import { SALE_CHANNELS, type SaleChannel } from "@/lib/sale-options";
import { createServiceClient } from "@/lib/supabase-server";

type RequestBody = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
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
  bundleId: string,
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
    .from("inventory_bundle_items")
    .select("bundle_id, inventory_item_id")
    .in("inventory_item_id", ids);

  if (assignedRes.error) {
    return { error: assignedRes.error.message };
  }

  const assignedElsewhere = (assignedRes.data ?? []).some((row) => row.bundle_id !== bundleId);
  if (assignedElsewhere) {
    return { error: "One or more inventory items are already assigned to another bundle" };
  }

  return { error: null };
}

async function currentInventoryIds(supabase: ReturnType<typeof createServiceClient>, bundleId: string) {
  const linksRes = await supabase
    .from("inventory_bundle_items")
    .select("inventory_item_id")
    .eq("bundle_id", bundleId);

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
  const inventoryValidation = await validateInventoryItems(supabase, params.id, ids);
  if (inventoryValidation.error) {
    return NextResponse.json({ error: inventoryValidation.error }, { status: 400 });
  }

  const existingIds = await currentInventoryIds(supabase, params.id);
  const nextIds = new Set(ids);
  const previousIds = new Set(existingIds);
  const removedIds = existingIds.filter((id) => !nextIds.has(id));
  const addedIds = ids.filter((id) => !previousIds.has(id));

  const bundleRes = await supabase
    .from("inventory_bundles")
    .update({
      name,
      notes: nullableStringValue(requestBody, "notes"),
      status: status.value,
      sale_channel: saleChannel.value,
      sold_date: saleChannel.value === "not_sold" ? null : soldDate,
      sold_price: "value" in soldPrice ? soldPrice.value : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (bundleRes.error) {
    return NextResponse.json({ error: bundleRes.error.message }, { status: 500 });
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("inventory_bundle_items")
      .delete()
      .eq("bundle_id", params.id)
      .in("inventory_item_id", removedIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  if (addedIds.length > 0) {
    const { error: addError } = await supabase
      .from("inventory_bundle_items")
      .insert(addedIds.map((inventoryItemId, index) => ({
        bundle_id: params.id,
        inventory_item_id: inventoryItemId,
        position: existingIds.length + index,
      })));

    if (addError) {
      return NextResponse.json({ error: addError.message }, { status: 500 });
    }
  }

  const { error: inventoryError } = await supabase
    .from("inventory_items")
    .update({
      status: status.value,
      sale_channel: saleChannel.value,
      sold_date: saleChannel.value === "not_sold" ? null : soldDate,
    })
    .in("id", ids);

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 });
  }

  return NextResponse.json({ id: params.id });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inventory_bundles")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: params.id });
}
