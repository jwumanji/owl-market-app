import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchSoldListings } from "@/lib/scrapingdog-ebay";
import { parseGrade } from "@/lib/ebay-stats";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Priority rarities worth pulling eBay sold comps for. These are stored as
// plain strings on cards.rarity (see MarketsPageContent PREMIUM_RARITIES).
const PRIORITY_RARITIES = ["MR", "SP", "SEC", "GMR", "PROMO", "TR"];

// One card = one Scrapingdog call. Keep the default batch small so a run stays
// under maxDuration; chain further pages with ?offset=<nextOffset>.
const DEFAULT_CARD_LIMIT = 10;
const MAX_CARD_LIMIT = 60;
const CALL_DELAY_MS = 600;

// sync_state row key for the cron cursor (shared table with the JustTCG cursor).
const CURSOR_KEY = "ebay_sync_current";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

// Wrap an offset into [0, total). Guards against a stale cursor pointing past a
// shrunken card list.
function normalizeIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((Math.floor(index) % total) + total) % total;
}

// parseGrade (grader + numeric grade from a listing title) lives in
// @/lib/ebay-stats next to the raw/graded split that depends on its output.

// Parse Scrapingdog's sold-date string ("Sold Oct 12, 2024" / "Oct 12, 2024")
// into an ISO timestamp. Returns null on anything Date can't parse — we never
// invent a sold date.
function parseSoldDate(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^\s*sold\s+/i, "").trim();
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface CardRow {
  id: string;
  name: string | null;
  card_number: string | null;
  rarity: string | null;
}

interface EbaySaleUpsert {
  card_id: string;
  game_id: string;
  ebay_item_id: string;
  sale_price: number;
  currency: string;
  grader: string | null;
  grade: number | null;
  sale_type: string;
  condition: string | null;
  title: string | null;
  image_url: string | null;
  ebay_url: string | null;
  sold_at: string | null;
}

