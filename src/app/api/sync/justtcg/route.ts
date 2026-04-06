import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { JustTCG } from "justtcg-js";
import {
  SET_SLUG_MAP,
  extractVariantLabel,
  classifyRarity,
} from "@/lib/justtcg-match";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Reverse map: internal code → all JustTCG set slugs
const CODE_TO_SLUGS: Record<string, string[]> = {};
for (const [slug, code] of Object.entries(SET_SLUG_MAP)) {
  if (!CODE_TO_SLUGS[code]) CODE_TO_SLUGS[code] = [];
  CODE_TO_SLUGS[code].push(slug);
}
// Compat: single-slug lookup (first match)
const CODE_TO_SLUG: Record<string, string> = {};
for (const [code, slugs] of Object.entries(CODE_TO_SLUGS)) {
  CODE_TO_SLUG[code] = slugs[0];
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
  const isVercelCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const { searchParams } = new URL(request.url);

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
  rarity: string | null;
}

async function syncOneSet(
  client: JustTCG,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSet: any
): Promise<{ code: string; updated: number; errors: string[] }> {
  const setCode = dbSet.code;
  const justTcgSlugs = CODE_TO_SLUGS[setCode];

  if (!justTcgSlugs || justTcgSlugs.length === 0) {
    return { code: setCode, updated: 0, errors: ["No JustTCG slug mapping"] };
  }

  const setErrors: string[] = [];
  let updatedCount = 0;

  // Pre-load ALL cards for this set in one query
  const { data: allDbCards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, card_number, name, variant_label, rarity")
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

  // Loop through ALL JustTCG slugs for this set code (promos have 40+)
  for (const justTcgSlug of justTcgSlugs) {
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
      const rarityUpdates: RarityUpdate[] = [];
      const matchedCardIds = new Set<string>();
      const unmatchedCards: JTCard[] = [];

      for (const jtCard of cards) {
        try {
          matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, unmatchedCards);
        } catch (err) {
          setErrors.push(
            `Card ${jtCard.name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Create new card rows for unmatched JustTCG cards
      if (unmatchedCards.length > 0) {
        const newCards = unmatchedCards
          .filter((jt) => jt.number) // must have a card number
          .map((jt) => {
            const variantLabel = extractVariantLabel(jt.name);
            const baseName = jt.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
            const baseRarity = jt.rarity ?? "R";
            const rarity = classifyRarity(jt.name, variantLabel, baseRarity);
            // Build a unique card_image_id: "P-001" or "P-001-AA" for variants
            const suffix = variantLabel ? `-${variantLabel.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10)}` : "";
            const cardImageId = `${setCode}-${jt.number}${suffix}`;
            return {
              card_image_id: cardImageId,
              card_number: jt.number,
              name: jt.name,
              name_base: baseName,
              variant_label: variantLabel,
              set_id: dbSet.id,
              rarity,
              tcg_product_id: jt.id,
            };
          });

        if (newCards.length > 0) {
          const { data: inserted, error: insErr } = await supabase
            .from("cards")
            .upsert(newCards, { onConflict: "card_image_id", ignoreDuplicates: true })
            .select("id, card_number, name, variant_label, rarity");

          if (insErr) {
            setErrors.push(`card insert: ${insErr.message}`);
          } else if (inserted) {
            // Add newly created cards to lookup maps so price sync works
            for (const card of inserted as DbCard[]) {
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

            // Now match the previously unmatched cards to get their prices
            for (const jtCard of unmatchedCards) {
              try {
                matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds);
              } catch { /* already tracked */ }
            }
          }
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

      // Apply rarity reclassifications
      if (rarityUpdates.length > 0) {
        const byRarity = new Map<string, string[]>();
        for (const u of rarityUpdates) {
          const ids = byRarity.get(u.rarity) ?? [];
          ids.push(u.id);
          byRarity.set(u.rarity, ids);
        }
        for (const [rarity, ids] of Array.from(byRarity.entries())) {
          const { error: rarErr } = await supabase
            .from("cards")
            .update({ rarity })
            .in("id", ids);
          if (rarErr) setErrors.push(`rarity update ${rarity}: ${rarErr.message}`);
        }
      }

      hasMore = response.pagination?.hasMore ?? false;
      offset += limit;
    }
  } catch (err) {
    setErrors.push(
      `Set fetch failed (${justTcgSlug}): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  } // end slug loop

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

interface RarityUpdate {
  id: string;
  rarity: string;
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
  historyInserts: HistoryInsert[],
  rarityUpdates: RarityUpdate[],
  matchedCardIds: Set<string>,
  unmatchedCards?: JTCard[]
): void {
  const nmVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing === "Normal"
  );
  const foilVariant = jtCard.variants.find(
    (v) => v.condition === "Near Mint" && v.printing !== "Normal"
  );

  if (!nmVariant && !foilVariant) return;

  // Best variant: prefer foil for parallels/alt-arts, normal for base cards
  const bestVariant = nmVariant ?? foilVariant;
  if (!bestVariant) return;

  // Normalize: strip card number like "(119)" from names for comparison
  // JustTCG: "Monkey.D.Luffy (Alternate Art) (Manga)"
  // DB:      "Monkey.D.Luffy (119) (Alternate Art) (Manga)"
  function stripCardNum(name: string): string {
    return name.replace(/\s*\(\d+\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Extract variant tags from a name (e.g., "alternate art", "manga", "parallel")
  function extractTags(name: string): string[] {
    const tags: string[] = [];
    const re = /\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(name.toLowerCase())) !== null) {
      const tag = m[1].trim();
      if (!/^\d+$/.test(tag)) tags.push(tag);
    }
    return tags;
  }

  // Match by card number first (most reliable)
  if (jtCard.number) {
    const dbCards = byNumber.get(jtCard.number);
    if (dbCards && dbCards.length > 0) {
      if (dbCards.length === 1) {
        // Only one DB card for this number — straightforward match
        if (!matchedCardIds.has(dbCards[0].id)) {
          const variant = dbCards[0].variant_label
            ? foilVariant ?? nmVariant
            : nmVariant ?? foilVariant;
          if (variant) {
            addToBatch(dbCards[0].id, variant, priceUpserts, historyInserts, rarityUpdates, dbCards[0], jtCard.name);
            matchedCardIds.add(dbCards[0].id);
          }
        }
      } else {
        // Multiple DB cards share this number (base + alt art + manga etc.)
        // Compare variant tags to find the right match
        // Exclude already-matched DB cards so each JustTCG card maps to a unique DB card
        const unmatched = dbCards.filter((c) => !matchedCardIds.has(c.id));
        if (unmatched.length === 0) return;

        const jtTags = extractTags(jtCard.name);
        const jtStripped = stripCardNum(jtCard.name);

        // Score each DB card by tag overlap
        const scored = unmatched.map((c) => {
          const dbTags = extractTags(c.name ?? "");
          const dbStripped = stripCardNum(c.name ?? "");

          // Exact stripped name match
          if (dbStripped === jtStripped) return { card: c, score: 0 };

          // Count matching tags (alternate art, manga, parallel, sp, etc.)
          let matchingTags = 0;
          const totalTags = Math.max(jtTags.length, dbTags.length);
          for (let t = 0; t < jtTags.length; t++) {
            if (dbTags.indexOf(jtTags[t]) >= 0) matchingTags++;
          }

          if (totalTags === 0) {
            // Both have no tags — it's the base card
            return { card: c, score: 1 };
          }

          // Higher overlap = lower score (better match)
          return { card: c, score: totalTags - matchingTags };
        });

        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];
        if (best) {
          const variant = best.card.variant_label
            ? foilVariant ?? nmVariant
            : nmVariant ?? foilVariant;
          if (variant) {
            addToBatch(best.card.id, variant, priceUpserts, historyInserts, rarityUpdates, best.card, jtCard.name);
            matchedCardIds.add(best.card.id);
          }
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
    const unmatchedNames = nameMatches.filter((c) => !matchedCardIds.has(c.id));
    if (unmatchedNames.length === 0) return;

    const target =
      unmatchedNames.find((c) => (c.variant_label ?? null) === variantLabel) ??
      unmatchedNames[0];

    const variant = nmVariant ?? foilVariant;
    if (variant) {
      addToBatch(target.id, variant, priceUpserts, historyInserts, rarityUpdates, target, jtCard.name);
      matchedCardIds.add(target.id);
    }
    return;
  }

  // No match found — track as unmatched for potential card creation
  if (unmatchedCards) {
    unmatchedCards.push(jtCard);
  }
}

function addToBatch(
  cardId: string,
  variant: JTVariant,
  priceUpserts: PriceUpsert[],
  historyInserts: HistoryInsert[],
  rarityUpdates?: RarityUpdate[],
  dbCard?: DbCard,
  jtCardName?: string
): void {
  // Reclassify rarity if we have enough info
  // Check BOTH DB name and JustTCG name — DB names often lack variant tags
  // like (Manga), (Alternate Art), etc. that are needed for classification
  if (rarityUpdates && dbCard && jtCardName && dbCard.rarity) {
    const fromDb = classifyRarity(
      dbCard.name ?? jtCardName,
      dbCard.variant_label ?? null,
      dbCard.rarity
    );
    const fromJt = classifyRarity(
      jtCardName,
      dbCard.variant_label ?? null,
      dbCard.rarity
    );
    // Prefer the more specific reclassification (non-base rarity wins)
    const newRarity = fromDb !== dbCard.rarity ? fromDb : fromJt;
    if (newRarity !== dbCard.rarity) {
      rarityUpdates.push({ id: dbCard.id, rarity: newRarity });
    }
  }
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
