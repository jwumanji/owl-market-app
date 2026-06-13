import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { JustTCG } from "justtcg-js";
import { refreshPublicGameSummaries } from "@/lib/public-page-summaries";
import {
  ONE_PIECE_JUSTTCG_GAME_SLUG,
  buildJustTcgCodeToSlugs,
  buildPrimaryJustTcgSlugByCode,
  catalogImageUrlForOnePieceCard,
  onePieceGame,
  extractVariantLabel,
  classifyRarity,
} from "@/lib/games/one-piece";
import { resolveOnePieceSyncGame } from "@/lib/games/one-piece/sync-scope";

// Vercel Hobby: 10s default, this raises it to 60s
export const maxDuration = 60;

// Reverse map: internal code → all JustTCG set slugs
const CODE_TO_SLUGS = buildJustTcgCodeToSlugs(onePieceGame.justTcgSetSlugMap);
// Compat: single-slug lookup (first match)
const CODE_TO_SLUG = buildPrimaryJustTcgSlugByCode(CODE_TO_SLUGS);

const GAME = ONE_PIECE_JUSTTCG_GAME_SLUG;
const CARD_UPSERT_CONFLICT = "game_id,card_image_id";
const PRICE_STATS_UPSERT_CONFLICT = "game_id,card_id";

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
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // Fetch all sets from DB
  const { data: dbSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series")
    .eq("game_id", game.id)
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

  // Global card pre-load: one query for all cards, shared across every set
  // we sync. This lets matching find cross-set variants (e.g., an OP07-
  // distributed TR card whose DB row lives in ST10).
  const allCards = await loadAllCards(supabase, game.id);
  const cardMaps = buildCardMaps(allCards);

  for (const dbSet of setsToSync) {
    const result = await syncOneSet(client, supabase, game.id, dbSet, prefixToSetId, cardMaps, { allowCatalogMutations });
    results.push(result);
  }

  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const summaries = await tryRefreshPublicSummaries(supabase, game.id);

  return NextResponse.json({
    game: game.slug,
    provider: "justtcg",
    synced: totalUpdated,
    errors: totalErrors,
    summaries,
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
  const gameResult = await resolveOnePieceSyncGame(supabase, request);
  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // Build prefix → set_id map so new cards land in their correct physical set.
  const { data: allSets } = await supabase
    .from("sets")
    .select("id, code")
    .eq("game_id", game.id);
  const prefixToSetId: Record<string, string> = {};
  for (const s of allSets ?? []) {
    if (s.code) prefixToSetId[s.code.toUpperCase()] = s.id;
  }

  // Global pre-load (see comment in syncPrices). Each chained Cron call
  // re-queries — that's intentional: prior sets in the chain may have
  // inserted new cards we want to find on subsequent matches.
  const allCards = await loadAllCards(supabase, game.id);
  const cardMaps = buildCardMaps(allCards);

  const result = await syncOneSet(client, supabase, game.id, dbSet, prefixToSetId, cardMaps, { allowCatalogMutations });

  // Trigger next set in the chain (fire-and-forget)
  const nextIndex = index + 1;
  const summaries = nextIndex >= syncableSets.length
    ? await tryRefreshPublicSummaries(supabase, game.id)
    : { refreshed: false, deferred: true };

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
    game: game.slug,
    provider: "justtcg",
    current: `${index + 1}/${syncableSets.length}`,
    ...result,
    summaries,
    next: nextIndex < syncableSets.length ? syncableSets[nextIndex]?.code : null,
  });
}

async function tryRefreshPublicSummaries(supabase: ReturnType<typeof createServiceClient>, gameId: string) {
  try {
    await refreshPublicGameSummaries(supabase, gameId);
    return { refreshed: true };
  } catch (error) {
    return {
      refreshed: false,
      error: error instanceof Error ? error.message : "Failed to refresh public summaries.",
    };
  }
}

// ---------------------------------------------------------------------------
// syncOneSet — sync a single set from JustTCG
// ---------------------------------------------------------------------------

