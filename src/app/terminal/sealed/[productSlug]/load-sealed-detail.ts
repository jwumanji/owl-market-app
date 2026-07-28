import { createCachedServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacks } from "@/lib/game-payload";
import {
  allowsPrivateGamePreview,
  gameResponsePayload,
  resolveGameScope,
  type GameScope,
} from "@/lib/game-scope";
import {
  cachedPublicData,
  CATALOG_DATA_TTL_SECONDS,
  publicDataCacheKey,
} from "@/lib/public-data-cache";
import { firstRelation } from "@/lib/supabase-relations";
import {
  classifyBoosterBaseline,
  isBulkRarity,
  type BoosterBaselineExclusionReason,
} from "@/lib/games/one-piece/booster-baseline";

// ---------------------------------------------------------------------------
// loadSealedDetail() — all Supabase access for the Terminal sealed detail page
// (spec §3.1 hero + §3.2 price history). Service-role only:
// market_index_snapshots is revoked for anon/authenticated, so set value and
// Value Ratio MUST be resolved here and travel to the client as props
// (spec §6 — load-bearing, not incidental).
//
// Population rule (D7 decision 1): the §3.4 top-10 tiles and the §3.5 Box EV
// rarity averages both run on the BOOSTER-BASELINE population — the shared
// classifier in @/lib/games/one-piece/booster-baseline, which strips promo /
// event / non-booster paper out of the printed_set_code population. SET VALUE
// stays the official snapshot figure; share figures are labeled as shares of
// the page-local baseline sum so the two cannot be misread as one number.
//
// One-source rule (spec §3.1): the range bar's endpoints AND marker all come
// from OUR OWN sealed_product_price_history rows — never sealed_products.ath /
// .atl, which may reflect a wider window than the history we can chart.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const PAGE_SIZE = 1000;

// -- date helpers (all UTC; price_date / snapshot_date are date strings) -----

function parseDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function dayToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "emperors-in-the-new-world-booster-box" → "Emperors In The New World Booster Box" */
export function sealedDetailTitle(slug: string): string {
  return decodeURIComponent(slug)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// -- public types (client imports these with `import type` only) -------------

export type SealedDetailPoint = {
  /** ISO date (UTC day). */
  date: string;
  price: number;
  /** Carry-forward OFFICIAL set value (v1, entity_type='set') at this date
      (spec §2.3) — null before the first snapshot ever. */
  setValue: number | null;
  /** Carry-forward BOOSTER-BASELINE value (v2, entity_type='set_baseline') —
      §2.3 carry-forward rules apply identically. */
  baselineValue: number | null;
  /** baselineValue / price — the ratio's numerator is the v2 BASELINE series,
      never setValue. Steps between snapshots — correct, not a bug (spec §2.3). */
  ratio: number | null;
};

export type SealedDetailProduct = {
  id: string;
  slug: string;
  name: string;
  productType: string;
  region: string;
  setCode: string | null;
  setName: string | null;
  releaseDate: string | null;
  imageUrl: string | null;
  msrpUsd: number | null;
  packsPerUnit: number | null;
  cardsPerPack: number | null;
};

export type SealedTopCard = {
  /** Canonical unique key AND the /card/[id] route param (CLAUDE.md §8). */
  cardImageId: string;
  name: string;
  cardNumber: string | null;
  /** cards.rarity, passed to RarityBadge verbatim — null renders no badge. */
  rarity: string | null;
  img: string | null;
  /** price_stats.tcg_market — the same per-card price /sets and /card display,
      and the same basis capture_market_index_snapshots sums into set value. */
  price: number;
  /** price_stats.chg_7d. */
  d7: number | null;
  /** price / baselineValue × 100 — share of the page-local booster-baseline
      sum (D7 decision 6), NOT of the stored set-value rollup. Labeled
      "OF BASELINE" in the UI so it cannot be misread as a snapshot share. */
  pctOfBaseline: number | null;
};

/** §3.4 promo callout — a card excluded from the booster baseline that would
    have placed in the top 10 had promos been ranked (D7 decision 6). */
export type SealedPromoCallout = {
  cardImageId: string;
  name: string;
  cardNumber: string | null;
  price: number;
  reason: BoosterBaselineExclusionReason;
};

/** §3.5 · one Box EV slot row (a pull_rates row priced over the baseline). */
export type BoxEvSlot = {
  /** pull_rates.slot_label — the ONLY rendering for the BULK row. */
  slotLabel: string;
  /** game_rarities.code, null for the BULK slot — null means "render plain
      text, never RarityBadge" (spec §3.5). */
  rarityCode: string | null;
  perBox: number;
  /** Avg tcg_market over the baseline cards of this slot's class — null when
      the class resolves zero priced cards (renders an em-dash, never 0). */
  avgPrice: number | null;
  /** perBox × avgPrice, rounded to cents BEFORE totalling so the rendered
      total equals the rendered sum exactly (spec §8: no rounding drift). */
  valuePerBox: number | null;
  /** valuePerBox / total × 100. */
  weightPct: number | null;
  confidence: "high" | "medium" | "low";
  /** Baseline cards backing avgPrice. */
  cardCount: number;
};

/** §3.5 · Box EV block. Null (section absent) when the set has no pull_rates
    rows — never headers-with-zeros (spec §3.5). */
export type BoxEv = {
  slots: BoxEvSlot[];
  /** Opening EV — sum of the slots' cents-rounded valuePerBox. */
  total: number;
  /** (boxPrice − total) / total × 100; positive = box costs more than its
      contents (spec §3.5 sign convention). Null without a box price. */
  premiumPct: number | null;
  /** D7 decision 5 (amended trigger): true only when the TOP slot by
      VALUE/BOX contribution has confidence='low' — not merely when any low
      slot exists. */
  caution: boolean;
};

export type SealedRank = {
  /** Competition rank by latest price among is_tracked products of the same
      game_id + product_type + region (spec §2.3). */
  rank: number;
  /** Products of that cohort that have at least one price row. */
  of: number;
};

export type SealedDetailData = {
  game: ReturnType<typeof gameResponsePayload>;
  product: SealedDetailProduct;
  /** Daily rows ascending — the client windows these per timeframe. */
  points: SealedDetailPoint[];
  latestPrice: number | null;
  latestPriceDate: string | null;
  /** Daily-row deltas: latest vs the last row at or before N days earlier. */
  d7: number | null;
  d30: number | null;
  d90: number | null;
  /** ATH / ATL from OUR OWN history rows only (spec §3.1 one-source rule). */
  ath: { price: number; date: string } | null;
  atl: { price: number; date: string } | null;
  atAth: boolean;
  /** (current − ath) / ath × 100 — 0 at ATH, negative below. */
  offAth: number | null;
  /** (current − msrp) / msrp × 100 — null while msrp_usd is null (today's normal). */
  vsMsrp: number | null;
  /** Carry-forward OFFICIAL set value (v1) at latestPriceDate — the hero fact. */
  setValue: number | null;
  /** BASELINE RATIO: v2 baseline carry-forward at latestPriceDate ÷ latest
      price. Labeled BASELINE RATIO in the facts row — not comparable to
      setValue-based figures. */
  valueRatio: number | null;
  /** Count of day-over-day price changes in the trailing 30 days of our rows. */
  priceActivity30d: number;
  /** Days since the last day-over-day price change; null when the price never moved. */
  lastMoveDays: number | null;
  latestSnapshotDate: string | null;
  /** §3.3 · mean of abs(w/w %) over the trailing 12 weeks of OUR rows — null
      below MIN_VOLATILITY_OBS observations (short series render an em-dash,
      never NaN). */
  volatility12w: number | null;
  /** How many w/w observations volatility12w averaged (0 for 1-point series). */
  volatilityObs: number;
  /** packs_per_unit × cards_per_pack — null today (both columns unseeded); the
      stat card hides on null (spec §9.2 pattern). */
  cardsPerBox: number | null;
  /** latest price / packs_per_unit — null while packs_per_unit is null. */
  pricePerPack: number | null;
  sealedRank: SealedRank | null;
  /** §3.4 · top 10 BOOSTER-BASELINE cards of this product's set, price desc
      (D7 decision 6 — promos/event cards never tile). */
  topCards: SealedTopCard[];
  top10Combined: number | null;
  /** Page-local sum of ALL baseline card prices (card_image_id-deduped,
      prices > 0). Computed per request from the already-fetched cards — NOT a
      stored rollup (the "no second rollup" rule covers storage; this is a
      display denominator). */
  baselineValue: number | null;
  /** top10Combined / baselineValue × 100 — labeled OF BASELINE VALUE. */
  top10Share: number | null;
  /** topCards[0].price / baselineValue × 100 — labeled OF BASELINE VALUE. */
  topCardShare: number | null;
  /** Excluded cards that would have placed in the unfiltered top 10 — the
      top 1–2, rendered as a clearly-labeled promo strip (D7 decision 6). */
  promoCallouts: SealedPromoCallout[];
  /** §3.5 · Box EV — null hides the section entirely. */
  boxEv: BoxEv | null;
};

// -- internal row shapes ------------------------------------------------------

type ProductQueryRow = {
  id: string;
  slug: string | null;
  name: string;
  display_name: string | null;
  product_type: string;
  region: string;
  set_id: string | null;
  release_date: string | null;
  msrp_usd: number | null;
  packs_per_unit: number | null;
  cards_per_pack: number | null;
  image_url: string | null;
  sets: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
};

type HistoryPoint = { day: number; price: number };

type SnapshotPoint = { day: number; value: number };

type TopCardQueryRow = {
  id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  game_payload: Record<string, unknown> | null;
  price_stats:
    | { tcg_market: number | null; chg_7d: number | null }
    | Array<{ tcg_market: number | null; chg_7d: number | null }>
    | null;
};

// -- derived-value helpers ----------------------------------------------------

/**
 * Carry-forward set value (spec §2.3): the latest snapshot with
 * snapshot_date ≤ the given day. Snapshots are sorted ascending. A step
 * function between captures — never blank, never a gap.
 */
function carryForward(snapshots: SnapshotPoint[], day: number): number | null {
  let found: number | null = null;
  for (const s of snapshots) {
    if (s.day > day) break;
    found = s.value;
  }
  return found;
}

/**
 * Delta of the latest daily price vs the last row at or before `nDays` earlier.
 *
 * Tolerance: when no row exists at or before the target date, fall back to the
 * earliest row iff it is within `toleranceDays` after the target. Without this,
 * the launch dataset (exactly 90 daily points — JustTCG's hard history ceiling)
 * would render the entire 90D figure as an em-dash: 90 days before the newest
 * row is one day before the oldest row. Same rule as the Phase D dashboard.
 */
function dailyDelta(rows: HistoryPoint[], nDays: number, toleranceDays: number): number | null {
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1];
  const target = latest.day - nDays * DAY_MS;
  let ref: HistoryPoint | null = null;
  for (const r of rows) {
    if (r.day > target) break;
    ref = r;
  }
  if (!ref && toleranceDays > 0) {
    const earliest = rows[0];
    if (earliest.day > target && earliest.day <= target + toleranceDays * DAY_MS) {
      ref = earliest;
    }
  }
  if (!ref || ref.price === 0 || ref.day === latest.day) return null;
  return ((latest.price - ref.price) / ref.price) * 100;
}

