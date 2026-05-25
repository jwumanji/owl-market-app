import { NextResponse } from "next/server";
import { RARITY_META } from "@/app/rarities/rarities-data";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";
import { cachedPublicData, PUBLIC_DATA_CACHE_HEADERS, publicDataCacheKey } from "@/lib/public-data-cache";
import { firstRelation } from "@/lib/supabase-relations";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATALOG_RARITY_COLORS = [
  { color: "#4F8EF7", colorD: "rgba(79,142,247,0.14)", colorBd: "rgba(79,142,247,0.3)" },
  { color: "#00D68F", colorD: "rgba(0,214,143,0.14)", colorBd: "rgba(0,214,143,0.3)" },
  { color: "#E8A020", colorD: "rgba(232,160,32,0.18)", colorBd: "rgba(232,160,32,0.38)" },
  { color: "#9B72FF", colorD: "rgba(155,114,255,0.14)", colorBd: "rgba(155,114,255,0.3)" },
  { color: "#FF4560", colorD: "rgba(255,69,96,0.14)", colorBd: "rgba(255,69,96,0.3)" },
  { color: "#20C9B0", colorD: "rgba(32,201,176,0.18)", colorBd: "rgba(32,201,176,0.38)" },
];

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

type SetRelation = {
  code: string | null;
  name: string | null;
};

type PriceStatsRelation = {
  tcg_market: number | null;
  market_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
};

type CatalogRarityRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type CatalogCardRow = {
  id: string;
  rarity_id: string | null;
  card_image_id: string | null;
  card_number: string | null;
  name: string;
  rarity: string | null;
  image_url: string | null;
  image_url_small: string | null;
  sets: SetRelation | SetRelation[] | null;
};

type RarityCountCardRow = {
  rarity: string | null;
  set_id: string | null;
};

