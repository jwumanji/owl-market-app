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
// loadSealedDetail() — all Supabase access for the Terminal sealed detail page
// (spec §3.1 hero + §3.2 price history). Service-role only:
// market_index_snapshots is revoked for anon/authenticated, so set value and
// Value Ratio MUST be resolved here and travel to the client as props
// (spec §6 — load-bearing, not incidental).
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
  /** Carry-forward set value at this date (spec §2.3) — null before the first snapshot ever. */
  setValue: number | null;
  /** setValue / price. Steps between snapshots — that is correct, not a bug (spec §2.3). */
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
  /** Carry-forward set value at latestPriceDate. */
  setValue: number | null;
  valueRatio: number | null;
  /** Count of day-over-day price changes in the trailing 30 days of our rows. */
  priceActivity30d: number;
  /** Days since the last day-over-day price change; null when the price never moved. */
  lastMoveDays: number | null;
  latestSnapshotDate: string | null;
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

  // 3. Set-value snapshots for this product's set, ascending. Service-role-only
  // table — this is the only place set value / Value Ratio can be resolved
  // (spec §6). latestSnapshotDate is asked game-wide so the footer can state
  // the capture date even when this set has no rows.
  const snapshots: SnapshotPoint[] = [];
  if (productRow.set_id) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("market_index_snapshots")
        .select("snapshot_date, index_value")
        .eq("game_id", game.id)
        .eq("region", "en")
        .eq("entity_type", "set")
        .eq("set_id", productRow.set_id)
        .order("snapshot_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const row of data as Array<{ snapshot_date: string; index_value: number | null }>) {
        if (row.index_value == null) continue;
        snapshots.push({ day: parseDay(row.snapshot_date), value: row.index_value });
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  const latestSnapshotDate =
    snapshots.length > 0 ? dayToIso(snapshots[snapshots.length - 1].day) : null;

  // 4. Compose the chart/table series — carry-forward set value per §2.3.
  const points: SealedDetailPoint[] = history.map((r) => {
    const setValue = carryForward(snapshots, r.day);
    return {
      date: dayToIso(r.day),
      price: r.price,
      setValue,
      ratio: setValue != null && r.price !== 0 ? setValue / r.price : null,
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
  const valueRatio =
    latest && latest.price !== 0 && setValue != null ? setValue / latest.price : null;

  const vsMsrp =
    latest != null && productRow.msrp_usd != null && productRow.msrp_usd !== 0
      ? ((latest.price - productRow.msrp_usd) / productRow.msrp_usd) * 100
      : null;

  const { moves30d, lastMoveDays } = priceActivity(history);

  const setRelation = firstRelation(productRow.sets);

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
  };
}

export async function loadSealedDetail(options: {
  slug: string;
  game?: string | null;
  publicOnly?: boolean;
}): Promise<SealedDetailData | null> {
  const publicOnly = options.publicOnly ?? !allowsPrivateGamePreview();
  return cachedPublicData(
    publicDataCacheKey("terminal-sealed-detail", options.game ?? "default", publicOnly, options.slug),
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