/**
 * §2.3 volatility_12w: mean of abs(w/w %) over the trailing 12 weeks of OUR
 * rows, anchored to the product's own last data day (never "today" — same
 * anchoring rule as every other window on this page).
 *
 * 13 weekly anchors sample the last price at or before each anchor day; a
 * w/w observation needs both ends resolvable, so anchors before the first row
 * drop out naturally. Fewer than MIN_VOLATILITY_OBS observations → null, and
 * the stat card renders an em-dash (the 6 provider-stale tracked cases,
 * terminal-detail-notes §1, include a 1-point series — never NaN). Carried
 * (unrepriced) weeks contribute honest 0% swings.
 */
const MIN_VOLATILITY_OBS = 4;

function volatility12w(rows: HistoryPoint[]): { value: number | null; obs: number } {
  if (rows.length < 2) return { value: null, obs: 0 };
  const latestDay = rows[rows.length - 1].day;
  const samples: Array<number | null> = [];
  for (let w = 12; w >= 0; w--) {
    const anchor = latestDay - w * 7 * DAY_MS;
    let px: number | null = null;
    for (const r of rows) {
      if (r.day > anchor) break;
      px = r.price;
    }
    samples.push(px);
  }
  const swings: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev != null && cur != null && prev !== 0) {
      swings.push(Math.abs((cur - prev) / prev) * 100);
    }
  }
  if (swings.length < MIN_VOLATILITY_OBS) return { value: null, obs: swings.length };
  return { value: swings.reduce((s, v) => s + v, 0) / swings.length, obs: swings.length };
}

