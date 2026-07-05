import { createCachedServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacks } from "@/lib/game-payload";
import {
  gameResponsePayload,
  publicOnlyForCatalogPreview,
  resolveGameScope,
} from "@/lib/game-scope";
import {
  cachedPublicData,
  CATALOG_DATA_TTL_SECONDS,
  publicDataCacheKey,
} from "@/lib/public-data-cache";
import { computeEbayAvgStats, type EbaySaleForStats } from "@/lib/ebay-stats";
import type {
  CardCorePayload,
  CardDetailPayload,
  CardHistoryPayload,
  CardMarketExtrasPayload,
  EbaySaleData,
  JpPriceData,
  PriceStatsData,
  PricePoint,
} from "./card-detail-types";

export type CardDetailLoadResult =
  | { ok: true; data: CardDetailPayload }
  | { ok: false; status: number; message: string };

class CardDetailLoadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CardDetailLoadError";
    this.status = status;
  }
}

type JoinedRelation<T> = T | T[] | null;

type CardRow = {
  id: string;
  card_image_id: string;
  card_number: string | null;
  name: string;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_type: string | null;
  color: string[] | string | null;
  game_payload: Record<string, unknown> | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  price_stats: JoinedRelation<PriceStatsData>;
  sets: JoinedRelation<CardDetailPayload["set"]>;
};

