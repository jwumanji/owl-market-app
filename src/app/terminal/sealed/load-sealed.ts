import { createCachedServiceClient } from "@/lib/supabase-server";
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

// ---------------------------------------------------------------------------
// loadSealedDashboard() — all Supabase access for the Terminal sealed
// dashboard (spec §4). Service-role only: market_index_snapshots is revoked
// for anon/authenticated, so set value and Value Ratio MUST be resolved here
// and travel to the client as props (spec §6 — load-bearing, not incidental).
//
// Storage is daily rows; WEEKLY | MONTHLY is a query-time rollup computed
// here — last price in each period — never a second storage format (spec §2.2).
// ---------------------------------------------------------------------------

const PERIOD_COUNT = 12;
const DAY_MS = 86_400_000;
const PAGE_SIZE = 1000;

// -- date helpers (all UTC; price_date / snapshot_date are date strings) -----

function parseDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function dayToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function weekLabel(ms: number): string {
  return new Date(ms)
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit" })
    .toUpperCase();
}

function monthLabel(ms: number): string {
  return new Date(ms)
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "2-digit" })
    .toUpperCase();
}

// -- public types (client imports these with `import type` only) -------------

export type SealedPeriodSeries = {
  /** Last daily price in each of the 12 periods, oldest → newest. */
  prices: (number | null)[];
  /** Step delta % vs the immediately previous period (null when either side is missing). */
  deltas: (number | null)[];
  /** Carry-forward set value at each period's end (spec §2.3). */
  setValues: (number | null)[];
  /** setValues[i] / prices[i]. */
  ratios: (number | null)[];
  /** Step delta % of the ratio vs the previous period. */
  ratioDeltas: (number | null)[];
};

export type SealedProductRow = {
  id: string;
  slug: string | null;
  name: string;
  productType: string;
  setCode: string | null;
  setName: string | null;
  releaseDate: string | null;
  imageUrl: string | null;
  msrpUsd: number | null;
  packsPerUnit: number | null;
  latestPrice: number | null;
  latestPriceDate: string | null;
  /** Daily-row deltas: latest vs the last row at or before N days earlier. */
  d7: number | null;
  d30: number | null;
  d90: number | null;
  /** Monthly-rollup deltas: current month-end vs 1 / 3 / 11 months back. */
  mom: number | null;
  m3: number | null;
  m12: number | null;
  /** ATH from OUR OWN history rows only — never sealed_products.ath (spec §3.1). */
  ath: number | null;
  atAth: boolean;
  /** (current − ath) / ath × 100 — 0 at ATH, negative below. */
  offAth: number | null;
  /** Carry-forward set value at latestPriceDate. */
  setValue: number | null;
  valueRatio: number | null;
  /** Rank by latest price among is_tracked, same game + product_type + region (spec §2.3). */
  sealedRank: number | null;
  /** Count of day-over-day price changes in the trailing 30 days of our rows. */
  priceActivity30d: number;
  /** Days since the last day-over-day price change; null when the price never moved. */
  lastMoveDays: number | null;
  weekly: SealedPeriodSeries;
  monthly: SealedPeriodSeries;
};

export type SealedDashboardData = {
  game: ReturnType<typeof gameResponsePayload>;
  products: SealedProductRow[];
  /** 12 period-end labels, oldest → newest ("MAY 09" …). */
  weeklyLabels: string[];
  /** 12 calendar-month labels, oldest → newest ("AUG 25" …). */
  monthlyLabels: string[];
  /**
   * Whether entity_type='set' snapshots exist for this game AT ALL. False is
   * the spec §4 second empty state: hide the VALUE RATIO chip and columns
   * entirely — the metric does not exist for this game yet.
   */
  hasSetSnapshots: boolean;
  latestPriceDate: string | null;
  latestSnapshotDate: string | null;
};

// -- internal row shapes ------------------------------------------------------

type ProductQueryRow = {
  id: string;
  slug: string | null;
  name: string;
  display_name: string | null;
  product_type: string;
  set_id: string | null;
  release_date: string | null;
  msrp_usd: number | null;
  packs_per_unit: number | null;
  image_url: string | null;
  sets: { code: string | null; name: string | null } | Array<{ code: string | null; name: string | null }> | null;
};

