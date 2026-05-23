import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  gameParamFromBody,
  gameParamFromRequest,
  resolveGameScope,
} from "@/lib/game-scope";

type RequestBody = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inventoryItemId(body: RequestBody) {
  const value = body.inventory_item_id;
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const itemId = inventoryItemId(body as RequestBody);
  if (!itemId) {
    return NextResponse.json({ error: "Inventory item is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(
    supabase,
    gameParamFromBody(body as RequestBody) ?? gameParamFromRequest(request)
  );

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const bundleRes = await supabase
    .from("inventory_bundles")
    .select("id, status, sale_channel, sold_date")
    .eq("id", params.id)
    .single();

  if (bundleRes.error) {
    return NextResponse.json({ error: bundleRes.error.message }, { status: 500 });
  }

  const inventoryRes = await supabase
    .from("inventory_items")
    .select("id")
    .eq("game_id", game.id)
    .eq("id", itemId)
    .single();

  if (inventoryRes.error) {
    return NextResponse.json({ error: inventoryRes.error.message }, { status: 500 });
  }

  const assignedRes = await supabase
    .from("inventory_bundle_items")
    .select("bundle_id")
    .eq("inventory_item_id", itemId);

  if (assignedRes.error) {
    return NextResponse.json({ error: assignedRes.error.message }, { status: 500 });
  }

  const assignedBundleId = (assignedRes.data ?? [])[0]?.bundle_id;
  if (assignedBundleId && assignedBundleId !== params.id) {
    return NextResponse.json({ error: "This inventory item is already assigned to another bundle" }, { status: 400 });
  }

  if (!assignedBundleId) {
    const positionRes = await supabase
      .from("inventory_bundle_items")
      .select("id", { count: "exact", head: true })
      .eq("bundle_id", params.id);

    if (positionRes.error) {
      return NextResponse.json({ error: positionRes.error.message }, { status: 500 });
    }

    const { error: linkError } = await supabase
      .from("inventory_bundle_items")
      .insert({
        bundle_id: params.id,
        inventory_item_id: itemId,
        position: positionRes.count ?? 0,
      });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  const bundle = bundleRes.data as { status: string; sale_channel: string | null; sold_date: string | null };
  const { error: inventoryUpdateError } = await supabase
    .from("inventory_items")
    .update({
      status: bundle.status,
      sale_channel: bundle.sale_channel ?? "not_sold",
      sold_date: bundle.sale_channel === "not_sold" ? null : bundle.sold_date,
    })
    .eq("game_id", game.id)
    .eq("id", itemId);

  if (inventoryUpdateError) {
    return NextResponse.json({ error: inventoryUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({
    bundle_id: params.id,
    inventory_item_id: itemId,
    status: bundle.status,
    sale_channel: bundle.sale_channel ?? "not_sold",
    sold_date: bundle.sale_channel === "not_sold" ? null : bundle.sold_date,
  });
}
