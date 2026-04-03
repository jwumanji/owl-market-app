import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { JustTCG } from "justtcg-js";
import {
  SET_SLUG_MAP,
  extractVariantLabel,
} from "@/lib/justtcg-match";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Reverse map: internal code → first JustTCG set slug
const CODE_TO_SLUG: Record<string, string> = {};
for (const [slug, code] of Object.entries(SET_SLUG_MAP)) {
  if (!CODE_TO_SLUG[code]) CODE_TO_SLUG[code] = slug;
}

const GAME = "one-piece-card-game";

// ---------------------------------------------------------------------------
// GET|POST /api/sync/justtcg?sets=OP01  (ONE set per request)
//
// ?sets=OP01       → sync one set
// ?sets=OP01,OP02  → sync multiple (may timeout on Hobby)
// no sets param    → returns list of available set codes to sync
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

  // Fetch all sets from DB
  const { data: dbSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series")
    .order("code");

  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }

  const syncableSets = dbSets.filter((s) => s.code && CODE_TO_SLUG[s.code]);

  // If no sets param, return available sets (useful for chaining)
  const setsParam = searchParams.get("sets");
  if (!setsParam) {
    // For Vercel Cron: auto-chain through sets one at a time
    const indexParam = searchParams.get("_index");
    if (indexParam !== null || isVercelCron) {
      return await syncByIndex(request, syncableSets, parseInt(indexParam ?? "0", 10));
    }

    return NextResponse.json({
      message: "Provide ?sets=OP01 or use ?_index=0 to chain through all sets",
      available: syncableSets.map((s) => s.code),
      total: syncableSets.length,
    });
  }

  // Sync the specified set(s)
  const allowedCodes = setsParam.split(",").map((s) => s.trim().toUpperCase());
  const setsToSync = dbSets.filter(
    (s) => s.code && allowedCodes.includes(s.code)
  );

  const client = new JustTCG();
  const results: { code: string; updated: number; errors: string[] }[] = [];

  for (const dbSet of setsToSync) {
    const result = await syncOneSet(client, supabase, dbSet);
    results.push(result);
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
// syncByIndex — Vercel Cron auto-chain: sync set at index, then trigger next
// ---------------------------------------------------------------------------

async function syncByIndex(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncableSets: any[],
  index: number
) {
  if (index >= syncableSets.length) {
    return NextResponse.json({
      message: "All sets synced",
      total: syncableSets.length,
    });
  }

  const dbSet = syncableSets[index];
  const client = new JustTCG();
  const supabase = createServiceClient();
  const result = await syncOneSet(client, supabase, dbSet);

  // Trigger next set in the chain (fire-and-forget)
  const nextIndex = index + 1;
  if (nextIndex < syncableSets.length) {
    const baseUrl = new URL(request.url);
    baseUrl.searchParams.set("_index", String(nextIndex));

    fetch(baseUrl.toString(), {
      method: "GET",
      headers: request.headers,
    }).catch(() => {
      // fire-and-forget; if it fails the cron will pick up next time
    });
  }

  return NextResponse.json({
    current: `${index + 1}/${syncableSets.length}`,
    ...result,
    next: nextIndex < syncableSets.length ? syncableSets[nextIndex]?.code : null,
  });
}

// ---------------------------------------------------------------------------
// syncOneSet — sync a single set from JustTCG
// ---------------------------------------------------------------------------

interface DbCard {
  id: string;
  card_number: string | null;
  name: string | null;
  variant_label: string | null;
}

async function syncOneSet(
  client: JustTCG,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSet: any
): Promise<{ code: string; updated: number; errors: string[] }> {
  const setCode = dbSet.code;
  const justTcgSlug = CODE_TO_SLUG[setCode];

  if (!justTcgSlug) {
    return { code: setCode, updated: 0, errors: ["No JustTCG slug mapping"] };
  }

  const setErrors: string[] = [];
  let updatedCount = 0;

  // Pre-load ALL cards for this set in one query
  const { data: allDbCards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, card_number, name, variant_label")
    .eq("set_id", dbSet.id);

  if (cardsErr) {
    return { code: setCode, updated: 0, errors: [cardsErr.message] };
  }

  // Build lookup maps (in-memory, zero DB queries per card)
  const byNumber = new Map<string, DbCard[]>();
  const byNameLower = new Map<string, DbCard[]>();

  for (const card of (allDbCards ?? []) as DbCard[]) {
    if (card.card_number) {
      const arr = byNumber.get(card.card_number) ?? [];
      arr.push(card);
      byNumber.set(card.card_number, arr);
    }
    if (card.name) {
      const key = card.name.toLowerCase();
      const arr = byNameLower.get(key) ?? [];
      arr.push(card);
      byNameLower.set(key, arr);
    }
  }

  try {
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

      const priceUpserts: PriceUpsert[] = [];
      const historyInserts: HistoryInsert[] = [];

      for (const jtCard of cards) {
        try {
          matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts);
        } catch (err) {
          setErrors.push(
            `Card ${jtCard.name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Deduplicate by card_id (keep last entry — higher price variant wins)
      const dedupedPrices = Array.from(
        new Map(priceUpserts.map((p) => [p.card_id, p])).values()
      );

      if (dedupedPrices.length > 0) {
        const { error: upErr } = await supabase
          .from("price_stats")
          .upsert(dedupedPrices, { onConflict: "card_id" });
        if (upErr) setErrors.push(`price_stats batch: ${upErr.message}`);
        else updatedCount += dedupedPrices.length;
      }

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

  return { code: setCode, updated: updatedCount, errors: setErrors };
}

// ---------------------------------------------------------------------------
// Types
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
// matchAndCollect — match JustTCG card to DB card using in-memory maps
// ---------------------------------------------------------------------------

function matchAndCollect(
  jtCard: JTCard,
  byNumber: Map<string, DbCard[]>,
  byNameLower: Map<string, DbCard[]>,
  priceUpserts: PriceUpsert[],
  historyInserts: HistoryInsert[]
): void {
  const nmVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing === "Normal"
  );
  const foilVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing !== "Normal"
  );

  if (!nmVariant && !foilVariant) return;

  // Match by card number first (most reliable)
  if (jtCard.number) {
    const dbCards = byNumber.get(jtCard.number);
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
  const baseName = jtCard.name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  const nameMatches = byNameLower.get(baseName);

  if (nameMatches && nameMatches.length > 0) {
    const target =
      nameMatches.find((c) => (c.variant_label ?? null) === variantLabel) ??
      nameMatches[0];

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
