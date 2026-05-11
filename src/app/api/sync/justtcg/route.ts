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

  // Build a card-number-prefix → set_id map once so new-card inserts go to the
  // correct physical set, not whichever set happens to be iterating.
  const prefixToSetId: Record<string, string> = {};
  for (const s of dbSets) {
    if (s.code) prefixToSetId[s.code.toUpperCase()] = s.id;
  }

  // Global card pre-load: one query for all cards, shared across every set
  // we sync. This lets matching find cross-set variants (e.g., an OP07-
  // distributed TR card whose DB row lives in ST10).
  const allCards = await loadAllCards(supabase);
  const cardMaps = buildCardMaps(allCards);

  for (const dbSet of setsToSync) {
    const result = await syncOneSet(client, supabase, dbSet, prefixToSetId, cardMaps);
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

  // Build prefix → set_id map so new cards land in their correct physical set.
  const { data: allSets } = await supabase.from("sets").select("id, code");
  const prefixToSetId: Record<string, string> = {};
  for (const s of allSets ?? []) {
    if (s.code) prefixToSetId[s.code.toUpperCase()] = s.id;
  }

  // Global pre-load (see comment in syncPrices). Each chained Cron call
  // re-queries — that's intentional: prior sets in the chain may have
  // inserted new cards we want to find on subsequent matches.
  const allCards = await loadAllCards(supabase);
  const cardMaps = buildCardMaps(allCards);

  const result = await syncOneSet(client, supabase, dbSet, prefixToSetId, cardMaps);

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
  // set_id is required for the cross-set match scoring: when a card_number
  // resolves to multiple DB rows (one per set), we prefer rows that live in
  // the set we're currently syncing.
  set_id: string;
}

// ---------------------------------------------------------------------------
// Card map builders — pre-load all DB cards once per sync run, build lookup
// maps used across every set. Pre-loading globally (rather than per-set) is
// what enables cross-set variant matching: when JustTCG returns a card with
// number "ST10-010" while we're syncing OP07, we need byNumber to contain
// the ST10 row (kept in ST10 by the bare-ID guard) AND any OP07 variant row
// for the same number, so the tag-scoring picks the right one.
// ---------------------------------------------------------------------------

interface CardMaps {
  byNumber: Map<string, DbCard[]>;
  byNameLower: Map<string, DbCard[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAllCards(supabase: any): Promise<DbCard[]> {
  // Supabase JS defaults to 1000-row max per query — we need to page.
  const all: DbCard[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, card_number, name, variant_label, rarity, set_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`loadAllCards: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as DbCard[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function buildCardMaps(cards: DbCard[]): CardMaps {
  const byNumber = new Map<string, DbCard[]>();
  const byNameLower = new Map<string, DbCard[]>();
  for (const card of cards) {
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
  return { byNumber, byNameLower };
}

/** Extract the set code prefix from a card number like "OP02-013" → "OP02"
 *  or "P-001" → "P". */
function prefixFromCardNumber(cardNumber: string | null | undefined): string | null {
  if (!cardNumber) return null;
  const s = String(cardNumber);
  const m = s.match(/^([A-Z]+\d+)-/);
  if (m) return m[1].toUpperCase();
  // Promo prefix: "P-001"
  const p = s.match(/^([A-Z]+)-/);
  if (p) return p[1].toUpperCase();
  return null;
}

async function syncOneSet(
  client: JustTCG,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSet: any,
  prefixToSetId: Record<string, string> = {},
  cardMaps: CardMaps
): Promise<{ code: string; updated: number; errors: string[] }> {
  const setCode = dbSet.code;
  const justTcgSlugs = CODE_TO_SLUGS[setCode];

  if (!justTcgSlugs || justTcgSlugs.length === 0) {
    return { code: setCode, updated: 0, errors: ["No JustTCG slug mapping"] };
  }

  const setErrors: string[] = [];
  let updatedCount = 0;
  // Collect promo image updates across all slugs/pages, apply in bulk at end
  const allImageUpdates: { id: string; image_url: string; image_url_small: string }[] = [];

  // Use the globally pre-loaded card maps. Aliased to the existing names so
  // the rest of the function reads unchanged.
  const { byNumber, byNameLower } = cardMaps;

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
          const priceCountBefore = priceUpserts.length;
          matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, dbSet.id, unmatchedCards);

          // For promo set: collect image updates (applied in bulk at end)
          if (setCode === "P" && jtCard.tcgplayerId && priceUpserts.length > priceCountBefore) {
            const matchedCardId = priceUpserts[priceUpserts.length - 1].card_id;
            allImageUpdates.push({
              id: matchedCardId,
              image_url: `https://product-images.tcgplayer.com/fit-in/437x437/${jtCard.tcgplayerId}.jpg`,
              image_url_small: `https://tcgplayer-cdn.tcgplayer.com/product/${jtCard.tcgplayerId}_200w.jpg`,
            });
          }
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