type PricedRarityCardRow = {
  id: string;
  name: string;
  card_number: string | null;
  variant_label: string | null;
  rarity: string | null;
  card_image_id: string | null;
  image_url: string | null;
  image_url_small: string | null;
  set_id: string | null;
  sets: SetRelation | SetRelation[] | null;
  price_stats: PriceStatsRelation | PriceStatsRelation[] | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

async function loadCatalogOnlyRarities(supabase: SupabaseServiceClient, gameId: string) {
  const { data: rarityRows, error } = await supabase
    .from("game_rarities")
    .select("id, code, name, sort_order")
    .eq("game_id", gameId)
    .order("sort_order")
    .order("code");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (rarityRows ?? []) as CatalogRarityRow[];
  const rarityIds = rows.map((rarity) => rarity.id);
  const cardsByRarity = new Map<string, CatalogCardRow[]>();

  if (rarityIds.length > 0) {
    const cards = await fetchPaged<CatalogCardRow>((from, to) =>
      supabase
        .from("cards")
        .select(`
          id,
          rarity_id,
          card_image_id,
          card_number,
          name,
          rarity,
          image_url,
          image_url_small,
          sets!cards_set_game_fk (code, name)
        `)
        .eq("game_id", gameId)
        .in("rarity_id", rarityIds)
        .order("card_number")
        .range(from, to)
    );

    for (const card of cards) {
      if (!card.rarity_id) continue;
      const grouped = cardsByRarity.get(card.rarity_id) ?? [];
      grouped.push(card);
      cardsByRarity.set(card.rarity_id, grouped);
    }
  }

  const results = rows.map((rarity, index) => {
    const cards = cardsByRarity.get(rarity.id) ?? [];
    const color = CATALOG_RARITY_COLORS[index % CATALOG_RARITY_COLORS.length];
    const code = rarity.code ?? rarity.name ?? "Unknown";
    const name = rarity.name ?? rarity.code ?? "Unknown";

    return {
      slug: slugify(code || name),
      name,
      code,
      subtitle: "Catalog taxonomy imported for this game. Pricing is not enabled yet.",
      color: color.color,
      colorD: color.colorD,
      colorBd: color.colorBd,
      indexValue: 0,
      cardCount: cards.length,
      avgCardPrice: 0,
      chg7d: 0,
      chg30d: 0,
      up: true,
      spark: [10, 10],
      pricingStatus: "catalog_only" as const,
      topCards: cards.slice(0, 10).map((card) => {
        const set = firstRelation(card.sets);
        return {
          cardId: card.id,
          cardImageId: card.card_image_id ?? undefined,
          name: card.name,
          set: set?.code ?? "",
          rarity: card.rarity ?? name,
          tcg: 0,
          avg: 0,
          chg1d: 0,
          chg7d: 0,
          chg30d: 0,
          spark: [10, 10],
          imageSmall: card.image_url_small ?? card.image_url ?? null,
        };
      }),
    };
  });

  return NextResponse.json(
    results.filter((rarity) => rarity.cardCount > 0).sort((a, b) => b.cardCount - a.cardCount),
    { headers: PUBLIC_DATA_CACHE_HEADERS }
  );
}

function onePieceRarityCode(
  card: { rarity: string | null; set_id: string | null },
  promoSetId: string | null,
  nonPromoRarities: Set<string>
) {
  const rarity = (card.rarity ?? "").toUpperCase();
  if ((promoSetId && card.set_id === promoSetId) || rarity === "PR" || rarity === "PROMO") {
    return "PROMO";
  }
  if (nonPromoRarities.has(rarity)) return rarity;
  return null;
}

async function loadOnePieceRarityIndex(supabase: SupabaseServiceClient, gameId: string) {
  const distinctRarities = Object.keys(RARITY_META).filter((code) => code !== "SEALED");
  const nonPromoRarities = new Set(distinctRarities.filter((code) => code !== "PROMO"));

  const { data: promoSet, error: promoSetError } = await supabase
    .from("sets")
    .select("id")
    .eq("game_id", gameId)
    .eq("slug", "promo")
    .maybeSingle();

  if (promoSetError) throw new Error(promoSetError.message);
  const promoSetId = (promoSet?.id as string | null | undefined) ?? null;

  const rarityCounts: Record<string, number> = Object.fromEntries(distinctRarities.map((code) => [code, 0]));
  const [countCards, pricedCards] = await Promise.all([
    fetchPaged<RarityCountCardRow>((from, to) =>
      supabase
        .from("cards")
        .select("rarity, set_id")
        .eq("game_id", gameId)
        .order("id")
        .range(from, to)
    ),
    fetchPaged<PricedRarityCardRow>((from, to) =>
      supabase
        .from("cards")
        .select(`
          id,
          name,
          card_number,
          variant_label,
          rarity,
          card_image_id,
          image_url,
          image_url_small,
          set_id,
          sets!cards_set_game_fk (code, name),
          price_stats!price_stats_card_game_fk!inner (
            tcg_market,
            market_avg,
            chg_1d,
            chg_7d,
            chg_30d
          )
        `)
        .eq("game_id", gameId)
        .not("price_stats.tcg_market", "is", null)
        .order("id")
        .range(from, to)
    ),
  ]);

  for (const card of countCards) {
    const code = onePieceRarityCode(card, promoSetId, nonPromoRarities);
    if (code) rarityCounts[code] = (rarityCounts[code] ?? 0) + 1;
  }

  const rarityAgg: Record<string, { indexValue: number; totalChg7d: number; totalChg30d: number; pricedCount: number }> = {};
  const topCandidates: Record<string, PricedRarityCardRow[]> = {};

  for (const card of pricedCards) {
    const code = onePieceRarityCode(card, promoSetId, nonPromoRarities);
    const ps = firstRelation(card.price_stats);
    if (!code || ps?.tcg_market == null) continue;

    const agg = rarityAgg[code] ?? { indexValue: 0, totalChg7d: 0, totalChg30d: 0, pricedCount: 0 };
    agg.indexValue += ps.tcg_market;
    agg.totalChg7d += ps.chg_7d ?? 0;
    agg.totalChg30d += ps.chg_30d ?? 0;
    agg.pricedCount++;
    rarityAgg[code] = agg;

    const group = topCandidates[code] ?? [];
    group.push(card);
    topCandidates[code] = group;
  }

  const topCardsByRarity: Record<string, PricedRarityCardRow[]> = {};

  for (const code of distinctRarities) {
    const topCards = (topCandidates[code] ?? [])
      .sort((a, b) => (firstRelation(b.price_stats)?.tcg_market ?? 0) - (firstRelation(a.price_stats)?.tcg_market ?? 0))
      .slice(0, 10);

    topCardsByRarity[code] = topCards;
  }

  return distinctRarities
    .map((code) => {
      const meta = RARITY_META[code];
      if (!meta) return null;

      const cardCount = rarityCounts[code] ?? 0;
      const agg = rarityAgg[code];
      const indexValue = agg ? +agg.indexValue.toFixed(2) : 0;
      const pricedCount = agg?.pricedCount ?? 0;
      const avgChg7d = pricedCount > 0 ? +(agg!.totalChg7d / pricedCount).toFixed(1) : 0;
      const avgChg30d = pricedCount > 0 ? +(agg!.totalChg30d / pricedCount).toFixed(1) : 0;

      return {
        slug: code.toLowerCase(),
        name: meta.name,
        code,
        subtitle: meta.subtitle,
        color: meta.color,
        colorD: meta.colorD,
        colorBd: meta.colorBd,
        indexValue,
        cardCount,
        avgCardPrice: pricedCount > 0 ? +(indexValue / pricedCount).toFixed(2) : 0,
        chg7d: avgChg7d,
        chg30d: avgChg30d,
        up: avgChg7d >= 0,
        topCards: (topCardsByRarity[code] ?? []).map((card) => {
          const ps = firstRelation(card.price_stats);
          const setInfo = firstRelation(card.sets);
          return {
            name: card.name,
            set: setInfo?.code ?? "",
            rarity: card.rarity ?? code,
            tcg: ps?.tcg_market ?? 0,
            avg: ps?.market_avg ?? 0,
            chg1d: ps?.chg_1d ?? 0,
            chg7d: ps?.chg_7d ?? 0,
            chg30d: ps?.chg_30d ?? 0,
            spark: trendSpark(ps),
            cardImageId: card.card_image_id ?? "",
            imageSmall: card.image_url_small ?? card.image_url ?? null,
          };
        }),
      };
    })
    .filter((rarity): rarity is NonNullable<typeof rarity> => rarity != null && (rarity.indexValue > 0 || rarity.cardCount > 0))
    .sort((a, b) => b.indexValue - a.indexValue);
}

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  if (game.slug !== ONE_PIECE_DB_SLUG) {
    return loadCatalogOnlyRarities(supabase, game.id);
  }

  try {
    const withCards = await cachedPublicData(publicDataCacheKey("api-rarities-v4", game.id), () =>
      loadOnePieceRarityIndex(supabase, game.id)
    );

    return NextResponse.json(withCards, {
      headers: PUBLIC_DATA_CACHE_HEADERS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rarity data." },
      { status: 500 }
    );
  }
}