type HistoryPoint = { day: number; price: number };

type SnapshotPoint = { day: number; value: number };

// -- derived-value helpers ----------------------------------------------------

/**
 * Carry-forward set value (spec §2.3): the latest snapshot with
 * snapshot_date ≤ the given day. Snapshots are sorted ascending.
 */
function carryForward(snapshots: SnapshotPoint[] | undefined, day: number): number | null {
  if (!snapshots || snapshots.length === 0) return null;
  let found: number | null = null;
  for (const s of snapshots) {
    if (s.day > day) break;
    found = s.value;
  }
  return found;
}

function stepDelta(series: (number | null)[], i: number): number | null {
  if (i === 0) return null;
  const cur = series[i];
  const prev = series[i - 1];
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/**
 * Delta of the latest daily price vs the last row at or before `nDays` earlier.
 *
 * Tolerance: when no row exists at or before the target date, fall back to the
 * earliest row iff it is within `toleranceDays` after the target. Without this,
 * the launch dataset (exactly 90 daily points — JustTCG's hard history ceiling,
 * spec §7) would render the entire 90D column as em-dashes: 90 days before the
 * newest row is one day before the oldest row.
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

// -- period rollups -----------------------------------------------------------

/**
 * PERIOD SEMANTICS (the "weeks end per ISO or last-day-with-data" decision):
 *
 * Weekly periods are trailing 7-day windows anchored to the LATEST price_date
 * present in the dataset — not ISO weeks. Window i (0 = oldest, 11 = newest)
 * covers [anchor − (12−i)·7 + 1 day, anchor − (11−i)·7]; the newest window
 * always ends on the last day that actually has data. ISO weeks would leave
 * the newest column as a partial week — and when ingestion pauses (the daily
 * cron is not deployed yet; data may be frozen at 2026-07-26) the current ISO
 * week would eventually be empty. Anchoring to last-day-with-data keeps the
 * newest column meaningful under both conditions.
 *
 * Monthly periods are calendar months (UTC), ending with the month containing
 * the anchor. The value of every period is the LAST daily price inside it —
 * a query-time rollup, per spec §2.2.
 */
function weeklyWindowEnds(anchor: number): number[] {
  return Array.from({ length: PERIOD_COUNT }, (_, i) => anchor - (PERIOD_COUNT - 1 - i) * 7 * DAY_MS);
}

function monthlyWindows(anchor: number): Array<{ start: number; end: number }> {
  const d = new Date(anchor);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return Array.from({ length: PERIOD_COUNT }, (_, i) => {
    const offset = -(PERIOD_COUNT - 1 - i);
    return {
      start: Date.UTC(y, m + offset, 1),
      end: Date.UTC(y, m + offset + 1, 0), // day 0 of the next month = last day of this one
    };
  });
}

function rollupWeekly(rows: HistoryPoint[], ends: number[]): (number | null)[] {
  const prices: (number | null)[] = Array(PERIOD_COUNT).fill(null);
  const windowStart = ends[0] - 6 * DAY_MS;
  for (const r of rows) {
    if (r.day < windowStart || r.day > ends[PERIOD_COUNT - 1]) continue;
    const idx = Math.floor((r.day - windowStart) / (7 * DAY_MS));
    if (idx >= 0 && idx < PERIOD_COUNT) prices[idx] = r.price; // rows are ascending — last wins
  }
  return prices;
}

function rollupMonthly(rows: HistoryPoint[], windows: Array<{ start: number; end: number }>): (number | null)[] {
  const prices: (number | null)[] = Array(PERIOD_COUNT).fill(null);
  for (const r of rows) {
    for (let i = 0; i < PERIOD_COUNT; i++) {
      if (r.day >= windows[i].start && r.day <= windows[i].end) {
        prices[i] = r.price; // ascending — last wins
        break;
      }
    }
  }
  return prices;
}

function buildSeries(
  prices: (number | null)[],
  periodEndDays: number[],
  snapshots: SnapshotPoint[] | undefined
): SealedPeriodSeries {
  const setValues = periodEndDays.map((end) => carryForward(snapshots, end));
  const ratios = prices.map((p, i) => {
    const sv = setValues[i];
    if (p == null || p === 0 || sv == null) return null;
    return sv / p;
  });
  return {
    prices,
    deltas: prices.map((_, i) => stepDelta(prices, i)),
    setValues,
    ratios,
    ratioDeltas: ratios.map((_, i) => stepDelta(ratios, i)),
  };
}

// -- liquidity reads (from our own rows — no provider field needed) -----------

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

async function loadSealedDashboardUncached(options: {
  game?: string | null;
  publicOnly?: boolean;
}): Promise<SealedDashboardData> {
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, options.game, {
    defaultToOnePiece: true,
    publicOnly: options.publicOnly,
  });
  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }
  const game: GameScope = gameResult.game;

  // 1. Tracked products. The sets embed must name the composite FK — two FKs
  // exist between sealed_products and sets (plain set_id + the v40 composite).
  const products: ProductQueryRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sealed_products")
        .select(
          `
          id,
          slug,
          name,
          display_name,
          product_type,
          set_id,
          release_date,
          msrp_usd,
          packs_per_unit,
          image_url,
          sets!sealed_products_set_game_fk ( code, name )
        `
        )
        .eq("game_id", game.id)
        .eq("region", "en")
        .eq("is_tracked", true)
        .order("name")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      products.push(...(data as unknown as ProductQueryRow[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  const productIds = products.map((p) => p.id);
  const setIds = Array.from(new Set(products.map((p) => p.set_id).filter((v): v is string => v != null)));

  // 2. Daily price history for tracked products.
  // NOTE: sealed_product_price_history has NO region column (verified live) —
  // the region axis lives on sealed_products, so game_id is the full filter here.
  const historyByProduct = new Map<string, HistoryPoint[]>();
  let latestPriceDay: number | null = null;
  if (productIds.length > 0) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sealed_product_price_history")
        .select("sealed_product_id, price_date, price")
        .eq("game_id", game.id)
        .in("sealed_product_id", productIds)
        .order("sealed_product_id", { ascending: true })
        .order("price_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data as Array<{ sealed_product_id: string; price_date: string; price: number | null }>) {
        if (row.price == null) continue;
        const day = parseDay(row.price_date);
        const list = historyByProduct.get(row.sealed_product_id) ?? [];
        list.push({ day, price: row.price });
        historyByProduct.set(row.sealed_product_id, list);
        if (latestPriceDay == null || day > latestPriceDay) latestPriceDay = day;
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // 3. Set-value snapshots for the tracked products' sets. Service-role-only
  // table — this is the only place Value Ratio can be resolved (spec §6).
  const snapshotsBySet = new Map<string, SnapshotPoint[]>();
  if (setIds.length > 0) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("market_index_snapshots")
        .select("set_id, snapshot_date, index_value")
        .eq("game_id", game.id)
        .eq("region", "en")
        .eq("entity_type", "set")
        .in("set_id", setIds)
        .order("snapshot_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data as Array<{ set_id: string | null; snapshot_date: string; index_value: number | null }>) {
        if (!row.set_id || row.index_value == null) continue;
        const list = snapshotsBySet.get(row.set_id) ?? [];
        list.push({ day: parseDay(row.snapshot_date), value: row.index_value });
        snapshotsBySet.set(row.set_id, list);
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // 4. Does this game have set snapshots AT ALL? Asked game-wide (not just the
  // tracked products' sets) so the spec §4 second empty state fires only when
  // the metric genuinely does not exist for the game yet. One snapshot date is
  // the normal launch state — carry-forward handles it; this flag is only
  // about zero.
  const { data: anySnapshot, error: anySnapshotError } = await supabase
    .from("market_index_snapshots")
    .select("snapshot_date")
    .eq("game_id", game.id)
    .eq("region", "en")
    .eq("entity_type", "set")
    .order("snapshot_date", { ascending: false })
    .limit(1);

  if (anySnapshotError) throw new Error(anySnapshotError.message);
  const latestSnapshotDate = anySnapshot?.[0]?.snapshot_date ?? null;
  const hasSetSnapshots = latestSnapshotDate != null;

  // 5. Period scaffolding, anchored to the last day WITH data — never "today"
  // (the daily cron is not deployed; assuming today has a row would shift
  // every window onto empty days).
  const anchor = latestPriceDay ?? Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const weekEnds = weeklyWindowEnds(anchor);
  const monthWindows = monthlyWindows(anchor);
  const monthEnds = monthWindows.map((w) => w.end);

  // 6. Compose product rows.
  const rows: SealedProductRow[] = products.map((p) => {
    const history = historyByProduct.get(p.id) ?? [];
    const snapshots = p.set_id ? snapshotsBySet.get(p.set_id) : undefined;
    const latest = history.length > 0 ? history[history.length - 1] : null;

    const weeklyPrices = rollupWeekly(history, weekEnds);
    const monthlyPrices = rollupMonthly(history, monthWindows);
    const weekly = buildSeries(weeklyPrices, weekEnds, snapshots);
    const monthly = buildSeries(monthlyPrices, monthEnds, snapshots);

    let ath: number | null = null;
    for (const r of history) {
      if (ath == null || r.price > ath) ath = r.price;
    }
    const atAth = latest != null && ath != null && latest.price === ath;
    const offAth = latest != null && ath != null && ath !== 0 ? ((latest.price - ath) / ath) * 100 : null;

    const setValue = latest ? carryForward(snapshots, latest.day) : null;
    const valueRatio = latest && latest.price !== 0 && setValue != null ? setValue / latest.price : null;

    const { moves30d, lastMoveDays } = priceActivity(history);

    const setRelation = firstRelation(p.sets);

    return {
      id: p.id,
      slug: p.slug,
      name: p.display_name ?? p.name,
      productType: p.product_type,
      setCode: setRelation?.code ?? null,
      setName: setRelation?.name ?? null,
      releaseDate: p.release_date,
      imageUrl: p.image_url,
      msrpUsd: p.msrp_usd,
      packsPerUnit: p.packs_per_unit,
      latestPrice: latest?.price ?? null,
      latestPriceDate: latest ? dayToIso(latest.day) : null,
      d7: dailyDelta(history, 7, 0),
      d30: dailyDelta(history, 30, 7),
      d90: dailyDelta(history, 90, 7),
      mom: monthDelta(monthlyPrices, 1),
      m3: monthDelta(monthlyPrices, 3),
      m12: monthDelta(monthlyPrices, 11),
      ath,
      atAth,
      offAth,
      setValue,
      valueRatio,
      sealedRank: null, // assigned below, needs the full population
      priceActivity30d: moves30d,
      lastMoveDays,
      weekly,
      monthly,
    };
  });

  // 7. sealed_rank — rank by latest price among is_tracked, same game +
  // product_type + region (spec §2.3). Region is constant 'en' here.
  const byType = new Map<string, SealedProductRow[]>();
  for (const row of rows) {
    const list = byType.get(row.productType) ?? [];
    list.push(row);
    byType.set(row.productType, list);
  }
  for (const list of byType.values()) {
    const ranked = list
      .filter((r) => r.latestPrice != null)
      .sort((a, b) => (b.latestPrice ?? 0) - (a.latestPrice ?? 0));
    ranked.forEach((r, i) => {
      r.sealedRank = i + 1;
    });
  }

  return {
    game: gameResponsePayload(game),
    products: rows,
    weeklyLabels: weekEnds.map(weekLabel),
    monthlyLabels: monthEnds.map(monthLabel),
    hasSetSnapshots,
    latestPriceDate: latestPriceDay != null ? dayToIso(latestPriceDay) : null,
    latestSnapshotDate,
  };
}

/** Current month-end vs `n` periods back on the monthly rollup (M/M, 3M, 12M). */
function monthDelta(monthlyPrices: (number | null)[], n: number): number | null {
  const cur = monthlyPrices[PERIOD_COUNT - 1];
  const prev = monthlyPrices[PERIOD_COUNT - 1 - n];
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export async function loadSealedDashboard(options: {
  game?: string | null;
  publicOnly?: boolean;
} = {}): Promise<SealedDashboardData> {
  const publicOnly = options.publicOnly ?? !allowsPrivateGamePreview();
  return cachedPublicData(
    publicDataCacheKey("terminal-sealed-dashboard", options.game ?? "default", publicOnly),
    () => loadSealedDashboardUncached({ ...options, publicOnly }),
    CATALOG_DATA_TTL_SECONDS
  );
}