interface DbCard {
  id: string;
  game_id: string;
  card_image_id: string | null;
  card_number: string | null;
  name: string | null;
  variant_label: string | null;
  rarity: string | null;
  // set_id is required for the cross-set match scoring: when a card_number
  // resolves to multiple DB rows (one per set), we prefer rows that live in
  // the set we're currently syncing.
  set_id: string;
  tcg_product_id?: string | null;
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
async function loadAllCards(supabase: any, gameId: string): Promise<DbCard[]> {
  // Supabase JS defaults to 1000-row max per query — we need to page.
  const all: DbCard[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, game_id, card_image_id, card_number, name, variant_label, rarity, set_id, tcg_product_id")
      .eq("game_id", gameId)
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

function allowsCardNumberInSet(setCode: string, cardNumber: string | null | undefined): boolean {
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix) return false;
  if (setCode === "P" || setCode.startsWith("EB") || setCode.startsWith("PRB")) {
    return true;
  }
  return prefix === setCode;
}

function catalogImageUrlForNewCard(
  setCode: string,
  cardNumber: string | null | undefined,
  variantLabel: string | null
): string | null {
  return catalogImageUrlForOnePieceCard(setCode, cardNumber, variantLabel);
}

async function syncOneSet(
  client: JustTCG,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  gameId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbSet: any,
  prefixToSetId: Record<string, string> = {},
  cardMaps: CardMaps,
  options: { allowCatalogMutations?: boolean } = {}
): Promise<{ code: string; updated: number; errors: string[] }> {
  const setCode = dbSet.code;
  const justTcgSlugs = CODE_TO_SLUGS[setCode];

  if (!justTcgSlugs || justTcgSlugs.length === 0) {
    return { code: setCode, updated: 0, errors: ["No JustTCG slug mapping"] };
  }

  const setErrors: string[] = [];
  let updatedCount = 0;

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
          if (!allowsCardNumberInSet(setCode, jtCard.number)) continue;
          matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, gameId, dbSet.id, unmatchedCards);
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
              const imageUrl = catalogImageUrlForNewCard(setCode, jt.number, variantLabel);
              return {
                game_id: gameId,
                card_image_id: cardImageId,
                card_number: jt.number,
                name: jt.name,
                name_base: baseName,
                variant_label: variantLabel,
                set_id: dbSet.id,
                rarity,
                tcg_product_id: jt.id,
                image_url: imageUrl,
                image_url_small: null,
              };
            }

            // Same-set path (existing behavior).
            const resolvedSetId = (numberPrefix && prefixToSetId[numberPrefix]) || dbSet.id;
            const suffix = variantLabel ? `-${variantLabel.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10)}` : "";
            const cardImageId = `${setCode}-${jt.number}${suffix}`;
            const imageUrl = catalogImageUrlForNewCard(setCode, jt.number, variantLabel);
            return {
              game_id: gameId,
              card_image_id: cardImageId,
              card_number: jt.number,
              name: jt.name,
              name_base: baseName,
              variant_label: variantLabel,
              set_id: resolvedSetId,
              rarity,
              tcg_product_id: jt.id,
              image_url: imageUrl,
              image_url_small: null,
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
          new Map(newCards.map((c) => [`${c.game_id}:${c.card_image_id}`, c])).values(),
        );

