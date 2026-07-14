import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchSealedProducts } from "@/lib/justtcg";
import {
  buildSealedImportRow,
  type SealedImportRow,
  type SealedSetTarget,
} from "@/lib/sealed-products";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

const UPSERT_CHUNK_SIZE = 100;

type SyncedProduct = {
  id: string;
  tcg_product_id: string | null;
};

function chunk<T>(rows: T[], size = UPSERT_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function isAuthorized(request: Request, secret: string) {
  const { searchParams } = new URL(request.url);
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    searchParams.get("secret") === secret
  );
}

async function syncSealedProducts(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.JUSTTCG_API_KEY) {
    return NextResponse.json({ error: "JUSTTCG_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json(
      { error: gameResult.error.message },
      { status: gameResult.error.status }
    );
  }
  const { game } = gameResult;
  const syncedAt = new Date().toISOString();
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  let providerProducts: Awaited<ReturnType<typeof fetchSealedProducts>>;
  try {
    providerProducts = await fetchSealedProducts();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch JustTCG sealed products" },
      { status: 502 }
    );
  }
  if (providerProducts.length === 0) {
    return NextResponse.json(
      { error: "JustTCG returned zero sealed products; no database changes were made." },
      { status: 502 }
    );
  }

  const { data: setRows, error: setsError } = await supabase
    .from("sets")
    .select("id, code, name")
    .eq("game_id", game.id);
  if (setsError) {
    return NextResponse.json({ error: setsError.message }, { status: 500 });
  }

  const sets = (setRows ?? []) as SealedSetTarget[];
  const skippedWithoutTcgplayerId: string[] = [];
  const duplicateTcgProductIds = new Set<string>();
  const rowByTcgProductId = new Map<string, SealedImportRow>();

  for (const product of providerProducts) {
    const row = buildSealedImportRow(product, game.id, sets, syncedAt);
    if (!row) {
      skippedWithoutTcgplayerId.push(product.id);
      continue;
    }
    if (rowByTcgProductId.has(row.tcg_product_id)) {
      duplicateTcgProductIds.add(row.tcg_product_id);
    }
    rowByTcgProductId.set(row.tcg_product_id, row);
  }
  const rows = Array.from(rowByTcgProductId.values());

  const typeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.product_type] = (counts[row.product_type] ?? 0) + 1;
    return counts;
  }, {});
  const mappedRows = rows.filter((row) => row.set_id);
  const pricedRows = rows.filter((row) => row.tcg_price != null && row.tcg_price > 0);
  const unmappedSourceSets = Array.from(
    new Map(
      rows
        .filter((row) => !row.set_id)
        .map((row) => [
          row.source_set_slug,
          { slug: row.source_set_slug, name: row.source_set_name },
        ])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const audit = {
    provider: "justtcg",
    providerProducts: providerProducts.length,
    importableProducts: rows.length,
    pricedProducts: pricedRows.length,
    mappedProducts: mappedRows.length,
    unmappedProducts: rows.length - mappedRows.length,
    skippedWithoutTcgplayerId: skippedWithoutTcgplayerId.length,
    duplicateTcgProductIds: Array.from(duplicateTcgProductIds),
    productTypes: typeCounts,
    unmappedSourceSets,
  };

  if (dryRun) {
    return NextResponse.json({ game: game.slug, dryRun: true, audit });
  }

  const syncedProducts: SyncedProduct[] = [];
  for (const rowChunk of chunk(rows)) {
    const { data, error } = await supabase
      .from("sealed_products")
      .upsert(rowChunk, { onConflict: "game_id,tcg_product_id" })
      .select("id, tcg_product_id");

    if (error) {
      return NextResponse.json(
        { error: `Sealed-product upsert failed: ${error.message}`, audit },
        { status: 500 }
      );
    }
    syncedProducts.push(...((data ?? []) as SyncedProduct[]));
  }

  const idByTcgProduct = new Map(
    syncedProducts
      .filter((row): row is SyncedProduct & { tcg_product_id: string } => Boolean(row.tcg_product_id))
      .map((row) => [row.tcg_product_id, row.id])
  );
  const priceDate = syncedAt.slice(0, 10);
  const historyRows = pricedRows.flatMap((row) => {
    const sealedProductId = idByTcgProduct.get(row.tcg_product_id);
    if (!sealedProductId || row.tcg_price == null) return [];
    return [{
      game_id: game.id,
      sealed_product_id: sealedProductId,
      source: "justtcg",
      price: row.tcg_price,
      price_date: priceDate,
      recorded_at: syncedAt,
    }];
  });

  for (const historyChunk of chunk(historyRows)) {
    const { error } = await supabase
      .from("sealed_product_price_history")
      .upsert(historyChunk, { onConflict: "sealed_product_id,price_date" });
    if (error) {
      return NextResponse.json(
        { error: `Sealed history upsert failed: ${error.message}`, audit },
        { status: 500 }
      );
    }
  }

  const staleUpdate = await supabase
    .from("sealed_products")
    .update({ is_active: false })
    .eq("game_id", game.id)
    .lt("last_synced_at", syncedAt);
  if (staleUpdate.error) {
    return NextResponse.json(
      { error: `Stale-product cleanup failed: ${staleUpdate.error.message}`, audit },
      { status: 500 }
    );
  }

  const neverSyncedUpdate = await supabase
    .from("sealed_products")
    .update({ is_active: false })
    .eq("game_id", game.id)
    .is("last_synced_at", null);
  if (neverSyncedUpdate.error) {
    return NextResponse.json(
      { error: `Legacy-product cleanup failed: ${neverSyncedUpdate.error.message}`, audit },
      { status: 500 }
    );
  }

  revalidatePath("/markets");
  revalidatePath("/sets", "layout");
  revalidatePath(`/games/${game.routeSlug}/markets`);
  revalidatePath(`/games/${game.routeSlug}/sets`, "layout");

  return NextResponse.json({
    game: game.slug,
    synced: syncedProducts.length,
    historySnapshots: historyRows.length,
    audit,
  });
}

export { syncSealedProducts as GET, syncSealedProducts as POST };