/** Liquidity read from our own rows — no provider field needed at render time. */
function priceActivity(rows: HistoryPoint[]): { moves30d: number; lastMoveDays: number | null } {
  if (rows.length < 2) return { moves30d: 0, lastMoveDays: null };
  const latestDay = rows[rows.length - 1].day;
  const windowStart = latestDay - 30 * DAY_MS;
  let moves30d = 0;
  let lastMoveDay: number | null = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].price !== rows[i - 1].price) {
      lastMoveDay = rows[i].day;
      if (rows[i].day > windowStart) moves30d++;
    }
  }
  return {
    moves30d,
    lastMoveDays: lastMoveDay == null ? null : Math.round((latestDay - lastMoveDay) / DAY_MS),
  };
}

// -- loader -------------------------------------------------------------------

async function loadSealedDetailUncached(options: {
  slug: string;
  game?: string | null;
  publicOnly?: boolean;
}): Promise<SealedDetailData | null> {
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, options.game, {
    defaultToOnePiece: true,
    publicOnly: options.publicOnly,
  });
  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }
  const game: GameScope = gameResult.game;

  const slug = decodeURIComponent(options.slug).toLowerCase();

  // 1. The product, by slug (unique per game via uq_sealed_products_game_slug).
  // The sets embed must name the composite FK — two FKs exist between
  // sealed_products and sets (plain set_id + the v49 composite), so a bare
  // `sets ( … )` embed fails with PGRST201 (ambiguous).
  const { data: productRows, error: productError } = await supabase
    .from("sealed_products")
    .select(
      `
      id,
      slug,
      name,
      display_name,
      product_type,
      region,
      set_id,
      release_date,
      msrp_usd,
      packs_per_unit,
      cards_per_pack,
      image_url,
      sets!sealed_products_set_game_fk ( code, name )
    `
    )
    .eq("game_id", game.id)
    .eq("region", "en")
    .eq("is_tracked", true)
    .eq("slug", slug)
    .limit(1);

  if (productError) throw new Error(productError.message);
  const productRow = (productRows?.[0] as unknown as ProductQueryRow) ?? null;
  if (!productRow) return null; // unknown slug → caller renders notFound()

  // 2. Daily price history for this product, ascending.
  // NOTE: sealed_product_price_history has NO region column (verified live) —
  // the region axis lives on sealed_products, so game_id is the full filter.
  const history: HistoryPoint[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sealed_product_price_history")
        .select("price_date, price")
        .eq("game_id", game.id)
        .eq("sealed_product_id", productRow.id)
        .order("price_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data as Array<{ price_date: string; price: number | null }>) {
        if (row.price == null) continue;
        history.push({ day: parseDay(row.price_date), price: row.price });
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // 3. Snapshot series for this product's set, ascending — BOTH series, kept
  // strictly apart (docs/investigations/set-value-v2.md):
  //   'set'          → snapshots         (official SET VALUE: hero fact + overlay)
  //   'set_baseline' → baselineSnapshots (v2 — every ratio surface)
  // Service-role-only table — the only place these can be resolved (spec §6).
  async function fetchSetSeries(entityType: "set" | "set_baseline"): Promise<SnapshotPoint[]> {
    const series: SnapshotPoint[] = [];
    if (!productRow.set_id) return series;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("market_index_snapshots")
        .select("snapshot_date, index_value")
        .eq("game_id", game.id)
        .eq("region", "en")
        .eq("entity_type", entityType)
        .eq("set_id", productRow.set_id)
        .order("snapshot_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data as Array<{ snapshot_date: string; index_value: number | null }>) {
        if (row.index_value == null) continue;
        series.push({ day: parseDay(row.snapshot_date), value: row.index_value });
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return series;
  }
  const snapshots = await fetchSetSeries("set");
  const baselineSnapshots = await fetchSetSeries("set_baseline");
  const latestSnapshotDate =
    snapshots.length > 0 ? dayToIso(snapshots[snapshots.length - 1].day) : null;

  // 4. Compose the chart/table series — carry-forward per §2.3 for BOTH
  // series; the ratio divides the v2 baseline value, never the official one.
  const points: SealedDetailPoint[] = history.map((r) => {
    const setValue = carryForward(snapshots, r.day);
    const baselineValue = carryForward(baselineSnapshots, r.day);
    return {
      date: dayToIso(r.day),
      price: r.price,
      setValue,
      baselineValue,
      ratio: baselineValue != null && r.price !== 0 ? baselineValue / r.price : null,
    };
  });

  // 5. Hero derived values — all from our own rows (spec §3.1 one-source rule).
  const latest = history.length > 0 ? history[history.length - 1] : null;

  let ath: { price: number; date: string } | null = null;
  let atl: { price: number; date: string } | null = null;
  for (const r of history) {
    // >= / <= keep the LATEST occurrence of each extreme — more informative
    // for recency when a level is revisited.
    if (ath == null || r.price >= ath.price) ath = { price: r.price, date: dayToIso(r.day) };
    if (atl == null || r.price <= atl.price) atl = { price: r.price, date: dayToIso(r.day) };
  }

  const atAth = latest != null && ath != null && latest.price === ath.price;
  const offAth =
    latest != null && ath != null && ath.price !== 0
      ? ((latest.price - ath.price) / ath.price) * 100
      : null;

  const setValue = latest ? carryForward(snapshots, latest.day) : null;
  const latestBaselineValue = latest ? carryForward(baselineSnapshots, latest.day) : null;
  // BASELINE RATIO — v2 numerator only, never setValue.
  const valueRatio =
    latest && latest.price !== 0 && latestBaselineValue != null
      ? latestBaselineValue / latest.price
      : null;

  const vsMsrp =
    latest != null && productRow.msrp_usd != null && productRow.msrp_usd !== 0
      ? ((latest.price - productRow.msrp_usd) / productRow.msrp_usd) * 100
      : null;

  const { moves30d, lastMoveDays } = priceActivity(history);

  const setRelation = firstRelation(productRow.sets);

  // 6. §3.3 stats — volatility from our own rows; per-pack facts from catalog
  // columns (null today → the cards hide, spec §9.2).
  const { value: vol12w, obs: volObs } = volatility12w(history);

  const cardsPerBox =
    productRow.packs_per_unit != null && productRow.cards_per_pack != null
      ? productRow.packs_per_unit * productRow.cards_per_pack
      : null;

  const pricePerPack =
    latest != null && productRow.packs_per_unit != null && productRow.packs_per_unit > 0
      ? latest.price / productRow.packs_per_unit
      : null;

  // 7. SEALED RANK (spec §2.3): rank by latest price among is_tracked products
  // of the same game_id + product_type + region. Latest = each product's own
  // last history row, so provider-stale cohort members still rank on their
  // frozen tail rather than dropping out.
  let sealedRank: SealedRank | null = null;
  if (latest != null) {
    const { data: siblingRows, error: siblingError } = await supabase
      .from("sealed_products")
      .select("id")
      .eq("game_id", game.id)
      .eq("region", productRow.region)
      .eq("product_type", productRow.product_type)
      .eq("is_tracked", true);

    if (siblingError) throw new Error(siblingError.message);
    const siblingIds = ((siblingRows ?? []) as Array<{ id: string }>).map((r) => r.id);

    const latestBySibling = new Map<string, { day: number; price: number }>();
    if (siblingIds.length > 0) {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("sealed_product_price_history")
          .select("sealed_product_id, price_date, price")
          .eq("game_id", game.id)
          .in("sealed_product_id", siblingIds)
          .order("price_date", { ascending: true })
          .order("sealed_product_id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        for (const row of data as Array<{
          sealed_product_id: string;
          price_date: string;
          price: number | null;
        }>) {
          if (row.price == null) continue;
          const day = parseDay(row.price_date);
          const cur = latestBySibling.get(row.sealed_product_id);
          if (!cur || day >= cur.day) {
            latestBySibling.set(row.sealed_product_id, { day, price: row.price });
          }
        }

        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    const cohort = Array.from(latestBySibling.values());
    if (cohort.length > 0) {
      // Competition ranking — ties share a rank.
      const rank = 1 + cohort.filter((c) => c.price > latest.price).length;
      sealedRank = { rank, of: cohort.length };
    }
  }

  // 8. §3.4 top 10 + §3.5 pricing population — set membership is
  // printed_set_code == the product's set code (OP05: 137 by set_id vs 287 by
  // printed_set_code — CLAUDE.md §8), deduped on card_image_id (parallels
  // share card_number, never regex). Price basis is price_stats.tcg_market —
  // the same figure /sets and /card/[id] display (identical to Phase F).
  //
  // The fetched cards are then split by the SHARED booster-baseline classifier
  // (D7 decision 1): baseline cards feed the top-10 tiles, the baseline sum,
  // and the §3.5 rarity averages; excluded cards feed only the promo callout.
  const allCards: SealedTopCard[] = [];
  if (setRelation?.code) {
    const byImageId = new Map<string, SealedTopCard>();
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cards")
        .select(
          `
          id,
          card_image_id,
          card_number,
          name,
          rarity,
          image_url,
          image_url_small,
          game_payload,
          price_stats!price_stats_card_game_fk (
            tcg_market,
            chg_7d
          )
        `
        )
        .eq("game_id", game.id)
        .eq("region", "en")
        .eq("printed_set_code", setRelation.code)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const raw of data as unknown as TopCardQueryRow[]) {
        const card = withOnePiecePayloadFallbacks(raw as unknown as Record<string, unknown>);
        const ps = firstRelation(raw.price_stats);
        const price = ps?.tcg_market ?? null;
        const imageId = (card.card_image_id as string | null) ?? null;
        if (price == null || price <= 0 || !imageId) continue;

        const candidate: SealedTopCard = {
          cardImageId: imageId,
          name: (card.name as string) ?? "Unknown",
          cardNumber: (card.card_number as string | null) ?? null,
          rarity: (card.rarity as string | null) ?? null,
          img:
            (card.image_url_small as string | null) ?? (card.image_url as string | null) ?? null,
          price,
          d7: ps?.chg_7d ?? null,
          pctOfBaseline: null, // filled below once against the baseline sum
        };

        const cur = byImageId.get(imageId);
        if (!cur || candidate.price > cur.price) byImageId.set(imageId, candidate);
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    allCards.push(...Array.from(byImageId.values()).sort((a, b) => b.price - a.price));
  }

  // Split by the shared classifier — ONE rule for tiles, shares, and Box EV.
  const baselineCards: SealedTopCard[] = [];
  const excludedByReason = new Map<string, BoosterBaselineExclusionReason>();
  for (const c of allCards) {
    const verdict = classifyBoosterBaseline({
      cardImageId: c.cardImageId,
      name: c.name,
      rarity: c.rarity,
    });
    if (verdict.included) {
      baselineCards.push(c);
    } else if (verdict.reason) {
      excludedByReason.set(c.cardImageId, verdict.reason);
    }
  }

  // Tiles: top 10 of the BASELINE population (already price-desc).
  const topCards: SealedTopCard[] = baselineCards.slice(0, 10);

  // Promo callout: excluded cards that would have placed in the UNFILTERED
  // top 10 — show the top 1–2 (D7 decision 6).
  const promoCallouts: SealedPromoCallout[] = allCards
    .slice(0, 10)
    .filter((c) => excludedByReason.has(c.cardImageId))
    .slice(0, 2)
    .map((c) => ({
      cardImageId: c.cardImageId,
      name: c.name,
      cardNumber: c.cardNumber,
      price: c.price,
      reason: excludedByReason.get(c.cardImageId) as BoosterBaselineExclusionReason,
    }));

  // Share denominators are the page-local baseline sum, labeled OF BASELINE
  // VALUE in the UI. SET VALUE itself stays the official snapshot figure —
  // the two numbers coexist and must never be conflated (D7 decision 6).
  const baselineValue =
    baselineCards.length > 0 ? baselineCards.reduce((s, c) => s + c.price, 0) : null;
  for (const c of topCards) {
    c.pctOfBaseline =
      baselineValue != null && baselineValue > 0 ? (c.price / baselineValue) * 100 : null;
  }
  const top10Combined =
    topCards.length > 0 ? topCards.reduce((s, c) => s + c.price, 0) : null;
  const top10Share =
    top10Combined != null && baselineValue != null && baselineValue > 0
      ? (top10Combined / baselineValue) * 100
      : null;
  const topCardShare = topCards.length > 0 ? topCards[0].pctOfBaseline : null;

  // 9. §3.5 Box EV — pull_rates slots priced over the baseline population.
  // No rows → boxEv stays null and the section is absent entirely (no
  // headers, no zeros). The unique key caps this at one row per slot, so a
  // single query suffices (no pagination loop needed at ≤ ~10 rows).
  //
  // BOX products only: pull_rates carries per-BOX expectations, and the
  // premium compares the product's own price against the EV. On a
  // booster_box_case page that comparison would print case price vs box
  // contents — nonsense — so the section hides for every other product_type
  // (same clean-hide rule as a set with no rows).
  let boxEv: BoxEv | null = null;
  if (productRow.set_id && productRow.product_type === "booster_box") {
    // Two FKs exist between pull_rates and game_rarities (plain rarity_id +
    // the v40-style composite), so the embed must name one — same PGRST201
    // lesson as the sets embed in step 1.
    const { data: rateRows, error: ratesError } = await supabase
      .from("pull_rates")
      .select(
        `
        slot_label,
        per_box,
        confidence,
        sort_order,
        rarity_id,
        game_rarities!pull_rates_rarity_game_fk ( code )
      `
      )
      .eq("game_id", game.id)
      .eq("region", "en")
      .eq("set_id", productRow.set_id)
      .order("sort_order", { ascending: true });

    if (ratesError) throw new Error(ratesError.message);

    type PullRateRow = {
      slot_label: string;
      per_box: number | string;
      confidence: string;
      sort_order: number;
      rarity_id: string | null;
      game_rarities: { code: string | null } | Array<{ code: string | null }> | null;
    };

    if (rateRows && rateRows.length > 0) {
      // Rarity averages over the baseline population, prices > 0 only —
      // identical price basis and dedupe to the tiles above.
      const byRarity = new Map<string, { sum: number; n: number }>();
      const bulk = { sum: 0, n: 0 };
      for (const c of baselineCards) {
        if (!c.rarity) continue;
        if (isBulkRarity(c.rarity)) {
          bulk.sum += c.price;
          bulk.n += 1;
          continue;
        }
        const agg = byRarity.get(c.rarity) ?? { sum: 0, n: 0 };
        agg.sum += c.price;
        agg.n += 1;
        byRarity.set(c.rarity, agg);
      }

      const roundCents = (v: number) => Math.round(v * 100) / 100;

      const slots: BoxEvSlot[] = (rateRows as unknown as PullRateRow[]).map((row) => {
        const rarityCode =
          row.rarity_id == null ? null : firstRelation(row.game_rarities)?.code ?? null;
        const agg = rarityCode == null ? bulk : byRarity.get(rarityCode) ?? { sum: 0, n: 0 };
        const avgPrice = agg.n > 0 ? agg.sum / agg.n : null;
        const perBox = Number(row.per_box);
        // Cents-round each contribution BEFORE totalling — the rendered total
        // then equals the rendered column sum exactly (spec §8).
        const valuePerBox = avgPrice != null ? roundCents(perBox * avgPrice) : null;
        const confidence =
          row.confidence === "high" || row.confidence === "low" ? row.confidence : "medium";
        return {
          slotLabel: row.slot_label,
          rarityCode,
          perBox,
          avgPrice,
          valuePerBox,
          weightPct: null, // filled once the total is known
          confidence,
          cardCount: agg.n,
        };
      });

      const total = roundCents(
        slots.reduce((s, slot) => s + (slot.valuePerBox ?? 0), 0)
      );
      for (const slot of slots) {
        slot.weightPct =
          slot.valuePerBox != null && total > 0 ? (slot.valuePerBox / total) * 100 : null;
      }

      // Amended caution trigger (D7 decision 5): strip only when the TOP slot
      // by VALUE/BOX contribution is low-confidence.
      let topSlot: BoxEvSlot | null = null;
      for (const slot of slots) {
        if (slot.valuePerBox == null) continue;
        if (topSlot == null || slot.valuePerBox > (topSlot.valuePerBox ?? 0)) topSlot = slot;
      }
      const caution = topSlot?.confidence === "low";

      const premiumPct =
        latest != null && total > 0 ? ((latest.price - total) / total) * 100 : null;

      boxEv = { slots, total, premiumPct, caution };
    }
  }

  return {
    game: gameResponsePayload(game),
    product: {
      id: productRow.id,
      slug: productRow.slug ?? slug,
      name: productRow.display_name ?? productRow.name,
      productType: productRow.product_type,
      region: productRow.region,
      setCode: setRelation?.code ?? null,
      setName: setRelation?.name ?? null,
      releaseDate: productRow.release_date,
      imageUrl: productRow.image_url,
      msrpUsd: productRow.msrp_usd,
      packsPerUnit: productRow.packs_per_unit,
      cardsPerPack: productRow.cards_per_pack,
    },
    points,
    latestPrice: latest?.price ?? null,
    latestPriceDate: latest ? dayToIso(latest.day) : null,
    d7: dailyDelta(history, 7, 0),
    d30: dailyDelta(history, 30, 7),
    d90: dailyDelta(history, 90, 7),
    ath,
    atl,
    atAth,
    offAth,
    vsMsrp,
    setValue,
    valueRatio,
    priceActivity30d: moves30d,
    lastMoveDays,
    latestSnapshotDate,
    volatility12w: vol12w,
    volatilityObs: volObs,
    cardsPerBox,
    pricePerPack,
    sealedRank,
    topCards,
    top10Combined,
    baselineValue,
    top10Share,
    topCardShare,
    promoCallouts,
    boxEv,
  };
}

export async function loadSealedDetail(options: {
  slug: string;
  game?: string | null;
  publicOnly?: boolean;
}): Promise<SealedDetailData | null> {
  const publicOnly = options.publicOnly ?? !allowsPrivateGamePreview();
  // v4: set-value v2 — points carry baselineValue, ratio/valueRatio switch to
  // the v2 numerator. Bump on every shape change or the cache serves the old
  // shape stale.
  return cachedPublicData(
    publicDataCacheKey("terminal-sealed-detail-v4", options.game ?? "default", publicOnly, options.slug),
    () => loadSealedDetailUncached({ ...options, publicOnly }),
    CATALOG_DATA_TTL_SECONDS
  );
}

// -- static params helper -----------------------------------------------------

async function loadTrackedSealedSlugsUncached(options: {
  game?: string | null;
  publicOnly?: boolean;
}): Promise<string[]> {
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, options.game, {
    defaultToOnePiece: true,
    publicOnly: options.publicOnly,
  });
  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }
  const game: GameScope = gameResult.game;

  const slugs: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sealed_products")
      .select("slug")
      .eq("game_id", game.id)
      .eq("region", "en")
      .eq("is_tracked", true)
      .not("slug", "is", null)
      .order("slug")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ slug: string | null }>) {
      if (row.slug) slugs.push(row.slug);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return slugs;
}

/** Tracked product slugs for generateStaticParams on both route mirrors. */
export async function loadTrackedSealedSlugs(game?: string | null): Promise<string[]> {
  const publicOnly = !allowsPrivateGamePreview();
  return cachedPublicData(
    publicDataCacheKey("terminal-sealed-slugs", game ?? "default", publicOnly),
    () => loadTrackedSealedSlugsUncached({ game, publicOnly }),
    CATALOG_DATA_TTL_SECONDS
  );
}
