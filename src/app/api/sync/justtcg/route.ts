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
//
// By default this route is existing-only: it updates price_stats for matched
// DB cards and leaves optcg-owned catalog rows alone. Catalog mutations require
// ?allowCatalogMutations=1.
// ---------------------------------------------------------------------------

async function syncPrices(request: Request) {
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
  const allowCatalogMutations = searchParams.get("allowCatalogMutations") === "1";
  if (!setsParam) {
    // For Vercel Cron: auto-chain through sets one at a time
    const indexParam = searchParams.get("_index");
    if (indexParam !== null || request.headers.get("authorization") === `Bearer ${cronSecret}`) {
      return await syncByIndex(request, syncableSets, parseInt(indexParam ?? "0", 10), allowCatalogMutations);
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

  for (const dbSet of setsToSync) {
    const result = await syncOneSet(client, supabase, dbSet, prefixToSetId, { allowCatalogMutations });
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
  index: number,
  allowCatalogMutations = false
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

  const result = await syncOneSet(client, supabase, dbSet, prefixToSetId, { allowCatalogMutations });

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
  card_image_id: string | null;
  card_number: string | null;
  name: string | null;
  variant_label: string | null;
  rarity: string | null;
  tcg_product_id?: string | null;
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

function allowsCardNumberInSet(setCode: string, cardNumber: string | null | undefined): boolean {
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix) return false;
  if (setCode === "P" || setCode.startsWith("EB") || setCode.startsWith("PRB")) {
    return true;
  }
  return prefix === setCode;
}

async function syncOneSet(
  client: JustTCG,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSet: any,
  prefixToSetId: Record<string, string> = {},
  options: { allowCatalogMutations?: boolean } = {}
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

  // Pre-load ALL cards for this set in one query
  const { data: allDbCards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, card_image_id, card_number, name, variant_label, rarity, tcg_product_id")
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
          if (!allowsCardNumberInSet(setCode, jtCard.number)) continue;
          const priceCountBefore = priceUpserts.length;
          matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, unmatchedCards);

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

      // Create new card rows for unmatched JustTCG cards only when explicitly
      // requested. Normal sync must enrich existing optcg rows, not invent or
      // replace catalog data.
      if (options.allowCatalogMutations && unmatchedCards.length > 0) {
        const newCards = unmatchedCards
          .filter((jt) => jt.number) // must have a card number
          .map((jt) => {
            // Skip cards that physically belong to a different set — let that
            // set's own sync run create them under the correct card_image_id.
            // This prevents shadow rows like "OP02-OP01-001-Manga" living in OP01.
            const numberPrefix = prefixFromCardNumber(jt.number);
            const resolvedSetId = (numberPrefix && prefixToSetId[numberPrefix]) || dbSet.id;
            if (resolvedSetId !== dbSet.id) return null;

            const variantLabel = extractVariantLabel(jt.name);
            const baseName = jt.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
            const baseRarity = jt.rarity ?? "R";
            const rarity = classifyRarity(jt.name, variantLabel, baseRarity);
            // Build a unique card_image_id: "P-001" or "P-001-AA" for variants
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

        if (newCards.length > 0) {
          const { data: inserted, error: insErr } = await supabase
            .from("cards")
            .upsert(newCards, { onConflict: "card_image_id" })
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
      const dedupedHistory = await filterNewHistoryRowsForToday(
        supabase,
        dedupeHistoryRows(historyInserts),
        setErrors
      );

      if (dedupedPrices.length > 0) {
        const { error: upErr } = await supabase
          .from("price_stats")
          .upsert(dedupedPrices, { onConflict: "card_id" });
        if (upErr) setErrors.push(`price_stats batch: ${upErr.message}`);
        else updatedCount += dedupedPrices.length;
      }

      if (dedupedHistory.length > 0) {
        const { error: hiErr } = await supabase
          .from("price_history")
          .insert(dedupedHistory);
        if (hiErr) setErrors.push(`price_history batch: ${hiErr.message}`);
      }

      // Apply rarity reclassifications
      if (options.allowCatalogMutations && rarityUpdates.length > 0) {
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
  if (options.allowCatalogMutations && allImageUpdates.length > 0) {
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

function utcDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historyDayKey(cardId: string, recordedAt: string): string | null {
  const day = utcDay(recordedAt);
  return day ? `${cardId}|${day}` : null;
}

function dedupeHistoryRows(rows: HistoryInsert[]): HistoryInsert[] {
  const byCardDay = new Map<string, HistoryInsert>();
  for (const row of rows) {
    const key = historyDayKey(row.card_id, row.recorded_at);
    if (!key) continue;
    const existing = byCardDay.get(key);
    if (!existing || new Date(row.recorded_at).getTime() >= new Date(existing.recorded_at).getTime()) {
      byCardDay.set(key, row);
    }
  }
  return Array.from(byCardDay.values());
}

async function filterNewHistoryRowsForToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: HistoryInsert[],
  setErrors: string[]
): Promise<HistoryInsert[]> {
  if (rows.length === 0) return rows;

  const existing = new Set<string>();
  const ids = Array.from(new Set(rows.map((row) => row.card_id))).filter(Boolean);
  const days = Array.from(new Set(rows.map((row) => utcDay(row.recorded_at)).filter(Boolean))) as string[];
  const chunkSize = 100;

  for (const day of days) {
    const start = `${day}T00:00:00.000Z`;
    const end = new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("price_history")
        .select("card_id, recorded_at")
        .in("card_id", chunk)
        .gte("recorded_at", start)
        .lt("recorded_at", end);

      if (error) {
        setErrors.push(`price_history dedupe precheck: ${error.message}`);
        return rows;
      }

      for (const row of data ?? []) {
        const key = historyDayKey(row.card_id, row.recorded_at);
        if (key) existing.add(key);
      }
    }
  }

  return rows.filter((row) => {
    const key = historyDayKey(row.card_id, row.recorded_at);
    return key && !existing.has(key);
  });
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
  const jtVariantKey = variantKey(extractVariantLabel(jtCard.name));
  const jtNumber = jtCard.number ?? null;

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
      const directProductMatches = jtCard.id
        ? dbCards.filter((c) => String(c.tcg_product_id ?? "") === String(jtCard.id) && !matchedCardIds.has(c.id))
        : [];
      if (directProductMatches.length === 1) {
        const direct = directProductMatches[0];
        const variant = jtVariantKey || direct.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;
        if (variant) {
          addToBatch(direct.id, variant, priceUpserts, historyInserts, rarityUpdates, direct, jtCard.name);
          matchedCardIds.add(direct.id);
        }
        return;
      }

      if (dbCards.length === 1) {
        // Only one DB card for this number — straightforward match
        const only = dbCards[0];
        const onlyVariantKey = variantKey(only.variant_label);
        const exactBaseImage = Boolean(jtNumber && only.card_image_id === jtNumber);
        const variantWouldHitBase = Boolean(jtVariantKey && !onlyVariantKey && exactBaseImage);
        const baseWouldHitVariant = Boolean(!jtVariantKey && onlyVariantKey);
        const productConflict = Boolean(
          only.tcg_product_id && jtCard.id && String(only.tcg_product_id) !== String(jtCard.id)
        );
        if (variantWouldHitBase || baseWouldHitVariant || productConflict) {
          if (unmatchedCards) unmatchedCards.push(jtCard);
          return;
        }
        if (!matchedCardIds.has(only.id)) {
          const variant = jtVariantKey || only.variant_label
            ? foilVariant ?? nmVariant
            : nmVariant ?? foilVariant;
          if (variant) {
            addToBatch(only.id, variant, priceUpserts, historyInserts, rarityUpdates, only, jtCard.name);
            matchedCardIds.add(only.id);
          }
        }
      } else {
        // Multiple DB cards share this number (base + alt art + manga etc.)
        // Compare variant tags to find the right match.
        // DB rows often store the variant tag in `variant_label` (not `name`)
        // because extractVariantLabel strips it during insert. Build the
        // candidate haystack from BOTH columns so the scoring still works.
        const unmatched = dbCards.filter((c) => !matchedCardIds.has(c.id));
        if (unmatched.length === 0) return;

        const jtTags = extractTags(jtCard.name);
        const jtTagSet = new Set(jtTags);
        const jtStripped = stripCardNum(jtCard.name);

        // Score each DB card. Lower = better.
        const scored = unmatched.map((c) => {
          const haystack = `${c.name ?? ""} ${c.variant_label ?? ""}`;
          let dbTags = extractTags(haystack);
          // Treat the variant_label itself as an extra tag (e.g. "Manga", "Alt Art")
          if (c.variant_label) {
            const vl = c.variant_label.toLowerCase();
            if (dbTags.indexOf(vl) < 0) dbTags = [...dbTags, vl];
          }
          const dbTagSet = new Set(dbTags);
          const dbStripped = stripCardNum(c.name ?? "");
          const dbVariantKey = variantKey(c.variant_label);
          const exactBaseImage = Boolean(jtNumber && c.card_image_id === jtNumber);
          const sameVariant = Boolean(jtVariantKey && variantsEquivalent(jtVariantKey, dbVariantKey));

          // Exact stripped-name match wins outright
          if (dbStripped === jtStripped && jtTags.length === 0 && dbTags.length === 0) {
            return { card: c, score: -2 };
          }

          let scoreAdjust = 0;
          if (c.tcg_product_id && jtCard.id && String(c.tcg_product_id) === String(jtCard.id)) scoreAdjust -= 100;
          if (c.tcg_product_id && jtCard.id && String(c.tcg_product_id) !== String(jtCard.id)) scoreAdjust += 10;
          if (!jtVariantKey && exactBaseImage && !dbVariantKey) scoreAdjust -= 30;
          if (!jtVariantKey && dbVariantKey) scoreAdjust += 50;
          if (jtVariantKey && sameVariant) scoreAdjust -= 30;
          if (jtVariantKey && exactBaseImage && !dbVariantKey) scoreAdjust += 100;

          // Exact tag-set equality wins (handles "(SP) (Gold)" vs "(SP)" correctly)
          const equal =
            jtTagSet.size === dbTagSet.size &&
            Array.from(jtTagSet).every((t) => dbTagSet.has(t));
          if (equal) return { card: c, score: -1 + scoreAdjust };

          // Otherwise: penalize tags only on one side
          const onlyJt = jtTags.filter((t) => !dbTagSet.has(t)).length;
          const onlyDb = dbTags.filter((t) => !jtTagSet.has(t)).length;

          // Strongly penalize a base row (no tags) when jt has tags — prevents
          // base row from eating Manga/Alt-Art/SP variants.
          if (jtTags.length > 0 && dbTags.length === 0) {
            return { card: c, score: 100 + onlyJt + scoreAdjust };
          }
          // And vice-versa: prefer the base DB row when jt has no tags.
          if (jtTags.length === 0 && dbTags.length > 0) {
            return { card: c, score: 50 + onlyDb + scoreAdjust };
          }

          return { card: c, score: onlyJt + onlyDb + scoreAdjust };
        });

        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];
        const tied = scored[1] && scored[1].score === best?.score;
        if (best && !tied && best.score < 80) {
          const variant = jtVariantKey || best.card.variant_label
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

  // Fallback: match by name. Promo cards share names across many printings,
  // so a loose `unmatchedNames[0]` fallback silently mis-assigns prices.
  // Require either an exact variant_label match OR a tag overlap; otherwise
  // bail to the unmatchedCards path so the insert logic can handle it.
  const variantLabel = extractVariantLabel(jtCard.name);
  const baseName = jtCard.name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  const nameMatches = byNameLower.get(baseName);

  if (nameMatches && nameMatches.length > 0) {
    const unmatchedNames = nameMatches.filter((c) => !matchedCardIds.has(c.id));
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

function variantKey(label: string | null | undefined): string {
  const normalized = (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "";
  if (normalized === "alternateart" || normalized === "parallel" || normalized === "altart") {
    return "altart";
  }
  if (normalized === "spr") return "sp";
  return normalized;
}

function variantsEquivalent(a: string, b: string): boolean {
  return Boolean(a && b && a === b);
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
