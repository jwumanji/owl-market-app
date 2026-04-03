import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { JustTCG } from "justtcg-js";
import {
  SET_SLUG_MAP,
  extractVariantLabel,
} from "@/lib/justtcg-match";

// Reverse map: internal code → first JustTCG set slug
const CODE_TO_SLUG: Record<string, string> = {};
for (const [slug, code] of Object.entries(SET_SLUG_MAP)) {
  if (!CODE_TO_SLUG[code]) CODE_TO_SLUG[code] = slug;
}

// Game identifier for JustTCG
const GAME = "one-piece-card-game";

// ---------------------------------------------------------------------------
// POST|GET /api/sync/justtcg — pull latest prices from JustTCG and upsert to DB
// Vercel Cron triggers GET; manual triggers can use POST.
// ---------------------------------------------------------------------------

async function syncPrices(request: Request) {
  // Verify Vercel Cron or token auth
  const isVercelCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const hasTokenAuth = process.env.SYNC_SECRET && token === process.env.SYNC_SECRET;

  if (process.env.CRON_SECRET && !isVercelCron && !hasTokenAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const client = new JustTCG(); // reads JUSTTCG_API_KEY from env

  // 1. Fetch all sets from our DB
  const { data: dbSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series")
    .order("code");

  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }

  // Optional: limit to specific sets via query param (e.g. ?sets=OP01,OP02)
  const setsParam = searchParams.get("sets");
  const allowedCodes = setsParam
    ? setsParam.split(",").map((s) => s.trim().toUpperCase())
    : null;

  const setsToSync = allowedCodes
    ? dbSets.filter((s) => s.code && allowedCodes.includes(s.code))
    : dbSets;

  const results: { code: string; updated: number; errors: string[] }[] = [];

  // 2. Process each set
  for (const dbSet of setsToSync) {
    const setCode = dbSet.code;
    if (!setCode) continue;

    const justTcgSlug = CODE_TO_SLUG[setCode];
    if (!justTcgSlug) {
      results.push({ code: setCode, updated: 0, errors: ["No JustTCG slug mapping"] });
      continue;
    }

    // The set ID for JustTCG is the slug itself
    const setErrors: string[] = [];
    let updatedCount = 0;

    try {
      // Paginate through all cards in the set
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await client.v1.cards.get({
          game: GAME,
          set: justTcgSlug,
          include_statistics: ["30d"],
          include_null_prices: false,
          limit,
          offset,
        });

        const cards = response.data;
        if (!cards || cards.length === 0) break;

        // 3. Process each card from JustTCG
        for (const jtCard of cards) {
          try {
            const count = await processCard(supabase, jtCard, dbSet.id);
            updatedCount += count;
          } catch (err) {
            setErrors.push(
              `Card ${jtCard.name}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        hasMore = response.pagination?.hasMore ?? false;
        offset += limit;
      }
    } catch (err) {
      setErrors.push(
        `Set fetch failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    results.push({ code: setCode, updated: updatedCount, errors: setErrors });
  }

  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  return NextResponse.json({
    synced: totalUpdated,
    errors: totalErrors,
    sets: results,
  });
}

// ---------------------------------------------------------------------------
// processCard — match a JustTCG card to our DB and upsert price data
// ---------------------------------------------------------------------------

interface JTCard {
  id: string;
  name: string;
  game: string;
  set: string;
  setName?: string;
  number: string | null;
  rarity: string | null;
  variants: JTVariant[];
}

interface JTVariant {
  id: string;
  condition: string;
  printing: string;
  price: number;
  lastUpdated: number;
  priceChange24hr?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  avgPrice?: number | null;
  avgPrice30d?: number | null;
  minPrice7d?: number | null;
  maxPrice7d?: number | null;
  minPrice30d?: number | null;
  maxPrice30d?: number | null;
  minPriceAllTime?: number | null;
  minPriceAllTimeDate?: string | null;
  maxPriceAllTime?: number | null;
  maxPriceAllTimeDate?: string | null;
}

async function processCard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jtCard: JTCard,
  setId: string
): Promise<number> {
  // Find the Near Mint, Normal printing variant as the primary price
  const nmVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing === "Normal"
  );

  // Also check for foil/alternate art variant
  const foilVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing !== "Normal"
  );

  if (!nmVariant && !foilVariant) return 0;

  // Try to match by card number first (most reliable), then by name
  const cardNumber = jtCard.number;
  let updatedCount = 0;

  if (cardNumber) {
    // Match by card_number within this set
    const { data: dbCards } = await supabase
      .from("cards")
      .select("id, name, variant_label")
      .eq("set_id", setId)
      .eq("card_number", cardNumber);

    if (dbCards && dbCards.length > 0) {
      // If we have multiple DB cards for the same number (base + variants),
      // match NM/Normal to the base card, foil to the variant
      for (const dbCard of dbCards) {
        const variant = dbCard.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;

        if (variant) {
          await upsertPrice(supabase, dbCard.id, variant);
          updatedCount++;
        }
      }
      return updatedCount;
    }
  }

  // Fallback: match by name within this set
  const variantLabel = extractVariantLabel(jtCard.name);
  const baseName = jtCard.name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

  const { data: nameMatches } = await supabase
    .from("cards")
    .select("id, variant_label")
    .eq("set_id", setId)
    .ilike("name", baseName);

  if (nameMatches && nameMatches.length > 0) {
    // Match variant labels
    const target = nameMatches.find(
      (c: { variant_label: string | null }) =>
        (c.variant_label ?? null) === variantLabel
    ) ?? nameMatches[0];

    const variant = nmVariant ?? foilVariant;
    if (variant) {
      await upsertPrice(supabase, target.id, variant);
      updatedCount++;
    }
  }

  return updatedCount;
}

// ---------------------------------------------------------------------------
// upsertPrice — write price_stats + price_history for a card
// ---------------------------------------------------------------------------

async function upsertPrice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cardId: string,
  variant: JTVariant
): Promise<void> {
  const now = new Date().toISOString();

  // Upsert price_stats
  await supabase
    .from("price_stats")
    .upsert(
      {
        card_id: cardId,
        tcg_market: variant.price,
        tcg_low: variant.minPrice30d ?? variant.minPrice7d ?? null,
        tcg_mid: variant.avgPrice30d ?? variant.avgPrice ?? null,
        tcg_high: variant.maxPrice30d ?? variant.maxPrice7d ?? null,
        market_avg: variant.avgPrice30d ?? variant.avgPrice ?? variant.price,
        chg_1d: variant.priceChange24hr ?? null,
        chg_7d: variant.priceChange7d ?? null,
        chg_30d: variant.priceChange30d ?? null,
        ath: variant.maxPriceAllTime ?? null,
        ath_date: variant.maxPriceAllTimeDate ?? null,
        atl: variant.minPriceAllTime ?? null,
        atl_date: variant.minPriceAllTimeDate ?? null,
        updated_at: now,
      },
      { onConflict: "card_id" }
    );

  // Insert price_history snapshot
  await supabase.from("price_history").insert({
    card_id: cardId,
    tcg_market: variant.price,
    market_avg: variant.avgPrice30d ?? variant.avgPrice ?? variant.price,
    recorded_at: now,
  });
}

// ---------------------------------------------------------------------------
// Route exports — GET for Vercel Cron, POST for manual triggers
// ---------------------------------------------------------------------------

export { syncPrices as GET, syncPrices as POST };
