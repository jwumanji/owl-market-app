import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchViaScrapfly } from "@/lib/scrapfly";
import { yuyuteiSetUrl, parseYuyuteiListing } from "@/lib/yuyutei";
import { buildJpCardMatcher, type MatchCardRow } from "@/lib/jp-card-match";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Yuyu-tei uses lowercase set codes that match our OP/EB/PRB booster codes.
const SET_CODE_PATTERN = /^(OP|EB|PRB)\d+$/i;

// One set page = one Scrapfly call (all cards + prices in one static fetch).
const DEFAULT_SET_LIMIT = 2;
const MAX_SET_LIMIT = 6;
const CALL_DELAY_MS = 500;

const CURSOR_KEY = "jp_prices_sync_current";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((Math.floor(index) % total) + total) % total;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SetRow {
  code: string;
  name: string | null;
}

interface JpPriceUpsert {
  game_id: string;
  card_id: string | null;
  card_image_id: string | null;
  source: string;
  source_card_id: string;
  source_url: string;
  set_code: string;
  card_number: string;
  card_name: string;
  rarity: string;
  variant: string;
  price_jpy: number | null;
  in_stock: boolean;
  image_url: string | null;
  match_method: string;
  snapshot_date: string;
  raw: unknown;
}

interface CursorState {
  nextOffset?: number;
  totalSets?: number;
  completedCycles?: number;
  lastRunAt?: string;
  lastProcessed?: number;
  lastError?: string | null;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error?.code === "42P01" || error?.message?.includes("jp_prices"));
}

async function readCursor(supabase: ServiceClient): Promise<{ state: CursorState; error?: string }> {
  const { data, error } = await supabase
    .from("sync_state")
    .select("state")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  if (error) {
    const message = error.message ?? "sync_state read failed";
    if (error.code === "42P01" || message.includes("sync_state")) {
      return { state: {}, error: "Missing sync_state table. Run schema-migration-v15/v16 in Supabase." };
    }
    return { state: {}, error: message };
  }
  return { state: (data?.state ?? {}) as CursorState };
}

async function writeCursor(supabase: ServiceClient, state: CursorState): Promise<string | null> {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: CURSOR_KEY, state, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? error.message ?? "sync_state write failed" : null;
}

