import { NextResponse } from "next/server";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { cachedPublicData, PUBLIC_DATA_CACHE_HEADERS, publicDataCacheKey } from "@/lib/public-data-cache";
import { loadPublicCharacterSummaryRows, type PublicCharacterSummaryRow } from "@/lib/public-page-summaries";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { firstRelation } from "@/lib/supabase-relations";

export const revalidate = 300;

// ---------------------------------------------------------------------------
// GET /api/characters - returns character index data with top cards + prices
// ---------------------------------------------------------------------------

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const CHARACTER_TOP_CARD_LIMIT = 5;

function numeric(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function summaryTopCards(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((card): card is Record<string, unknown> => card != null && typeof card === "object" && !Array.isArray(card))
    .slice(0, CHARACTER_TOP_CARD_LIMIT)
    .map((card) => ({
      name: stringValue(card.name),
      set: stringValue(card.set),
      rarity: stringValue(card.rarity),
      tcg: numeric(card.tcg as number | string | null | undefined),
      avg: numeric(card.avg as number | string | null | undefined),
      chg1d: numeric(card.chg1d as number | string | null | undefined),
      chg7d: numeric(card.chg7d as number | string | null | undefined),
      chg30d: numeric(card.chg30d as number | string | null | undefined),
      spark: Array.isArray(card.spark) ? card.spark.map((point) => numeric(point as number | string | null | undefined)) : [0, 0],
      imageUrlSmall: typeof card.imageUrlSmall === "string" ? card.imageUrlSmall : null,
      imageUrlPreview: typeof card.imageUrlPreview === "string" ? card.imageUrlPreview : null,
      cardImageId: typeof card.cardImageId === "string" ? card.cardImageId : null,
    }));
}

function mapCharacterSummary(row: PublicCharacterSummaryRow) {
  const indexValue = numeric(row.index_value);
  const chg7d = numeric(row.chg_7d);

  return {
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle ?? "",
    faction: row.faction ?? "",
    tier: row.tier ?? 3,
    indexValue,
    cardCount: row.card_count ?? 0,
    chg7d,
    chg30d: numeric(row.chg_30d),
    up: chg7d >= 0,
    topCards: summaryTopCards(row.top_cards),
  };
}

async function loadCharacterSummaries(gameId: string) {
  const supabase = createCachedServiceClient();
  const rows = await loadPublicCharacterSummaryRows(supabase, gameId);
  if (!rows) return null;

  return rows
    .map(mapCharacterSummary)
    .filter((character) => character.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue);
}

async function fetchPaged<T>(loadPage: (from: number, to: number) => QueryResult<T>, pageSize = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  faction: string;
  tier: number;
  type_tag: string | null;
};

type PriceStatsRelation = {
  tcg_market: number | null;
  market_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath?: number | null;
  atl?: number | null;
};

type SetRelation = {
  code: string | null;
  name: string | null;
};

type PricedCharacterCardRow = {
  id: string;
  character_id: string | null;
  name: string;
  card_number: string | null;
  variant_label: string | null;
  rarity: string | null;
  set_id: string | null;
  image_url: string | null;
  image_url_small: string | null;
  image_url_preview: string | null;
  card_image_id: string | null;
  sets: SetRelation | SetRelation[] | null;
  price_stats: PriceStatsRelation | PriceStatsRelation[] | null;
};

function trendSpark(stats: PriceStatsRelation | null) {
  const current = stats?.tcg_market ?? stats?.market_avg ?? 0;
  if (current <= 0) return [0, 0];

  const change = (stats?.chg_7d ?? stats?.chg_30d ?? 0) / 100;
  const start = current / Math.max(0.1, 1 + change);

  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    return +(start + (current - start) * t).toFixed(2);
  });
}