        if (dedupedNewCards.length > 0) {
          const { data: inserted, error: insErr } = await supabase
            .from("cards")
            .upsert(dedupedNewCards, { onConflict: CARD_UPSERT_CONFLICT })
            .select("id, game_id, card_number, name, variant_label, rarity, set_id");

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
                matchAndCollect(jtCard, byNumber, byNameLower, priceUpserts, historyInserts, rarityUpdates, matchedCardIds, gameId, dbSet.id);
              } catch { /* already tracked */ }
            }
          }
        }
      }

      // Deduplicate by card_id (keep last entry — higher price variant wins)
      const dedupedPrices = Array.from(
        new Map(priceUpserts.map((p) => [`${p.game_id}:${p.card_id}`, p])).values()
      );
      const dedupedHistory = await filterNewHistoryRowsForToday(
        supabase,
        dedupeHistoryRows(historyInserts),
        setErrors
      );

      if (dedupedPrices.length > 0) {
        const { error: upErr } = await supabase
          .from("price_stats")
          .upsert(dedupedPrices, { onConflict: PRICE_STATS_UPSERT_CONFLICT });
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
            .eq("game_id", gameId)
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

function utcDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historyDayKey(gameId: string, cardId: string, recordedAt: string): string | null {
  const day = utcDay(recordedAt);
  return day ? `${gameId}|${cardId}|${day}` : null;
}

function dedupeHistoryRows(rows: HistoryInsert[]): HistoryInsert[] {
  const byCardDay = new Map<string, HistoryInsert>();
  for (const row of rows) {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
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
  const gameIds = Array.from(new Set(rows.map((row) => row.game_id))).filter(Boolean);
  const chunkSize = 100;

  for (const gameId of gameIds) {
    const gameRows = rows.filter((row) => row.game_id === gameId);
    const ids = Array.from(new Set(gameRows.map((row) => row.card_id))).filter(Boolean);
    const days = Array.from(new Set(gameRows.map((row) => utcDay(row.recorded_at)).filter(Boolean))) as string[];

    for (const day of days) {
      const start = `${day}T00:00:00.000Z`;
      const end = new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("price_history")
          .select("game_id, card_id, recorded_at")
          .eq("game_id", gameId)
          .in("card_id", chunk)
          .gte("recorded_at", start)
          .lt("recorded_at", end);

        if (error) {
          setErrors.push(`price_history dedupe precheck: ${error.message}`);
          return rows;
        }

        for (const row of data ?? []) {
          const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
          if (key) existing.add(key);
        }
      }
    }
  }

  return rows.filter((row) => {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
    return key && !existing.has(key);
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceUpsert {
  game_id: string;
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
  game_id: string;
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
  gameId: string,
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
    const dbVariantKey = variantKey(c.variant_label);
    const exactBaseImage = Boolean(jtNumber && c.card_image_id === jtNumber);
    const sameVariant = Boolean(jtVariantKey && variantsEquivalent(jtVariantKey, dbVariantKey));
    let scoreAdjust = 0;

    if (c.tcg_product_id && jtCard.id && String(c.tcg_product_id) === String(jtCard.id)) scoreAdjust -= 100;
    if (c.tcg_product_id && jtCard.id && String(c.tcg_product_id) !== String(jtCard.id)) scoreAdjust += 10;
    if (!jtVariantKey && exactBaseImage && !dbVariantKey) scoreAdjust -= 30;
    if (!jtVariantKey && dbVariantKey) scoreAdjust += 50;
    if (jtVariantKey && sameVariant) scoreAdjust -= 30;
    if (jtVariantKey && exactBaseImage && !dbVariantKey) scoreAdjust += 100;

    if (dbStripped === jtStripped && jtTags.length === 0 && dbTags.length === 0)
      return -2 + scoreAdjust;

    const equal =
      jtTagSet.size === dbTagSet.size &&
      Array.from(jtTagSet).every((t) => dbTagSet.has(t));
    if (equal) return -1 + scoreAdjust;

    const onlyJt = jtTags.filter((t) => !dbTagSet.has(t)).length;
    const onlyDb = dbTags.filter((t) => !jtTagSet.has(t)).length;

    if (jtTags.length > 0 && dbTags.length === 0) return 100 + onlyJt + scoreAdjust;
    if (jtTags.length === 0 && dbTags.length > 0) return 50 + onlyDb + scoreAdjust;
    return onlyJt + onlyDb + scoreAdjust;
  }

  // Match by card number first (most reliable). With the global pre-load,
  // candidates may span multiple sets — we prefer same-set rows but accept
  // a high-confidence cross-set match (score ≤ 0). This is what routes a
  // JustTCG TR variant to OP07's row even when it's returned under ST10's
  // catalog (or vice-versa).
  if (jtCard.number) {
    const allDbCards = byNumber.get(jtCard.number);
    if (allDbCards && allDbCards.length > 0) {
      const directProductMatches = jtCard.id
        ? allDbCards.filter((c) => String(c.tcg_product_id ?? "") === String(jtCard.id) && !matchedCardIds.has(c.id))
        : [];
      if (directProductMatches.length === 1) {
        const direct = directProductMatches[0];
        const variant = jtVariantKey || direct.variant_label
          ? foilVariant ?? nmVariant
          : nmVariant ?? foilVariant;
        if (variant) {
          addToBatch(gameId, direct.id, variant, priceUpserts, historyInserts, rarityUpdates, direct, jtCard.name);
          matchedCardIds.add(direct.id);
        }
        return;
      }

      const unmatched = allDbCards.filter((c) => !matchedCardIds.has(c.id));
      if (unmatched.length === 0) return;

      if (unmatched.length === 1) {
        const only = unmatched[0];
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
      }

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
          addToBatch(gameId, chosen.card.id, variant, priceUpserts, historyInserts, rarityUpdates, chosen.card, jtCard.name);
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
          addToBatch(gameId, target.id, variant, priceUpserts, historyInserts, rarityUpdates, target, jtCard.name);
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
  gameId: string,
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
    game_id: gameId,
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
    game_id: gameId,
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