interface SynthPoint {
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

function firstRelation<T>(relation: JoinedRelation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

async function loadCardCoreUncached(options: {
  id: string;
  game?: string | null;
}): Promise<CardCorePayload> {
  const supabase = createCachedServiceClient(CATALOG_DATA_TTL_SECONDS);
  const gameResult = await resolveGameScope(supabase, options.game, {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    throw new CardDetailLoadError(gameResult.error.message, gameResult.error.status);
  }

  const { game } = gameResult;
  const id = decodeURIComponent(options.id);

  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .select(`
      id,
      card_image_id,
      card_number,
      name,
      name_base,
      variant_label,
      rarity,
      card_type,
      color,
      game_payload,
      image_url,
      image_url_small,
      image_url_preview,
      price_stats!price_stats_card_game_fk (
        market_avg,
        tcg_market,
        ebay_avg,
        tcg_low,
        tcg_mid,
        tcg_high,
        chg_1d,
        chg_7d,
        chg_30d,
        ath,
        ath_date,
        atl,
        atl_date,
        updated_at
      ),
      sets!cards_set_game_fk (
        id,
        slug,
        code,
        name,
        series,
        color,
        year
      )
    `)
    .eq("game_id", game.id)
    .eq("region", "en")
    .eq("card_image_id", id)
    .limit(1)
    .single();

  if (cardErr || !card) {
    throw new CardDetailLoadError("Card not found", 404);
  }

  const cardRow = card as unknown as CardRow;
  const priceStats = firstRelation(cardRow.price_stats);
  const set = firstRelation(cardRow.sets);
  const payloadCard = withOnePiecePayloadFallbacks(cardRow as unknown as Record<string, unknown>);
  const payloadColor = payloadCard.color;

  return {
    game: gameResponsePayload(game),
    card: {
      id: cardRow.id,
      card_image_id: cardRow.card_image_id,
      card_number: cardRow.card_number,
      name: cardRow.name,
      name_base: cardRow.name_base,
      variant_label: cardRow.variant_label,
      rarity: cardRow.rarity,
      card_type: typeof payloadCard.card_type === "string" ? payloadCard.card_type : null,
      color: Array.isArray(payloadColor)
        ? payloadColor.filter((c): c is string => typeof c === "string")
        : typeof payloadColor === "string"
          ? [payloadColor]
          : [],
      image_url: cardRow.image_url,
      image_url_small: cardRow.image_url_small,
      image_url_preview: cardRow.image_url_preview,
    },
    set,
    priceStats,
  };
}

async function loadCardHistoryUncached(options: {
  gameId: string;
  cardId: string;
  priceStats: PriceStatsData | null;
}): Promise<CardHistoryPayload> {
  const supabase = createCachedServiceClient(CATALOG_DATA_TTL_SECONDS);

  // Longest chart period is 1y (the MAX tab converges with 1y as data ages),
  // so don't ship lifetime history — the table grows daily (M5).
  const historySinceIso = new Date(Date.now() - 365 * 86400000).toISOString();
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("tcg_market, market_avg, recorded_at")
    .eq("game_id", options.gameId)
    .eq("card_id", options.cardId)
    .gte("recorded_at", historySinceIso)
    .order("recorded_at", { ascending: true });

  const realHistory = (priceHistory ?? []) as PricePoint[];
  let historyOut = realHistory;
  let synthetic = false;

  if (realHistory.length < 2 && options.priceStats) {
    const synth = synthesizeHistory(options.priceStats);
    if (synth.length >= 2) {
      historyOut = synth;
      synthetic = true;
    }
  }

  return { priceHistory: historyOut, priceHistorySynthetic: synthetic };
}

// Raw averages blend Buy-It-Now and auctions; graded copies are a different
// market entirely, so the split (never a blend) is computed in ebay-stats.
const EBAY_STATS_WINDOW_DAYS = 90;

async function loadCardMarketExtrasUncached(options: {
  gameId: string;
  cardId: string;
}): Promise<CardMarketExtrasPayload> {
  const supabase = createCachedServiceClient(CATALOG_DATA_TTL_SECONDS);
  const statsSinceIso = new Date(
    Date.now() - EBAY_STATS_WINDOW_DAYS * 86400000
  ).toISOString();

  // Errors degrade to empty (data ?? []) — the page hides the blocks rather
  // than failing the Suspense boundary, matching the history loader.
  const [jpRes, recentRes, windowRes] = await Promise.all([
    supabase
      .from("jp_prices")
      .select("price_jpy, snapshot_date, source_url")
      .eq("game_id", options.gameId)
      .eq("card_id", options.cardId)
      .not("price_jpy", "is", null)
      .order("snapshot_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("ebay_sales")
      .select("sold_at, sale_price, grader, grade, sale_type, ebay_url")
      .eq("game_id", options.gameId)
      .eq("card_id", options.cardId)
      .not("sale_price", "is", null)
      .order("sold_at", { ascending: false })
      .limit(5),
    supabase
      .from("ebay_sales")
      .select("sale_price, sale_type, grader")
      .eq("game_id", options.gameId)
      .eq("card_id", options.cardId)
      .not("sale_price", "is", null)
      .gte("sold_at", statsSinceIso),
  ]);

  return {
    jpPrice: ((jpRes.data ?? [])[0] ?? null) as JpPriceData | null,
    ebayRecent: (recentRes.data ?? []) as EbaySaleData[],
    ebayStats: computeEbayAvgStats((windowRes.data ?? []) as EbaySaleForStats[]),
  };
}

export function loadCardMarketExtras(options: {
  gameId: string;
  cardId: string;
}): Promise<CardMarketExtrasPayload> {
  return cachedPublicData(
    publicDataCacheKey("card-extras-v1", options.gameId, options.cardId),
    () => loadCardMarketExtrasUncached(options),
    CATALOG_DATA_TTL_SECONDS
  );
}

export type CardCoreLoadResult =
  | { ok: true; data: CardCorePayload }
  | { ok: false; status: number; message: string };

// Above-the-fold loader — one indexed query. The page awaits this, then
// streams the history behind Suspense so cold TTFB isn't gated on the
// price_history read.
export async function loadCardCore(options: {
  id: string;
  game?: string | null;
}): Promise<CardCoreLoadResult> {
  try {
    const publicOnly = publicOnlyForCatalogPreview();
    const data = await cachedPublicData(
      publicDataCacheKey("card-core-v1", options.game ?? "default", options.id, publicOnly),
      () => loadCardCoreUncached(options),
      CATALOG_DATA_TTL_SECONDS
    );
    return { ok: true, data };
  } catch (error) {
    if (error instanceof CardDetailLoadError) {
      return { ok: false, status: error.status, message: error.message };
    }

    return {
      ok: false,
      status: 500,
      message: error instanceof Error ? error.message : "Failed to load card",
    };
  }
}

export function loadCardHistory(options: {
  gameId: string;
  cardId: string;
  priceStats: PriceStatsData | null;
}): Promise<CardHistoryPayload> {
  return cachedPublicData(
    publicDataCacheKey("card-history-v1", options.gameId, options.cardId),
    () => loadCardHistoryUncached(options),
    CATALOG_DATA_TTL_SECONDS
  );
}

// Composed loader retained for GET /api/card/[id] — response shape unchanged.
export async function loadCardDetailData(options: {
  id: string;
  game?: string | null;
}): Promise<CardDetailLoadResult> {
  const core = await loadCardCore(options);
  if (!core.ok) return core;

  const history = await loadCardHistory({
    gameId: core.data.game.id,
    cardId: core.data.card.id,
    priceStats: core.data.priceStats,
  });

  return { ok: true, data: { ...core.data, ...history } };
}

function synthesizeHistory(stats: PriceStatsData): SynthPoint[] {
  const current = stats.market_avg ?? stats.tcg_market;
  if (current == null) return [];

  const tcgCurrent = stats.tcg_market ?? current;
  const nowMs = stats.updated_at ? new Date(stats.updated_at).getTime() : Date.now();
  const day = 86400000;

  const points: SynthPoint[] = [];
  const seen = new Set<string>();
  const push = (whenMs: number, marketAvg: number | null, tcg: number | null) => {
    if (marketAvg == null || !isFinite(marketAvg) || marketAvg <= 0) return;
    const iso = new Date(whenMs).toISOString();
    if (seen.has(iso)) return;
    seen.add(iso);
    points.push({
      market_avg: marketAvg,
      tcg_market: tcg != null && isFinite(tcg) && tcg > 0 ? tcg : marketAvg,
      recorded_at: iso,
    });
  };

  if (stats.atl != null && stats.atl_date) {
    push(new Date(stats.atl_date).getTime(), stats.atl, stats.atl);
  }
  if (stats.ath != null && stats.ath_date) {
    push(new Date(stats.ath_date).getTime(), stats.ath, stats.ath);
  }

  const derive = (chgPct: number | null): number | null => {
    if (chgPct == null) return null;
    const denom = 1 + chgPct / 100;
    if (denom <= 0) return null;
    return current / denom;
  };

  push(nowMs - 30 * day, derive(stats.chg_30d), null);
  push(nowMs - 7 * day, derive(stats.chg_7d), null);
  push(nowMs - 1 * day, derive(stats.chg_1d), null);
  push(nowMs, current, tcgCurrent);

  points.sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  return points;
}
