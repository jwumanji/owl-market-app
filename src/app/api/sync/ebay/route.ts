import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";
import { fetchSoldListings } from "@/lib/scrapingdog-ebay";

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

// Extract grader + numeric grade from a listing title, e.g.
//   "2023 PSA 10 Monkey D Luffy OP01-024"   → { grader: "PSA", grade: 10 }
//   "One Piece BGS 9.5 Shanks Manga Rare"    → { grader: "BGS", grade: 9.5 }
//   "Luffy OP01-024 Alt Art NM"              → { grader: null, grade: null }
function parseGrade(title: string): {
  grader: string | null;
  grade: number | null;
  sale_type: string;
} {
  const match = title.match(
    /\b(PSA|BGS|CGC|SGC|TAG|ACE)\s*[- ]?\s*(10(?:\.0)?|\d(?:\.5)?)\b/i
  );
  if (match) {
    return {
      grader: match[1].toUpperCase(),
      grade: Number(match[2]),
      sale_type: "graded",
    };
  }
  return { grader: null, grade: null, sale_type: "raw" };
}

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

// ---------------------------------------------------------------------------
// GET|POST /api/sync/ebay
//   ?limit=N    cards to process this run (default 10, max 60)
//   ?offset=N   starting offset into the priority-rarity card list
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
  const offset = Math.max(0, clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER));

  const { data: cards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, name, card_number, rarity")
    .eq("game_id", game.id)
    .in("rarity", PRIORITY_RARITIES)
    .order("id")
    .range(offset, offset + limit - 1);

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

  const returnedFullPage = cardList.length === limit;
  return NextResponse.json({
    provider: "scrapingdog-ebay",
    game: game.slug,
    rarities: PRIORITY_RARITIES,
    offset,
    limit,
    cardsProcessed,
    salesUpserted,
    skippedLowPrice,
    nextOffset: returnedFullPage ? offset + limit : null,
    errors: errors.length,
    errorSample: errors.slice(0, 10),
  });
}

export { syncEbay as GET, syncEbay as POST };
