import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { JustTCG } from "justtcg-js";
import {
  SET_SLUG_MAP,
  extractVariantLabel,
} from "@/lib/justtcg-match";

// Vercel Pro allows up to 300s
export const maxDuration = 300;

// Reverse map: internal code → first JustTCG set slug
const CODE_TO_SLUG: Record<string, string> = {};
for (const [slug, code] of Object.entries(SET_SLUG_MAP)) {
  if (!CODE_TO_SLUG[code]) CODE_TO_SLUG[code] = slug;
}

const GAME = "one-piece-card-game";

// ---------------------------------------------------------------------------
// GET|POST /api/sync/justtcg?sets=OP01  (one set per request for reliability)
//
// For cron: chains through all sets automatically using ?_index param
// ---------------------------------------------------------------------------

async function syncPrices(request: Request) {
  // Auth check
  const isVercelCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const hasTokenAuth =
    process.env.SYNC_SECRET && token === process.env.SYNC_SECRET;

  if (process.env.CRON_SECRET && !isVercelCron && !hasTokenAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const client = new JustTCG();

  // Fetch all sets from DB
  const { data: dbSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series")
    .order("code");

  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }

  // Determine which sets to sync
  const setsParam = searchParams.get("sets");
  const allowedCodes = setsParam
    ? setsParam.split(",").map((s) => s.trim().toUpperCase())
    : null;

  const setsToSync = allowedCodes
    ? dbSets.filter((s) => s.code && allowedCodes.includes(s.code))
    : dbSets.filter((s) => s.code && CODE_TO_SLUG[s.code]);

  const results: { code: string; updated: number; errors: string[] }[] = [];

  for (const dbSet of setsToSync) {
    const setCode = dbSet.code;
    if (!setCode) continue;

    const justTcgSlug = CODE_TO_SLUG[setCode];
    if (!justTcgSlug) {
      results.push({
        code: setCode,
        updated: 0,
        errors: ["No JustTCG slug mapping"],
      });
      continue;
    }

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

        // Batch: collect all upserts for this page
        const priceUpserts: PriceUpsert[] = [];
        const historyInserts: HistoryInsert[] = [];

        for (const jtCard of cards) {
          try {
            await collectPriceData(
              supabase,
              jtCard,
              dbSet.id,
              priceUpserts,
              historyInserts
            );
          } catch (err) {
            setErrors.push(
              `Card ${jtCard.name}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Batch upsert price_stats
        if (priceUpserts.length > 0) {
          const { error: upErr } = await supabase
            .from("price_stats")
            .upsert(priceUpserts, { onConflict: "card_id" });
          if (upErr) setErrors.push(`price_stats batch: ${upErr.message}`);
          else updatedCount += priceUpserts.length;
        }

        // Batch insert price_history
        if (historyInserts.length > 0) {
          const { error: hiErr } = await supabase
            .from("price_history")
            .insert(historyInserts);
          if (hiErr) setErrors.push(`price_history batch: ${hiErr.message}`);
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
// Types for batch operations
// ---------------------------------------------------------------------------

interface PriceUpsert {
  card_id: string;
  tcg_market: number;
  tcg_low: number | null;
  tcg_mid: number | null;
  tcg_high: number | null;
  market_avg: number;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  updated_at: string;
}

interface HistoryInsert {
  card_id: string;
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

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

// ---------------------------------------------------------------------------
// collectPriceData — match a JustTCG card and add to batch arrays
// ---------------------------------------------------------------------------

async function collectPriceData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jtCard: JTCard,
  setId: string,
  priceUpserts: PriceUpsert[],
  historyInserts: HistoryInsert[]
): Promise<void> {
  const nmVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing === "Normal"
  );
  const foilVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing !== "Normal"
  );

  if (!nmVariant && !foilVariant) return;

  const cardNumber = jtCard.number;

  if (cardNumber) {
    const { data: dbCards } = await supabase
      .from("cards")
      .select("id, name, variant_label")
      .eq("set_id", setId)
      .eq("card_number", cardNumber);

    if (dbCards && dbCards.length > 0) {
      for (const dbCard of dbCards) {
        const variant = dbCard.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;
        if (variant) {
          addToBatch(dbCard.id, variant, priceUpserts, historyInserts);
        }
      }
      return;
    }
  }

  // Fallback: match by name
  const variantLabel = extractVariantLabel(jtCard.name);
  const baseName = jtCard.name.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const { data: nameMatches } = await supabase
    .from("cards")
    .select("id, variant_label")
    .eq("set_id", setId)
    .ilike("name", baseName);

  if (nameMatches && nameMatches.length > 0) {
    const target =
      nameMatches.find(
        (c: { variant_label: string | null }) =>
          (c.variant_label ?? null) === variantLabel
      ) ?? nameMatches[0];

    const variant = nmVariant ?? foilVariant;
    if (variant) {
      addToBatch(target.id, variant, priceUpserts, historyInserts);
    }
  }
}

function addToBatch(
  cardId: string,
  variant: JTVariant,
  priceUpserts: PriceUpsert[],
  historyInserts: HistoryInsert[]
): void {
  const now = new Date().toISOString();

  priceUpserts.push({
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
  });

  historyInserts.push({
    card_id: cardId,
    tcg_market: variant.price,
    market_avg: variant.avgPrice30d ?? variant.avgPrice ?? variant.price,
    recorded_at: now,
  });
}

// ---------------------------------------------------------------------------
// Route exports
// ---------------------------------------------------------------------------

export { syncPrices as GET, syncPrices as POST };