// Page through all catalog cards once so the matcher can be built in memory.
async function loadAllCards(supabase: ServiceClient, gameId: string): Promise<MatchCardRow[]> {
  const all: MatchCardRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, card_image_id, card_number, name, variant_label, rarity")
      .eq("game_id", gameId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`loadAllCards: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as MatchCardRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ---------------------------------------------------------------------------
// GET|POST /api/sync/jp-prices
//   ?limit=N    sets to process this run (default 2, max 6)
//   ?cursor=1   continue from the persisted cursor; advance & wrap at the end
//   ?reset=1    (cursor mode) restart at set index 0
//   ?offset=N   stateless one-shot at an explicit set index (ignored in cursor mode)
//   ?secret=…   or Authorization: Bearer <CRON_SECRET>
// ---------------------------------------------------------------------------

async function syncJpPrices(request: Request) {
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

  if (!process.env.SCRAPFLY_API_KEY) {
    return NextResponse.json({ error: "SCRAPFLY_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // Build the Yuyu-tei-compatible set list from our catalog.
  const { data: setsData, error: setsErr } = await supabase
    .from("sets")
    .select("code, name")
    .eq("game_id", game.id)
    .order("code");
  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }
  const setList = ((setsData ?? []) as SetRow[]).filter((s) => s.code && SET_CODE_PATTERN.test(s.code));
  const totalSets = setList.length;
  if (totalSets === 0) {
    return NextResponse.json({ provider: "scrapfly-yuyutei", game: game.slug, totalSets: 0, message: "No OP/EB/PRB sets found." });
  }

  const limit = clampInt(searchParams.get("limit"), DEFAULT_SET_LIMIT, 1, MAX_SET_LIMIT);
  const cursorMode = searchParams.get("cursor") === "1";
  const reset = searchParams.get("reset") === "1";

  let startOffset: number;
  let cursorState: CursorState = {};
  if (cursorMode) {
    const cursor = await readCursor(supabase);
    if (cursor.error) return NextResponse.json({ error: cursor.error }, { status: 500 });
    cursorState = cursor.state;
    startOffset = reset ? 0 : normalizeIndex(cursorState.nextOffset ?? 0, totalSets);
  } else {
    startOffset = normalizeIndex(clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER), totalSets);
  }

  const setsToProcess = setList.slice(startOffset, startOffset + limit);

  // Build the matcher once for the whole run.
  const matcher = buildJpCardMatcher(await loadAllCards(supabase, game.id));
  const snapshotDate = todayUtc();

  const errors: string[] = [];
  const perSet: Array<{
    code: string;
    parsed: number;
    matched: number;
    unmatched: number;
    upserted: number;
    error?: string;
  }> = [];
  let missingTable = false;

  for (let i = 0; i < setsToProcess.length; i++) {
    const set = setsToProcess[i];
    if (i > 0) await delay(CALL_DELAY_MS);

    const stat = { code: set.code, parsed: 0, matched: 0, unmatched: 0, upserted: 0 } as (typeof perSet)[number];
    try {
      const html = await fetchViaScrapfly(yuyuteiSetUrl(set.code), { asp: true, country: "jp" });
      const listings = parseYuyuteiListing(html);
      stat.parsed = listings.length;

      const byId = new Map<string, JpPriceUpsert>();
      for (const row of listings) {
        const m = matcher.match(row.cardNumber, row.variant);
        if (m) stat.matched++;
        else stat.unmatched++;
        byId.set(row.sourceCardId, {
          game_id: game.id,
          card_id: m?.card.id ?? null,
          card_image_id: m?.card.card_image_id ?? null,
          source: "yuyutei",
          source_card_id: row.sourceCardId,
          source_url: row.sourceUrl,
          set_code: set.code,
          card_number: row.cardNumber,
          card_name: row.name,
          rarity: row.rarity,
          variant: row.variant,
          price_jpy: row.priceJpy,
          in_stock: row.inStock,
          image_url: row.imageUrl,
          match_method: m?.method ?? "unmatched",
          snapshot_date: snapshotDate,
          raw: row,
        });
      }

      const rows = Array.from(byId.values());
      if (rows.length > 0 && !missingTable) {
        const { error: upErr } = await supabase
          .from("jp_prices")
          .upsert(rows, { onConflict: "source,source_card_id,snapshot_date" });
        if (upErr) {
          if (isMissingTableError(upErr)) {
            missingTable = true;
            stat.error = "jp_prices table missing — run schema-migration-v44-jp-prices.sql";
          } else {
            stat.error = upErr.message;
            errors.push(`${set.code}: ${upErr.message}`);
          }
        } else {
          stat.upserted = rows.length;
        }
      }
    } catch (err) {
      stat.error = err instanceof Error ? err.message : String(err);
      errors.push(`${set.code}: ${stat.error}`);
    }
    perSet.push(stat);
  }

  // Advance & persist the cursor (cursor mode only); wrap to 0 at the end.
  let nextOffset: number | null;
  let wrapped = false;
  let completedCycles = cursorState.completedCycles ?? 0;
  const processed = setsToProcess.length;

  if (cursorMode) {
    const advanced = startOffset + processed;
    wrapped = processed === 0 || advanced >= totalSets;
    nextOffset = wrapped ? 0 : advanced;
    if (wrapped) completedCycles += 1;
    const writeErr = await writeCursor(supabase, {
      nextOffset,
      totalSets,
      completedCycles,
      lastRunAt: new Date().toISOString(),
      lastProcessed: processed,
      lastError: errors[0] ?? null,
    });
    if (writeErr) errors.push(`cursor write: ${writeErr}`);
  } else {
    nextOffset = startOffset + processed < totalSets ? startOffset + processed : null;
  }

  const totals = perSet.reduce(
    (acc, s) => ({
      parsed: acc.parsed + s.parsed,
      matched: acc.matched + s.matched,
      unmatched: acc.unmatched + s.unmatched,
      upserted: acc.upserted + s.upserted,
    }),
    { parsed: 0, matched: 0, unmatched: 0, upserted: 0 }
  );

  return NextResponse.json({
    provider: "scrapfly-yuyutei",
    game: game.slug,
    mode: cursorMode ? "cursor" : "manual",
    snapshotDate,
    catalogCards: matcher.size,
    startOffset,
    limit,
    totalSets,
    processedSets: processed,
    setsProcessed: setsToProcess.map((s) => s.code),
    ...totals,
    nextOffset,
    wrapped,
    completedCycles,
    missingTable,
    migrationHint: missingTable ? "Apply schema-migration-v44-jp-prices.sql in Supabase, then re-run." : undefined,
    errors: errors.length,
    errorSample: errors.slice(0, 8),
    perSet,
  });
}

export { syncJpPrices as GET, syncJpPrices as POST };