async function loadCharacterIndex(gameId: string) {
  const supabase = createCachedServiceClient();

  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, slug, name, subtitle, faction, tier, type_tag")
    .eq("game_id", gameId)
    .order("tier")
    .order("name");

  if (charErr) {
    throw new Error(charErr.message);
  }

  const [cardCountRows, pricedCards] = await Promise.all([
    fetchPaged<{ character_id: string | null }>((from, to) =>
      supabase
        .from("cards")
        .select("character_id")
        .eq("game_id", gameId)
        .not("character_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchPaged<PricedCharacterCardRow>((from, to) =>
      supabase
        .from("cards")
        .select(`
          id,
          character_id,
          name,
          card_number,
          variant_label,
          rarity,
          set_id,
          image_url,
          image_url_small,
          image_url_preview,
          card_image_id,
          sets!cards_set_game_fk (code, name),
          price_stats!price_stats_card_game_fk!inner (
            tcg_market,
            market_avg,
            chg_1d,
            chg_7d,
            chg_30d,
            ath,
            atl
          )
        `)
        .eq("game_id", gameId)
        .not("character_id", "is", null)
        .not("price_stats.tcg_market", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);

  const cardCounts = new Map<string, number>();
  for (const card of cardCountRows) {
    if (card.character_id) {
      cardCounts.set(card.character_id, (cardCounts.get(card.character_id) ?? 0) + 1);
    }
  }

  const cardsByCharacter = new Map<string, PricedCharacterCardRow[]>();
  const totalsByCharacter = new Map<string, { indexValue: number; totalChg7d: number; totalChg30d: number; pricedCount: number }>();

  for (const card of pricedCards) {
    if (!card.character_id) continue;
    const ps = firstRelation(card.price_stats);
    if (ps?.tcg_market == null) continue;

    const cards = cardsByCharacter.get(card.character_id) ?? [];
    cards.push(card);
    cardsByCharacter.set(card.character_id, cards);

    const totals = totalsByCharacter.get(card.character_id) ?? {
      indexValue: 0,
      totalChg7d: 0,
      totalChg30d: 0,
      pricedCount: 0,
    };
    totals.indexValue += ps.tcg_market;
    totals.totalChg7d += ps.chg_7d ?? 0;
    totals.totalChg30d += ps.chg_30d ?? 0;
    totals.pricedCount++;
    totalsByCharacter.set(card.character_id, totals);
  }

  const topCardsByCharacter = new Map<string, PricedCharacterCardRow[]>();

  for (const [characterId, cards] of Array.from(cardsByCharacter.entries())) {
    const topCards = [...cards]
      .sort((a, b) => (firstRelation(b.price_stats)?.tcg_market ?? 0) - (firstRelation(a.price_stats)?.tcg_market ?? 0))
      .slice(0, CHARACTER_TOP_CARD_LIMIT);
    topCardsByCharacter.set(characterId, topCards);
  }

  const results = ((characters ?? []) as CharacterRow[]).map((char) => {
    const totals = totalsByCharacter.get(char.id);
    const pricedCount = totals?.pricedCount ?? 0;
    const indexValue = totals?.indexValue ?? 0;
    const avgChg7d = pricedCount > 0 ? +((totals?.totalChg7d ?? 0) / pricedCount).toFixed(1) : 0;
    const avgChg30d = pricedCount > 0 ? +((totals?.totalChg30d ?? 0) / pricedCount).toFixed(1) : 0;

    return {
      slug: char.slug,
      name: char.name,
      subtitle: char.subtitle,
      faction: char.faction,
      tier: char.tier,
      indexValue: +indexValue.toFixed(2),
      cardCount: cardCounts.get(char.id) ?? 0,
      chg7d: avgChg7d,
      chg30d: avgChg30d,
      up: avgChg7d >= 0,
      topCards: (topCardsByCharacter.get(char.id) ?? []).map((card) => {
        const ps = firstRelation(card.price_stats);
        const setInfo = firstRelation(card.sets);
        return {
          name: card.name,
          set: setInfo?.code ?? "",
          rarity: card.rarity ?? "",
          tcg: ps?.tcg_market ?? 0,
          avg: ps?.market_avg ?? 0,
          chg1d: ps?.chg_1d ?? 0,
          chg7d: ps?.chg_7d ?? 0,
          chg30d: ps?.chg_30d ?? 0,
          spark: trendSpark(ps),
          imageUrlSmall: card.image_url_small ?? null,
          imageUrlPreview: card.image_url_preview ?? card.image_url ?? null,
          cardImageId: card.card_image_id ?? null,
        };
      }),
    };
  });

  return results
    .filter((r) => r.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue);
}

export async function GET(request: Request) {
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }

  try {
    const withCards = await cachedPublicData(
      publicDataCacheKey("api-characters-v7", gameResult.game.id),
      async () => {
        const summaryRows = await loadCharacterSummaries(gameResult.game.id);
        return summaryRows ?? loadCharacterIndex(gameResult.game.id);
      }
    );
    return NextResponse.json(withCards, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load character data." },
      { status: 500 }
    );
  }
}