interface EbayCursorState {
  nextOffset?: number;
  totalCards?: number;
  completedCycles?: number;
  lastRunAt?: string;
  lastProcessed?: number;
  lastError?: string | null;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function readEbayCursor(
  supabase: ServiceClient
): Promise<{ state: EbayCursorState; error?: string }> {
  const { data, error } = await supabase
    .from("sync_state")
    .select("state")
    .eq("key", CURSOR_KEY)
    .maybeSingle();

  if (error) {
    const message = error.message ?? "sync_state read failed";
    if (error.code === "42P01" || message.includes("sync_state")) {
      return {
        state: {},
        error:
          "Missing sync_state table. Run schema-migration-v15-price-history-backfill.sql (or v16) in Supabase.",
      };
    }
    return { state: {}, error: message };
  }

  return { state: (data?.state ?? {}) as EbayCursorState };
}

async function writeEbayCursor(
  supabase: ServiceClient,
  state: EbayCursorState
): Promise<string | null> {
  const { error } = await supabase
    .from("sync_state")
    .upsert(
      { key: CURSOR_KEY, state, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  return error ? error.message ?? "sync_state write failed" : null;
}

// ---------------------------------------------------------------------------
// GET|POST /api/sync/ebay
//   ?limit=N    cards to process this run (default 10, max 60)
//   ?cursor=1   continue from the persisted cursor; advance & wrap to 0 at the
//               end of the priority-card list (used by the cron)
//   ?reset=1    (cursor mode) restart the cursor at offset 0
//   ?offset=N   stateless one-shot at an explicit offset (ignored in cursor mode)
//   ?secret=…   or Authorization: Bearer <CRON_SECRET>
// ---------------------------------------------------------------------------

async function syncEbay(request: Request) {
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

  if (!process.env.SCRAPINGDOG_API_KEY) {
    return NextResponse.json({ error: "SCRAPINGDOG_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const limit = clampInt(searchParams.get("limit"), DEFAULT_CARD_LIMIT, 1, MAX_CARD_LIMIT);
  const cursorMode = searchParams.get("cursor") === "1";
  const reset = searchParams.get("reset") === "1";

  // Resolve the starting offset. Cursor mode reads the persisted offset from
  // sync_state and counts the priority-card list so we can wrap at the end;
  // otherwise honor an explicit ?offset= (stateless one-shot).
  let startOffset: number;
  let totalCards: number | null = null;
  let cursorState: EbayCursorState = {};

  if (cursorMode) {
    const { count, error: countErr } = await supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id)
      .in("rarity", PRIORITY_RARITIES);
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    totalCards = count ?? 0;
    if (totalCards === 0) {
      return NextResponse.json({
        provider: "scrapingdog-ebay",
        game: game.slug,
        mode: "cursor",
        totalCards: 0,
        message: "No priority-rarity cards to sync.",
      });
    }

    const cursor = await readEbayCursor(supabase);
    if (cursor.error) {
      return NextResponse.json({ error: cursor.error }, { status: 500 });
    }
    cursorState = cursor.state;
    startOffset = reset ? 0 : normalizeIndex(cursorState.nextOffset ?? 0, totalCards);
  } else {
    startOffset = Math.max(0, clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER));
  }

  const { data: cards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, name, card_number, rarity")
    .eq("game_id", game.id)
    .in("rarity", PRIORITY_RARITIES)
    .order("id")
    .range(startOffset, startOffset + limit - 1);

  if (cardsErr) {
    return NextResponse.json({ error: cardsErr.message }, { status: 500 });
  }

  const cardList = (cards ?? []) as CardRow[];
  const errors: string[] = [];
  let cardsProcessed = 0;
  let salesUpserted = 0;
  let skippedLowPrice = 0;

  for (let i = 0; i < cardList.length; i++) {
    const card = cardList[i];
    const query = [card.name, card.card_number].filter(Boolean).join(" ").trim();
    if (!query) continue;

    // Rate-limit: delay between calls, not before the first or after the last.
    if (i > 0) await delay(CALL_DELAY_MS);

    try {
      const listings = await fetchSoldListings(query);

      // Dedupe by ebay_item_id within this card's batch — Postgres rejects an
      // ON CONFLICT upsert that touches the same conflict key twice.
      const byItemId = new Map<string, EbaySaleUpsert>();
      for (const listing of listings) {
        if (!listing.itemId) continue;
        const price = listing.extracted_price;
        if (price === null || price < 1) {
          if (price !== null) skippedLowPrice++;
          continue;
        }
        const { grader, grade, sale_type } = parseGrade(listing.title ?? "");
        byItemId.set(listing.itemId, {
          card_id: card.id,
          game_id: game.id,
          ebay_item_id: listing.itemId,
          sale_price: price,
          currency: "USD",
          grader,
          grade,
          sale_type,
          condition: listing.condition,
          title: listing.title || null,
          image_url: listing.image,
          ebay_url: listing.link,
          sold_at: parseSoldDate(listing.sold_date),
        });
      }

      const rows = Array.from(byItemId.values());
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("ebay_sales")
          .upsert(rows, { onConflict: "ebay_item_id" });
        if (upErr) errors.push(`${query}: ${upErr.message}`);
        else salesUpserted += rows.length;
      }
      cardsProcessed++;
    } catch (err) {
      errors.push(`${query}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Advance & persist the cursor (cursor mode only). Offset advances by the
  // number of cards FETCHED (not just those with a valid query) so skipped
  // rows aren't re-fetched forever; we wrap to 0 once the run reaches the end.
  let nextOffset: number | null;
  let wrapped = false;
  let completedCycles = cursorState.completedCycles ?? 0;

  if (cursorMode && totalCards !== null) {
    const advanced = startOffset + cardList.length;
    wrapped = cardList.length === 0 || advanced >= totalCards;
    nextOffset = wrapped ? 0 : advanced;
    if (wrapped) completedCycles += 1;

    const writeErr = await writeEbayCursor(supabase, {
      nextOffset,
      totalCards,
      completedCycles,
      lastRunAt: new Date().toISOString(),
      lastProcessed: cardsProcessed,
      lastError: errors.length > 0 ? errors[0] : null,
    });
    if (writeErr) errors.push(`cursor write: ${writeErr}`);
  } else {
    nextOffset = cardList.length === limit ? startOffset + limit : null;
  }

  return NextResponse.json({
    provider: "scrapingdog-ebay",
    game: game.slug,
    rarities: PRIORITY_RARITIES,
    mode: cursorMode ? "cursor" : "manual",
    startOffset,
    limit,
    totalCards,
    cardsProcessed,
    salesUpserted,
    skippedLowPrice,
    nextOffset,
    wrapped,
    completedCycles,
    errors: errors.length,
    errorSample: errors.slice(0, 10),
  });
}

export { syncEbay as GET, syncEbay as POST };
