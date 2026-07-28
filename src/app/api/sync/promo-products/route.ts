import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { PROMO_COLLECTION_CATALOG } from "@/app/sets/promo-collections";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchTcgCsvPromoProducts } from "@/lib/tcgcsv-promo-products";
import { historicalPriceChange } from "@/lib/sealed-price-history";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 60;

function isAuthorized(request: Request, secret: string) {
  const { searchParams } = new URL(request.url);
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    searchParams.get("secret") === secret
  );
}

function productType(slug: string) {
  if (slug.startsWith("illustration-box") || slug.startsWith("pcc-")) return "collection";
  return "bundle";
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type ExistingProduct = {
  id: string;
  set_id: string | null;
  product_type: string | null;
  tcg_price: number | null;
  market_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  atl: number | null;
  image_url: string | null;
  tcg_product_id: string;
  justtcg_id: string | null;
  tcg_sku_id: string | null;
  source_set_slug: string | null;
  source_set_name: string | null;
  price_updated_at: string | null;
  metadata: Record<string, unknown> | null;
};

type HistoryRow = {
  sealed_product_id: string;
  price: number;
  price_date: string;
};

async function syncPromoProducts(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const syncedAt = new Date();
  const syncedAtIso = syncedAt.toISOString();
  const priceDate = syncedAtIso.slice(0, 10);

  let products: Awaited<ReturnType<typeof fetchTcgCsvPromoProducts>>;
  try {
    products = await fetchTcgCsvPromoProducts(PROMO_COLLECTION_CATALOG);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TCGCSV promo sync failed" },
      { status: 502 }
    );
  }

  const mappedEntries = PROMO_COLLECTION_CATALOG.filter((entry) => entry.tcgplayer);
  const productIds = mappedEntries.map((entry) => String(entry.tcgplayer!.productId));
  const { data: existingRows, error: existingError } = await supabase
    .from("sealed_products")
    .select("id,set_id,product_type,tcg_price,market_avg,chg_1d,chg_7d,chg_30d,ath,atl,image_url,tcg_product_id,justtcg_id,tcg_sku_id,source_set_slug,source_set_name,price_updated_at,metadata")
    .eq("game_id", game.id)
    .in("tcg_product_id", productIds);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existing = (existingRows ?? []) as ExistingProduct[];
  const existingByProductId = new Map(existing.map((row) => [row.tcg_product_id, row]));
  const existingIds = existing.map((row) => row.id);
  let history: HistoryRow[] = [];
  if (existingIds.length > 0) {
    const historySince = new Date(syncedAt.getTime() - 35 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("sealed_product_price_history")
      .select("sealed_product_id,price,price_date")
      .eq("game_id", game.id)
      .in("sealed_product_id", existingIds)
      .gte("price_date", historySince)
      .order("price_date", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    history = (data ?? []) as HistoryRow[];
  }

  const historyByProductId = new Map<string, HistoryRow[]>();
  for (const row of existing) {
    historyByProductId.set(
      row.tcg_product_id,
      history.filter((item) => item.sealed_product_id === row.id)
    );
  }

  const rows = products.map((product) => {
    const key = String(product.productId);
    const prior = existingByProductId.get(key);
    const reportedPrice = product.marketPrice;
    const currentPrice = reportedPrice ?? finite(prior?.market_avg ?? prior?.tcg_price);
    const productHistory = historyByProductId.get(key) ?? [];
    const historicalPrices = productHistory.map((item) => Number(item.price)).filter((price) => price > 0);
    if (currentPrice != null) historicalPrices.push(currentPrice);
    const priorAth = finite(prior?.ath);
    const priorAtl = finite(prior?.atl);
    if (priorAth != null && priorAth > 0) historicalPrices.push(priorAth);
    if (priorAtl != null && priorAtl > 0) historicalPrices.push(priorAtl);

    return {
      game_id: game.id,
      set_id: prior?.set_id ?? null,
      name: product.name,
      product_type: prior?.product_type ?? productType(product.slug),
      tcg_price: currentPrice,
      market_avg: currentPrice,
      chg_1d: reportedPrice == null ? prior?.chg_1d ?? null : historicalPriceChange(reportedPrice, productHistory, 1, syncedAt),
      chg_7d: reportedPrice == null ? prior?.chg_7d ?? null : historicalPriceChange(reportedPrice, productHistory, 7, syncedAt),
      chg_30d: reportedPrice == null ? prior?.chg_30d ?? null : historicalPriceChange(reportedPrice, productHistory, 30, syncedAt),
      ath: historicalPrices.length > 0 ? Math.max(...historicalPrices) : prior?.ath ?? null,
      atl: historicalPrices.length > 0 ? Math.min(...historicalPrices) : prior?.atl ?? null,
      image_url: prior?.image_url ?? product.imageUrl,
      tcg_product_id: key,
      provider: "tcgcsv",
      justtcg_id: prior?.justtcg_id ?? null,
      tcg_sku_id: prior?.tcg_sku_id ?? null,
      source_set_slug: prior?.source_set_slug ?? `tcgcsv-${product.categoryId}-${product.groupId}`,
      source_set_name: prior?.source_set_name ?? "Bandai promotional products",
      product_url: product.productUrl,
      price_updated_at: reportedPrice == null ? prior?.price_updated_at ?? syncedAtIso : syncedAtIso,
      last_synced_at: syncedAtIso,
      updated_at: syncedAtIso,
      is_active: true,
      metadata: {
        ...(prior?.metadata ?? {}),
        promo_catalog_slug: product.slug,
        tcgcsv: {
          category_id: product.categoryId,
          group_id: product.groupId,
          product_modified_on: product.modifiedOn,
          subtype: product.subTypeName,
          low_price: product.lowPrice,
          mid_price: product.midPrice,
          high_price: product.highPrice,
        },
      },
    };
  });

  const foundIds = new Set(products.map((product) => product.productId));
  const audit = {
    catalogProducts: PROMO_COLLECTION_CATALOG.length,
    mappedProducts: mappedEntries.length,
    foundProducts: products.length,
    pricedProducts: products.filter((product) => product.marketPrice != null).length,
    missingProductIds: mappedEntries
      .filter((entry) => !foundIds.has(entry.tcgplayer!.productId))
      .map((entry) => entry.tcgplayer!.productId),
  };

  if (dryRun) return NextResponse.json({ game: game.slug, dryRun: true, audit });

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "TCGCSV returned no mapped promo products; no database changes were made.", audit },
      { status: 502 }
    );
  }

  const { data: syncedRows, error: upsertError } = await supabase
    .from("sealed_products")
    .upsert(rows, { onConflict: "game_id,tcg_product_id" })
    .select("id,tcg_product_id,tcg_price");
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message, audit }, { status: 500 });
  }

  const historyRows = (syncedRows ?? []).flatMap((row) => {
    const price = finite(row.tcg_price);
    if (price == null || price <= 0) return [];
    return [{
      game_id: game.id,
      sealed_product_id: row.id,
      source: "tcgcsv",
      price,
      price_date: priceDate,
      recorded_at: syncedAtIso,
    }];
  });
  if (historyRows.length > 0) {
    const { error } = await supabase
      .from("sealed_product_price_history")
      .upsert(historyRows, { onConflict: "sealed_product_id,price_date" });
    if (error) return NextResponse.json({ error: error.message, audit }, { status: 500 });
  }

  revalidatePath("/sets", "layout");
  revalidatePath(`/games/${game.routeSlug}/sets`, "layout");

  return NextResponse.json({
    game: game.slug,
    synced: syncedRows?.length ?? 0,
    historySnapshots: historyRows.length,
    audit,
  });
}

export { syncPromoProducts as GET, syncPromoProducts as POST };
