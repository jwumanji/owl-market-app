import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { ONE_PIECE_JUSTTCG_GAME_SLUG } from "@/lib/games/one-piece";

// The full-refresh run (4 provider requests + ~30 chunked upserts of ~1000
// rows) measured ~115s locally against the live DB. 60s would time out
// mid-upsert in production; /api/warm already runs at 300 on this plan.
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// GET|POST /api/sync/sealed-prices?game=one_piece
//
// Sealed price ingestion for Moon Terminal (spec §7, phases plan §2·C2).
//
// The daily job and the backfill are the SAME code path: every run fetches the
// full sealed catalog with 90 days of {p, t} daily history (4 requests at
// today's 364 products) and upserts every provider-reported point, keyed on
// (sealed_product_id, price_date) — constraint
// sealed_product_price_history_product_day_key. First run = 90-day backfill;
// later runs = incremental top-up; a missed cron day self-heals on the next
// run. Only provider-observed points are written, so a stale product (old
// lastUpdated, priceHistory null) contributes no manufactured rows — the
// flat-history trap in CLAUDE.md §9 cannot occur.
//
// Writes ONLY sealed_product_price_history. The sealed_products price columns
// (tcg_price, market_avg, chg_*, ath, atl, price_updated_at) belong to the
// out-of-repo Codex writer — two writers on one column set is how silent
// clobbering starts.
//
// Error discipline (two live defects in this repo motivated this — the eBay
// cursor-marches-through-outage bug and the JP writeCursor-last bug):
//   - There is NO cursor and NO sync_state row. The only stored state is the
//     history rows themselves, and the upsert is idempotent.
//   - All provider fetches complete BEFORE the first DB write. A provider-wide
//     failure (401/403/429/5xx/timeout) aborts the run with nothing written.
//     403 from JustTCG is quota exhaustion (SUBSCRIPTION_REQUIRED), not a
//     lapsed plan — see CLAUDE.md §9.
//   - Per-product anomalies (no variant, unparsable points) are counted and
//     reported in the response body, never fatal.
//   - Products in the API feed with no sealed_products row are counted and
//     skipped (catalog reconcile is a separate concern).
// ---------------------------------------------------------------------------

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10; // 364 products today = 4 pages; guard against runaway
const FETCH_TIMEOUT_MS = 15_000;
const UPSERT_CHUNK = 1000;
const HISTORY_CONFLICT = "sealed_product_id,price_date";
const SOURCE = "justtcg";

interface JTPricePoint {
  p: number;
  t: number; // Unix seconds, UTC midnight per observed payload
}

interface JTSealedVariant {
  id: string;
  condition: string;
  printing: string;
  language: string | null;
  price: number | null;
  lastUpdated: number | null; // Unix seconds
  priceHistory: JTPricePoint[] | null;
}

interface JTSealedProduct {
  id: string;
  name: string;
  set: string | null;
  set_name: string | null;
  variants: JTSealedVariant[];
}

interface SealedProductRow {
  id: string;
  game_id: string;
  external_ref: string | null;
  justtcg_id: string | null;
}

interface HistoryUpsert {
  game_id: string;
  sealed_product_id: string;
  source: string;
  price: number;
  price_date: string;
  // {p, t} points carry no low/market-low field (verified against the live
  // payload 2026-07-26) — low_price stays null on justtcg rows.
  low_price: null;
  source_updated_at: string | null;
  // JustTCG exposes no sellers/listings/quantity on sealed variants
  // (findings §3). Reserved for a possible eBay-sourced future.
  sellers: null;
}

class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function utcDateOf(unixSeconds: number): string | null {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  const d = new Date(unixSeconds * 1000);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchSealedPage(apiKey: string, offset: number): Promise<{
  data: JTSealedProduct[];
  hasMore: boolean;
}> {
  const url =
    `${JUSTTCG_BASE}/cards?game=${ONE_PIECE_JUSTTCG_GAME_SLUG}` +
    `&condition=Sealed&include_price_history=true&priceHistoryDuration=90d` +
    `&limit=${PAGE_LIMIT}&offset=${offset}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure / timeout — provider-wide by definition.
    throw new ProviderError(0, `JustTCG fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const hint =
      res.status === 403
        ? " (SUBSCRIPTION_REQUIRED = daily quota exhausted, not a lapsed plan — CLAUDE.md §9)"
        : res.status === 401
          ? " (INVALID_API_KEY — bad key)"
          : "";
    throw new ProviderError(res.status, `JustTCG ${res.status}${hint}: ${body}`);
  }

  const json = (await res.json()) as {
    data?: JTSealedProduct[];
    meta?: { hasMore?: boolean };
    pagination?: { hasMore?: boolean };
  };
  return {
    data: json.data ?? [],
    hasMore: Boolean(json.meta?.hasMore ?? json.pagination?.hasMore),
  };
}