            const numberPrefix = prefixFromCardNumber(jt.number);
            const isCrossSet = numberPrefix !== null && numberPrefix !== setCode;

            // Cross-set route. The JT card's number prefix points to a
            // different set than the one we're syncing — meaning this is a
            // physical card distributed via the current set but bearing an
            // origin-set ID (e.g., "ST10-010" listed under OP07's catalog
            // because OP07 ships an ST10-010 TR-rarity box-topper).
            //
            // Two policies:
            //   A. cross-set + variant tag (SP/TR/Manga/Alt Art/etc.):
            //      insert into the CURRENT set with a synthesized
            //      card_image_id like "ST10-010_TR_op07". This makes the
            //      distribution-set variant a first-class row.
            //   B. cross-set + no variant tag: skip. Letting a bare,
            //      tag-less cross-set card land here would create a shadow
            //      duplicate of the origin's base row.
            if (isCrossSet) {
              if (!variantLabel) return null; // policy B
              // policy A: synthesize id
              const tagSlug = variantLabel.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().substring(0, 10);
              const cardImageId = `${jt.number}_${tagSlug}_${setCode.toLowerCase()}`;
              const imageUrl = jt.tcgplayerId
                ? `https://product-images.tcgplayer.com/fit-in/437x437/${jt.tcgplayerId}.jpg`
                : `https://optcgapi.com/media/static/Card_Images/${jt.number}.jpg`;
              const imageUrlSmall = jt.tcgplayerId
                ? `https://tcgplayer-cdn.tcgplayer.com/product/${jt.tcgplayerId}_200w.jpg`
                : null;
              return {
                card_image_id: cardImageId,
                card_number: jt.number,
                name: jt.name,
                name_base: baseName,
                variant_label: variantLabel,
                set_id: dbSet.id,
                rarity,
                tcg_product_id: jt.id,
                image_url: imageUrl,
                image_url_small: imageUrlSmall,
              };
            }

