import type { SupabaseClient } from "@supabase/supabase-js";
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
  market_name: string | null;
  name_base: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_type: string | null;
  color: string[] | string | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  cost: number | null;
  attribute: string | null;
  types: string[] | string | null;
  effect: string | null;
  trigger: string | null;
  artist: string | null;
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

let marketNameColumnAvailable: boolean | null = null;
let marketNameColumnProbe: Promise<boolean> | null = null;

function isMissingMarketNameColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" && error.message?.includes("market_name");
}

async function supportsMarketNameColumn(supabase: SupabaseClient): Promise<boolean> {
  if (marketNameColumnAvailable != null) return marketNameColumnAvailable;

  if (!marketNameColumnProbe) {
    marketNameColumnProbe = Promise.resolve(
      supabase.from("cards").select("market_name").limit(1)
    )
      .then(({ error }) => {
        if (isMissingMarketNameColumn(error)) return false;
        if (error) throw error;
        return true;
      })
      .then((available) => {
        marketNameColumnAvailable = available;
        return available;
      })
      .finally(() => {
        marketNameColumnProbe = null;
      });
  }

  return marketNameColumnProbe!;
}

function firstRelation<T>(relation: JoinedRelation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function gameplayDetailScore(row: Record<string, unknown>): number {
  let score = 0;
  if (typeof row.effect === "string" && row.effect.trim()) score += 8;
  if (typeof row.trigger === "string" && row.trigger.trim()) score += 4;
  if (typeof row.card_type === "string" && row.card_type.trim()) score += 2;
  if (typeof row.attribute === "string" && row.attribute.trim()) score += 1;
  if (typeof row.power === "number") score += 1;
  if (typeof row.life === "number") score += 1;
  if (typeof row.cost === "number") score += 1;
  if (typeof row.counter === "number") score += 1;
  if (Array.isArray(row.color) && row.color.length > 0) score += 1;
  if (Array.isArray(row.types) && row.types.length > 0) score += 1;
  return score;
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

  const cardSelect = (includeMarketName: boolean) => `
      id,
      card_image_id,
      card_number,
      name,
      ${includeMarketName ? "market_name," : ""}
      name_base,
      variant_label,
      rarity,
      card_type,
      color,
      power,
      counter,
      life,
      cost,
      attribute,
      types,
      effect,
      trigger,
      artist,
      game_payload,
      image_url,
      image_url_small,
      image_url_preview,
      price_stats!price_stats_card_game_fk (
        market_avg,
        tcg_market,
        ebay_avg,
        ebay_low,
        ebay_high,
        tcg_low,
        tcg_mid,
        tcg_high,
        chg_1d,
        chg_7d,
        chg_30d,
        volume_7d,
        volume_30d,
        tcg_listings_count,
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
    `;
  const queryCard = (includeMarketName: boolean) =>
    supabase
      .from("cards")
      .select(cardSelect(includeMarketName))
      .eq("game_id", game.id)
      .eq("region", "en")
      .eq("card_image_id", id)
      .limit(1)
      .single();

  let includeMarketName = await supportsMarketNameColumn(supabase);
  let { data: card, error: cardErr } = await queryCard(includeMarketName);

  // Keep public card pages available while the market-name migration rolls
  // through environments. Cache the capability so static generation does not
  // repeat a failed schema probe for every card page.
  if (includeMarketName && isMissingMarketNameColumn(cardErr)) {
    includeMarketName = false;
    marketNameColumnAvailable = false;
    ({ data: card, error: cardErr } = await queryCard(false));
  }

  if (cardErr || !card) {
    throw new CardDetailLoadError("Card not found", 404);
  }

  const cardRow = card as unknown as CardRow;
  const priceStats = firstRelation(cardRow.price_stats);
  const set = firstRelation(cardRow.sets);
  const payloadCard = withOnePiecePayloadFallbacks(cardRow as unknown as Record<string, unknown>);
  let detailCard = payloadCard;

  // Alternate-art and special-printing rows can omit gameplay fields even
  // though the base printing with the same collector number has them. Reuse
  // only those shared gameplay details; identity, artwork, and market data stay
  // attached to the exact printing requested above.
  if (gameplayDetailScore(detailCard) < 8 && cardRow.card_number) {
    const { data: detailRows } = await supabase
      .from("cards")
      .select(`
        card_type,
        color,
        power,
        counter,
        life,
        cost,
        attribute,
        types,
        effect,
        trigger,
        artist,
        game_payload
      `)
      .eq("game_id", game.id)
      .eq("region", "en")
      .eq("card_number", cardRow.card_number)
      .limit(12);

    for (const detailRow of detailRows ?? []) {
      const candidate = withOnePiecePayloadFallbacks(
        detailRow as unknown as Record<string, unknown>
      );
      if (gameplayDetailScore(candidate) > gameplayDetailScore(detailCard)) {
        detailCard = candidate;
      }
    }
  }

  const payloadColor = detailCard.color;
  const payloadTypes = detailCard.types;

  return {
    game: gameResponsePayload(game),
    card: {
      id: cardRow.id,
      card_image_id: cardRow.card_image_id,
      card_number: cardRow.card_number,
      name: cardRow.name,
      market_name: cardRow.market_name ?? null,
      name_base: cardRow.name_base,
      variant_label: cardRow.variant_label,
      rarity: cardRow.rarity,
      card_type: typeof detailCard.card_type === "string" ? detailCard.card_type : null,
      color: Array.isArray(payloadColor)
        ? payloadColor.filter((c): c is string => typeof c === "string")
        : typeof payloadColor === "string"
          ? [payloadColor]
          : [],
      power: typeof detailCard.power === "number" ? detailCard.power : null,
      counter: typeof detailCard.counter === "number" ? detailCard.counter : null,
      life: typeof detailCard.life === "number" ? detailCard.life : null,
      cost: typeof detailCard.cost === "number" ? detailCard.cost : null,
      attribute: typeof detailCard.attribute === "string" ? detailCard.attribute : null,
      types: Array.isArray(payloadTypes)
        ? payloadTypes.filter((type): type is string => typeof type === "string")
        : typeof payloadTypes === "string"
          ? [payloadTypes]
          : [],
      effect: typeof detailCard.effect === "string" ? detailCard.effect : null,
      trigger: typeof detailCard.trigger === "string" ? detailCard.trigger : null,
      artist: typeof detailCard.artist === "string" ? detailCard.artist : null,
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
const EBAY_WEEK_WINDOW_DAYS = 7;

async function loadCardMarketExtrasUncached(options: {
  gameId: string;
  cardId: string;
  cardNumber: string | null;
  variantLabel: string | null;
}): Promise<CardMarketExtrasPayload> {
  const supabase = createCachedServiceClient(CATALOG_DATA_TTL_SECONDS);
  const statsSinceIso = new Date(
    Date.now() - EBAY_STATS_WINDOW_DAYS * 86400000
  ).toISOString();
  const weekSinceIso = new Date(
    Date.now() - EBAY_WEEK_WINDOW_DAYS * 86400000
  ).toISOString();

  // Errors degrade to empty (data ?? []) — the page hides the blocks rather
  // than failing the Suspense boundary, matching the history loader.
  const [jpRes, recentRes, windowRes] = await Promise.all([
    supabase
      .from("jp_prices")
      .select("price_jpy, snapshot_date, source_url, card_name, card_image_id, variant, rarity, in_stock, match_method")
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
      // grade + title feed the tier split (Black Label / Pristine live only
      // in the title text).
      .select("sale_price, sale_type, grader, grade, title, sold_at")
      .eq("game_id", options.gameId)
      .eq("card_id", options.cardId)
      .not("sale_price", "is", null)
      .gte("sold_at", statsSinceIso),
  ]);

  let jpPrice = ((jpRes.data ?? [])[0] ?? null) as Omit<JpPriceData, "comparison_match"> | null;
  let comparisonMatch: JpPriceData["comparison_match"] = "linked";

  // Japanese rows are sometimes attached to a region-specific JP printing
  // rather than the English printing. When the direct relation is empty, use
  // a conservative number + treatment matcher so the market page can surface
  // an exact counterpart without collapsing distinct OP13-118 variants.
  if (!jpPrice && options.cardNumber) {
    const { data: candidates } = await supabase
      .from("jp_prices")
      .select("price_jpy, snapshot_date, source_url, card_name, card_image_id, variant, rarity, in_stock, match_method")
      .eq("game_id", options.gameId)
      .eq("card_number", options.cardNumber)
      .not("price_jpy", "is", null)
      .order("snapshot_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    const counterpart = findJpCounterpart(
      (candidates ?? []) as Array<Omit<JpPriceData, "comparison_match">>,
      options.variantLabel
    );
    if (counterpart) {
      jpPrice = counterpart;
      comparisonMatch = "counterpart";
    }
  }

  const ebayWindowRows = (windowRes.data ?? []) as Array<
    EbaySaleForStats & { sold_at: string | null }
  >;
  const ebayWeekRows = ebayWindowRows.filter(
    (sale) => sale.sold_at != null && sale.sold_at >= weekSinceIso
  );

  return {
    jpPrice: jpPrice ? { ...jpPrice, comparison_match: comparisonMatch } : null,
    ebayRecent: (recentRes.data ?? []) as EbaySaleData[],
    ebayWeekStats: computeEbayAvgStats(ebayWeekRows),
    ebayStats: computeEbayAvgStats(ebayWindowRows),
  };
}

export function loadCardMarketExtras(options: {
  gameId: string;
  cardId: string;
  cardNumber: string | null;
  variantLabel: string | null;
}): Promise<CardMarketExtrasPayload> {
  // v5: adds a distinct seven-day exact-printing sold summary. Bump the
  // version on every payload shape change or unstable_cache serves the old
  // shape stale.
  return cachedPublicData(
    publicDataCacheKey("card-extras-v5", options.gameId, options.cardId),
    () => loadCardMarketExtrasUncached(options),
    CATALOG_DATA_TTL_SECONDS
  );
}

function findJpCounterpart(
  candidates: Array<Omit<JpPriceData, "comparison_match">>,
  variantLabel: string | null
): Omit<JpPriceData, "comparison_match"> | null {
  const label = (variantLabel ?? "").toLowerCase();
  const uniqueLatest = new Map<string, Omit<JpPriceData, "comparison_match">>();
  for (const candidate of candidates) {
    const key = candidate.card_image_id ?? candidate.source_url ?? candidate.card_name ?? "";
    if (key && !uniqueLatest.has(key)) uniqueLatest.set(key, candidate);
  }

  const latest = [...uniqueLatest.values()];
  const name = (candidate: Omit<JpPriceData, "comparison_match">) =>
    (candidate.card_name ?? "").toLowerCase();

  if (label.includes("red super")) {
    return latest.find((candidate) => name(candidate).includes("レッドスーパーパラレル")) ?? null;
  }
  if (label.includes("super alternate") || label.includes("super parallel")) {
    return latest.find((candidate) =>
      name(candidate).includes("スーパーパラレル") &&
      !name(candidate).includes("レッドスーパーパラレル")
    ) ?? null;
  }
  if (label.includes("wanted")) {
    return latest.find((candidate) => /wanted|手配書/.test(name(candidate))) ?? null;
  }
  if (label.includes("parallel") || label.includes("alternate")) {
    return latest.find((candidate) =>
      candidate.variant === "altart" && candidate.rarity?.toUpperCase() !== "SP"
    ) ?? null;
  }
  if (!label) {
    return latest.find((candidate) => !candidate.variant) ?? null;
  }
  return null;
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
      publicDataCacheKey("card-core-v3", options.game ?? "default", options.id, publicOnly),
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