async function loadSealedProducts(
  supabase: ReturnType<typeof createServiceClient>,
  gameId: string
): Promise<SealedProductRow[]> {
  const all: SealedProductRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sealed_products")
      .select("id, game_id, external_ref, justtcg_id")
      .eq("game_id", gameId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`loadSealedProducts: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as SealedProductRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function countHistoryRows(
  supabase: ReturnType<typeof createServiceClient>,
  gameId: string
): Promise<number | null> {
  const { count, error } = await supabase
    .from("sealed_product_price_history")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  return error ? null : count;
}

async function syncSealedPrices(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  const isAuthorized =
    request.headers.get("authorization") === `Bearer ${cronSecret}` ||
    searchParams.get("secret") === cronSecret;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.JUSTTCG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "JUSTTCG_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  // Requires ?game=… and rejects anything that isn't one_piece (the JustTCG
  // adapter is One Piece-only today).
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // -------------------------------------------------------------------------
  // Phase 1 — fetch the ENTIRE provider feed before touching the database.
  // A provider-wide failure lands here and aborts with zero rows written.
  // -------------------------------------------------------------------------
  const feed: JTSealedProduct[] = [];
  let requests = 0;
  try {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, hasMore } = await fetchSealedPage(apiKey, offset);
      requests++;
      feed.push(...data);
      if (!hasMore) break;
      offset += PAGE_LIMIT;
    }
  } catch (err) {
    const providerStatus = err instanceof ProviderError ? err.status : null;
    return NextResponse.json(
      {
        game: game.slug,
        provider: SOURCE,
        error: err instanceof Error ? err.message : String(err),
        providerStatus,
        requests,
        aborted: "provider-wide failure before any write",
      },
      { status: 502 }
    );
  }

  // -------------------------------------------------------------------------
  // Phase 2 — match against sealed_products and build history rows.
  // -------------------------------------------------------------------------
  let products: SealedProductRow[];
  try {
    products = await loadSealedProducts(supabase, game.id);
  } catch (err) {
    return NextResponse.json(
      { game: game.slug, provider: SOURCE, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const productByRef = new Map<string, SealedProductRow>();
  for (const row of products) {
    if (row.external_ref) productByRef.set(row.external_ref, row);
    if (row.justtcg_id) productByRef.set(row.justtcg_id, row);
  }

  const anomalies: string[] = [];
  let unknownProducts = 0;
  let productsWithHistory = 0;
  let productsWithoutHistory = 0;
  let pointsSeen = 0;

  // Whole-batch dedupe on the conflict key: Postgres rejects an upsert batch
  // touching the same (sealed_product_id, price_date) twice. Later points win
  // (points arrive oldest→newest, so same-day duplicates resolve to the last).
  const rowsByKey = new Map<string, HistoryUpsert>();

  for (const item of feed) {
    const product = productByRef.get(item.id);
    if (!product) {
      unknownProducts++;
      continue;
    }

    const variant = item.variants?.[0];
    if (!variant) {
      anomalies.push(`${item.id}: no variants in payload`);
      continue;
    }

    const points = variant.priceHistory ?? [];
    if (points.length === 0) {
      // Stale product — provider reported no points in the window. Writing
      // anything here would manufacture flat history (CLAUDE.md §9).
      productsWithoutHistory++;
      continue;
    }
    productsWithHistory++;

    const sourceUpdatedAt =
      variant.lastUpdated && Number.isFinite(variant.lastUpdated)
        ? new Date(variant.lastUpdated * 1000).toISOString()
        : null;

    let badPoints = 0;
    for (const point of points) {
      pointsSeen++;
      const priceDate = utcDateOf(point?.t);
      const price = typeof point?.p === "number" && Number.isFinite(point.p) && point.p > 0 ? point.p : null;
      if (!priceDate || price === null) {
        badPoints++;
        continue;
      }
      rowsByKey.set(`${product.id}|${priceDate}`, {
        game_id: product.game_id,
        sealed_product_id: product.id,
        source: SOURCE,
        price,
        price_date: priceDate,
        low_price: null,
        source_updated_at: sourceUpdatedAt,
        sellers: null,
      });
    }
    if (badPoints > 0) anomalies.push(`${item.id}: ${badPoints} unparsable history point(s)`);
  }

  const rows = Array.from(rowsByKey.values());

  // -------------------------------------------------------------------------
  // Phase 3 — idempotent upsert, chunked. Counts before/after make every
  // response self-reporting: a re-run shows newRows ≈ 0.
  // -------------------------------------------------------------------------
  const historyRowsBefore = await countHistoryRows(supabase, game.id);

  let rowsUpserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("sealed_product_price_history")
      .upsert(chunk, { onConflict: HISTORY_CONFLICT });
    if (error) {
      // Database-wide failure: stop here rather than marching on. Rows already
      // upserted are idempotent and will be re-covered by the next run.
      return NextResponse.json(
        {
          game: game.slug,
          provider: SOURCE,
          error: `history upsert: ${error.message}`,
          rowsUpserted,
          rowsPlanned: rows.length,
          historyRowsBefore,
        },
        { status: 500 }
      );
    }
    rowsUpserted += chunk.length;
  }

  const historyRowsAfter = await countHistoryRows(supabase, game.id);
  const distinctDates = new Set(rows.map((r) => r.price_date)).size;

  return NextResponse.json({
    game: game.slug,
    provider: SOURCE,
    mode: "full-refresh-90d",
    requests,
    productsInFeed: feed.length,
    matchedProducts: feed.length - unknownProducts,
    unknownProducts,
    productsWithHistory,
    productsWithoutHistory,
    pointsSeen,
    rowsUpserted,
    distinctDates,
    historyRowsBefore,
    historyRowsAfter,
    newRows:
      historyRowsBefore !== null && historyRowsAfter !== null
        ? historyRowsAfter - historyRowsBefore
        : null,
    anomalies: anomalies.length,
    anomalySample: anomalies.slice(0, 8),
    durationMs: Date.now() - startedAt,
  });
}

export { syncSealedPrices as GET, syncSealedPrices as POST };