            // Same-set path (existing behavior).
            const resolvedSetId = (numberPrefix && prefixToSetId[numberPrefix]) || dbSet.id;
            const suffix = variantLabel ? `-${variantLabel.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10)}` : "";
            const cardImageId = `${setCode}-${jt.number}${suffix}`;
            // Use TCGPlayer CDN images for promo cards (optcgapi only has base art)
            const isPromo = setCode === "P";
            const imageUrl = isPromo && jt.tcgplayerId
              ? `https://product-images.tcgplayer.com/fit-in/437x437/${jt.tcgplayerId}.jpg`
              : jt.number
                ? `https://optcgapi.com/media/static/Card_Images/${jt.number}.jpg`
                : null;
            const imageUrlSmall = isPromo && jt.tcgplayerId
              ? `https://tcgplayer-cdn.tcgplayer.com/product/${jt.tcgplayerId}_200w.jpg`
              : null;
            return {
              card_image_id: cardImageId,
              card_number: jt.number,
              name: jt.name,
              name_base: baseName,
              variant_label: variantLabel,
              set_id: resolvedSetId,
              rarity,
              tcg_product_id: jt.id,
              image_url: imageUrl,
              image_url_small: imageUrlSmall,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        // Deduplicate by card_image_id before upserting. JustTCG may return
        // multiple rows for the same physical card (e.g. variants returned
        // under multiple slugs in the same page), and Postgres rejects an
        // `ON CONFLICT DO UPDATE` batch that touches the same conflict key
        // twice with "command cannot affect row a second time". Keep the
        // first occurrence since later duplicates carry the same metadata.
        const dedupedNewCards = Array.from(
          new Map(newCards.map((c) => [c.card_image_id, c])).values(),
        );

        if (dedupedNewCards.length > 0) {
          const { data: inserted, error: insErr } = await supabase
            .from("cards")
            .upsert(dedupedNewCards, { onConflict: "card_image_id" })
            .select("id, card_number, name, variant_label, rarity, set_id");

          if (insErr) {
            setErrors.push(`card insert: ${insErr.message}`);
          } else if (inserted) {
            // Add newly created cards to lookup maps so price sync works.
            // (byNumber/byNameLower are aliases for cardMaps fields, so
            // mutations propagate to subsequent set syncs in this run.)
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
                matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, dbSet.id);
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

  // Bulk-update promo card images using TCGPlayer CDN (parallel, chunked)
  if (allImageUpdates.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < allImageUpdates.length; i += CHUNK) {
      const chunk = allImageUpdates.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map((img) =>
          supabase
            .from("cards")
            .update({ image_url: img.image_url, image_url_small: img.image_url_small })
            .eq("id", img.id)
        )
      );
      for (const { error } of results) {
        if (error) setErrors.push(`image update: ${error.message}`);
      }
    }
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
  tcgplayerId: string | null;
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
  dbSetId: string,
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

  // Score a DB candidate against the JT card. Lower is better.
  //   -2 = exact stripped-name match, both base
  //   -1 = exact tag-set equality (e.g. JT (SP) vs DB variant_label "SP")
  //    0 to N = partial tag overlap
  //   50+ = JT has no tags but DB does (would over-attribute base price to variant)
  //   100+ = JT has tags but DB has none (would under-attribute variant price to base)
  function scoreCard(
    c: DbCard,
    jtTags: string[],
    jtTagSet: Set<string>,
    jtStripped: string,
  ): number {
    const haystack = `${c.name ?? ""} ${c.variant_label ?? ""}`;
    let dbTags = extractTags(haystack);
    if (c.variant_label) {
      const vl = c.variant_label.toLowerCase();
      if (dbTags.indexOf(vl) < 0) dbTags = [...dbTags, vl];
    }
    const dbTagSet = new Set(dbTags);
    const dbStripped = stripCardNum(c.name ?? "");

    if (dbStripped === jtStripped && jtTags.length === 0 && dbTags.length === 0)
      return -2;

    const equal =
      jtTagSet.size === dbTagSet.size &&
      Array.from(jtTagSet).every((t) => dbTagSet.has(t));
    if (equal) return -1;

    const onlyJt = jtTags.filter((t) => !dbTagSet.has(t)).length;
    const onlyDb = dbTags.filter((t) => !jtTagSet.has(t)).length;

    if (jtTags.length > 0 && dbTags.length === 0) return 100 + onlyJt;
    if (jtTags.length === 0 && dbTags.length > 0) return 50 + onlyDb;
    return onlyJt + onlyDb;
  }

  // Match by card number first (most reliable). With the global pre-load,
  // candidates may span multiple sets — we prefer same-set rows but accept
  // a high-confidence cross-set match (score ≤ 0). This is what routes a
  // JustTCG TR variant to OP07's row even when it's returned under ST10's
  // catalog (or vice-versa).
  if (jtCard.number) {
    const allDbCards = byNumber.get(jtCard.number);
    if (allDbCards && allDbCards.length > 0) {
      const unmatched = allDbCards.filter((c) => !matchedCardIds.has(c.id));
      if (unmatched.length === 0) return;

      const jtTags = extractTags(jtCard.name);
      const jtTagSet = new Set(jtTags);
      const jtStripped = stripCardNum(jtCard.name);

      const scored = unmatched
        .map((c) => ({ card: c, score: scoreCard(c, jtTags, jtTagSet, jtStripped) }))
        .sort((a, b) => a.score - b.score);

      const sameSetScored = scored.filter((s) => s.card.set_id === dbSetId);
      const bestOverall = scored[0];
      const bestSameSet = sameSetScored[0];

      let chosen: { card: DbCard; score: number } | undefined;
      if (bestOverall && bestOverall.score <= 0) {
        // Confident match (tag-set equal or perfect base) — set boundary
        // doesn't matter. This handles ST10-TR being attributed to OP07
        // even when JT lists it under ST10.
        chosen = bestOverall;
      } else if (bestSameSet) {
        // No high-confidence match anywhere; preserve pre-refactor behavior
        // by falling back to the best same-set candidate. This guards
        // against cross-set name collisions hijacking unrelated cards.
        chosen = bestSameSet;
      }
      // else: no same-set match and no confident cross-set match → leave
      // unmatched so the insert path can create a clean row.

      if (chosen) {
        const variant = chosen.card.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;
        if (variant) {
          addToBatch(chosen.card.id, variant, priceUpserts, historyInserts, rarityUpdates, chosen.card, jtCard.name);
          matchedCardIds.add(chosen.card.id);
        }
        return;
      }
      // fall through to name-match / insert path
    }
  }

  // Fallback: match by name. Promo cards share names across many printings,
  // so a loose `unmatchedNames[0]` fallback silently mis-assigns prices.
  // Require either an exact variant_label match OR a tag overlap; otherwise
  // bail to the unmatchedCards path so the insert logic can handle it.
  const variantLabel = extractVariantLabel(jtCard.name);
  const baseName = jtCard.name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  const nameMatches = byNameLower.get(baseName);

  if (nameMatches && nameMatches.length > 0) {
    const allUnmatched = nameMatches.filter((c) => !matchedCardIds.has(c.id));
    // Prefer same-set candidates for the name-match fallback. With global
    // pre-load, a name like "Trafalgar Law" hits dozens of rows across sets;
    // restricting to the current set keeps the fallback safe. Only widen
    // to all sets when the current set has no candidate at all.
    const sameSet = allUnmatched.filter((c) => c.set_id === dbSetId);
    const unmatchedNames = sameSet.length > 0 ? sameSet : allUnmatched;
    if (unmatchedNames.length > 0) {
      const jtTags = (jtCard.name.match(/\(([^)]+)\)/g) || []).map((s) =>
        s.slice(1, -1).toLowerCase()
      );

      // 1. Exact variant_label match
      let target = unmatchedNames.find(
        (c) => (c.variant_label ?? null) === variantLabel
      );

      // 2. Tag overlap with name+variant_label
      if (!target && jtTags.length > 0) {
        target = unmatchedNames.find((c) => {
          const hay = `${c.name ?? ""} ${c.variant_label ?? ""}`.toLowerCase();
          return jtTags.some((t) => hay.indexOf(t) >= 0);
        });
      }

      // 3. Both base (no tags on either side)
      if (!target && jtTags.length === 0) {
        target = unmatchedNames.find((c) => !c.variant_label);
      }

      if (target) {
        const variant = target.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;
        if (variant) {
          addToBatch(target.id, variant, priceUpserts, historyInserts, rarityUpdates, target, jtCard.name);
          matchedCardIds.add(target.id);
        }
        return;
      }
    }
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
