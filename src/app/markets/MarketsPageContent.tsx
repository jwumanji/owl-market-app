import Link from "next/link";

import { loadCachedCharacterIndex } from "@/app/characters/characters-index-data";
import { loadRarities } from "@/app/rarities/load-rarities";
import { RARITY_INDEX_SLUGS } from "@/app/rarities/rarities-data";
import { getSetImageUrl } from "@/app/sets/set-images";
import MarketDashboard from "@/components/market/MarketDashboard";
import { gamePath } from "@/lib/game-routes";
import { characterIndexMarketRanking } from "@/lib/market-characters";
import { marketRarityRanking } from "@/lib/market-rarities";
import { attachCasePrices, rankBoosterBoxesByPrice, tcgPlayerProductImageUrl } from "@/lib/market-sealed";
import {
  DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
  publicOnlyForCatalogPreview,
  resolveGameScope,
} from "@/lib/game-scope";
import { cachedPublicData, PRICE_DATA_TTL_SECONDS, publicDataCacheKey } from "@/lib/public-data-cache";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { firstRelation, flattenPriceStatsCardRow } from "@/lib/supabase-relations";
import type {
  CharacterRankItem,
  DashboardCard,
  DashboardData,
  EbaySaleItem,
  MarketWindow,
  SealedRankItem,
} from "@/lib/types";

const cachedMarketData = <T,>(key: string, load: () => Promise<T>) =>
  cachedPublicData(key, load, PRICE_DATA_TTL_SECONDS);

export const metadata = {
  title: "Markets — Moon Market",
  description: "One Piece TCG movers, top cards, box sets, characters, and rarity performance.",
};

type PriceChangeStats = {
  market_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
};

type SetRelation = {
  id?: string | null;
  slug?: string | null;
  code?: string | null;
  name?: string | null;
};

type EbaySaleCardRelation = {
  id?: string | null;
  card_image_id?: string | null;
  card_number?: string | null;
  name?: string | null;
  sets?: SetRelation | SetRelation[] | null;
};

type EbaySaleRow = {
  ebay_item_id?: string | null;
  card_id?: string | null;
  sale_price?: number | null;
  currency?: string | null;
  sold_at?: string | null;
  title?: string | null;
  ebay_url?: string | null;
  cards?: EbaySaleCardRelation | EbaySaleCardRelation[] | null;
};

const DASHBOARD_PRICE_CARD_SELECT = `
  market_avg, chg_1d, chg_7d, chg_30d,
  cards!price_stats_card_game_fk!inner (
    id, card_image_id, card_number, name, rarity,
    image_url, image_url_small, image_url_preview,
    sets!cards_set_game_fk (code)
  )
`;

function cardChange(card: DashboardCard, window: MarketWindow) {
  return card.changes[window] ?? Number.NEGATIVE_INFINITY;
}

function toDashboardCard(row: Record<string, unknown>): DashboardCard {
  const ps = firstRelation(row.price_stats as PriceChangeStats | PriceChangeStats[] | null);
  const set = firstRelation(row.sets as SetRelation | SetRelation[] | null);

  return {
    id: row.id as string,
    card_image_id: row.card_image_id as string,
    card_number: (row.card_number as string | null) ?? null,
    name: row.name as string,
    rarity: (row.rarity as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    image_url_small: (row.image_url_small as string | null) ?? null,
    image_url_preview: (row.image_url_preview as string | null) ?? null,
    set_code: set?.code ?? null,
    market_avg: ps?.market_avg ?? null,
    changes: {
      "1D": ps?.chg_1d ?? null,
      "7D": ps?.chg_7d ?? null,
    },
  };
}

function mapDashboardCards(data: unknown) {
  return ((data ?? []) as Record<string, unknown>[])
    .map(flattenPriceStatsCardRow)
    .filter((row): row is Record<string, unknown> => row != null)
    .map(toDashboardCard);
}

function mapTopEbaySales(data: unknown): EbaySaleItem[] {
  const sales: EbaySaleItem[] = [];
  const seenCardIds = new Set<string>();

  for (const row of (data ?? []) as EbaySaleRow[]) {
    const card = firstRelation(row.cards);
    const cardId = row.card_id ?? card?.id ?? null;
    if (!cardId || seenCardIds.has(cardId) || !row.ebay_item_id || row.sale_price == null || !card?.card_image_id || !card.name) {
      continue;
    }

    const set = firstRelation(card.sets);
    seenCardIds.add(cardId);
    sales.push({
      ebay_item_id: row.ebay_item_id,
      card_id: cardId,
      card_image_id: card.card_image_id,
      card_name: card.name,
      card_number: card.card_number ?? null,
      set_code: set?.code ?? null,
      title: row.title ?? null,
      sale_price: row.sale_price,
      currency: row.currency ?? "USD",
      sold_at: row.sold_at ?? null,
      ebay_url: row.ebay_url ?? null,
    });
    if (sales.length === 5) break;
  }

  return sales;
}

async function renderMarketsPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const supabase = createCachedServiceClient(PRICE_DATA_TTL_SECONDS);
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) throw new Error(gameResult.error.message);
  const { game } = gameResult;
  const ebaySalesSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    topValueCardsRes,
    gainers1dRes,
    gainers7dRes,
    losers1dRes,
    losers7dRes,
    rarityIndex,
    characterIndex,
    sealedRes,
    topEbaySalesRes,
    catalogCountRes,
  ] = await Promise.all([
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "top-value-cards"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .not("market_avg", "is", null)
        .order("market_avg", { ascending: false })
        .limit(10)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "gainers-1d-100-plus"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .gte("market_avg", 100)
        .not("chg_1d", "is", null)
        .gt("chg_1d", 0)
        .order("chg_1d", { ascending: false })
        .limit(5)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "gainers-7d-100-plus"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .gte("market_avg", 100)
        .not("chg_7d", "is", null)
        .gt("chg_7d", 0)
        .order("chg_7d", { ascending: false })
        .limit(5)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "losers-1d-100-plus"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .gte("market_avg", 100)
        .not("chg_1d", "is", null)
        .lt("chg_1d", 0)
        .order("chg_1d", { ascending: true })
        .limit(5)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "losers-7d-100-plus"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .gte("market_avg", 100)
        .not("chg_7d", "is", null)
        .lt("chg_7d", 0)
        .order("chg_7d", { ascending: true })
        .limit(5)
    ),
    loadRarities({ game: game.routeSlug }),
    loadCachedCharacterIndex(game.id),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v4", game.id, "sealed"), async () =>
      await supabase
        .from("sealed_products")
        .select(`
          name, product_type, market_avg, chg_1d, chg_7d, chg_30d, image_url, tcg_product_id,
          sets!sealed_products_set_game_fk (id, slug, code, name)
        `)
        .eq("game_id", game.id)
        .limit(1000)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v4", game.id, "top-ebay-sales-90d-en"), async () =>
      await supabase
        .from("ebay_sales")
        .select(`
          ebay_item_id, card_id, sale_price, currency, sold_at, title, ebay_url,
          cards!ebay_sales_card_id_fkey!inner (
            id, card_image_id, card_number, name,
            sets!cards_set_game_fk (code)
          )
        `)
        .eq("game_id", game.id)
        .eq("cards.region", "en")
        .not("sale_price", "is", null)
        .not("sold_at", "is", null)
        .gte("sold_at", ebaySalesSince)
        .order("sale_price", { ascending: false, nullsFirst: false })
        .limit(250)
    ),
    cachedMarketData(publicDataCacheKey("markets-quickdash-v2", game.id, "catalog-count"), async () =>
      await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("game_id", game.id)
        .eq("region", "en")
    ),
  ]);

  const topValueCards = mapDashboardCards(topValueCardsRes.data)
    .sort((a, b) => (b.market_avg ?? Number.NEGATIVE_INFINITY) - (a.market_avg ?? Number.NEGATIVE_INFINITY));
  const topGainers1d = mapDashboardCards(gainers1dRes.data)
    .sort((a, b) => cardChange(b, "1D") - cardChange(a, "1D"));
  const topGainers7d = mapDashboardCards(gainers7dRes.data)
    .sort((a, b) => cardChange(b, "7D") - cardChange(a, "7D"));
  const topLosers1d = mapDashboardCards(losers1dRes.data)
    .sort((a, b) => cardChange(a, "1D") - cardChange(b, "1D"));
  const topLosers7d = mapDashboardCards(losers7dRes.data)
    .sort((a, b) => cardChange(a, "7D") - cardChange(b, "7D"));
  const topEbaySales = mapTopEbaySales(topEbaySalesRes.data);

  if (topValueCards.length === 0 && (catalogCountRes.count ?? 0) > 0) {
    return (
      <div className="qd-page-shell">
        <section className="qd-page-container">
          <div className="rounded-c-md border-[1.5px] border-ink bg-bg-2 p-8">
            <div className="mb-3 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
              Catalog preview · Pricing pending
            </div>
            <h1 className="mb-3 font-grotesk text-[34px] font-bold leading-tight text-ink">
              Market pricing is not live for {game.name} yet.
            </h1>
            <p className="max-w-[720px] font-mono-2 text-[13px] font-semibold leading-6 text-ink-2">
              {(catalogCountRes.count ?? 0).toLocaleString()} catalog cards are loaded. Pricing will appear here when a market provider is enabled.
            </p>
            <Link
              href={gamePath(game.routeSlug, "/catalog")}
              className="mt-6 inline-flex rounded-c-sm border-[1.5px] border-ink bg-ink px-4 py-2 font-mono-2 text-[11px] font-bold uppercase tracking-[0.08em] text-bg no-underline"
            >
              Open catalog
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const allRarities = marketRarityRanking(rarityIndex.rarities, 5, RARITY_INDEX_SLUGS);

  const allCharacters: CharacterRankItem[] = characterIndexMarketRanking(characterIndex, 5);

  const rawSealed: SealedRankItem[] = ((sealedRes.data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((row) => {
      const set = firstRelation(row.sets as SetRelation | SetRelation[] | null);
      const setImageUrl = set?.slug ? getSetImageUrl(set.slug) : null;
      const productImageUrl = tcgPlayerProductImageUrl(row.tcg_product_id as string | null);
      return {
        set_id: set?.id ?? null,
        set_slug: set?.slug ?? null,
        name: (row.name as string | null) ?? set?.name ?? "Booster box",
        set_code: set?.code ?? null,
        product_type: (row.product_type as string | null) ?? null,
        market_avg: (row.market_avg as number | null) ?? null,
        case_market_avg: null,
        total_set_value: 0,
        image_url: (row.image_url as string | null) ?? productImageUrl ?? setImageUrl,
        image_url_fallback: setImageUrl,
        changes: {
          "1D": (row.chg_1d as number | null) ?? null,
          "7D": (row.chg_7d as number | null) ?? null,
        },
      };
    });

  const pairedBoosterBoxes = attachCasePrices(rawSealed);
  const candidateSets = rankBoosterBoxesByPrice(pairedBoosterBoxes, pairedBoosterBoxes.length);
  const candidateSetIds = Array.from(new Set(candidateSets.flatMap((item) => item.set_id ? [item.set_id] : [])));
  const setValueById = new Map<string, number>();

  if (candidateSetIds.length > 0) {
    const setValueRows = await cachedMarketData(
      publicDataCacheKey("markets-quickdash-v3", game.id, "set-values", candidateSetIds.sort().join(",")),
      async () => {
        const rows: Array<{
          set_id: string | null;
          price_stats: { tcg_market: number | null; market_avg: number | null } | Array<{ tcg_market: number | null; market_avg: number | null }> | null;
        }> = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("cards")
            .select("id, set_id, price_stats!price_stats_card_game_fk (tcg_market, market_avg)")
            .eq("game_id", game.id)
            .eq("region", "en")
            .in("set_id", candidateSetIds)
            .order("id")
            .range(from, from + pageSize - 1);
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) break;
          rows.push(...data as unknown as typeof rows);
          if (data.length < pageSize) break;
        }
        return rows;
      },
    );

    for (const row of setValueRows as unknown as Array<{
      set_id: string | null;
      price_stats: { tcg_market: number | null; market_avg: number | null } | Array<{ tcg_market: number | null; market_avg: number | null }> | null;
    }>) {
      if (!row.set_id) continue;
      const priceStats = firstRelation(row.price_stats);
      const marketValue = priceStats?.tcg_market ?? priceStats?.market_avg ?? 0;
      setValueById.set(row.set_id, (setValueById.get(row.set_id) ?? 0) + marketValue);
    }
  }

  const sealedWithValues = candidateSets.map((item) => ({
    ...item,
    total_set_value: item.set_id ? +(setValueById.get(item.set_id) ?? 0).toFixed(2) : 0,
  }));

  const dashboardData: DashboardData = {
    topCards: {
      "1D": topValueCards.slice(0, 10),
      "7D": topValueCards.slice(0, 10),
    },
    topGainers: {
      "1D": topGainers1d.slice(0, 5),
      "7D": topGainers7d.slice(0, 5),
    },
    topLosers: {
      "1D": topLosers1d.slice(0, 5),
      "7D": topLosers7d.slice(0, 5),
    },
    topEbaySales,
    rarityRanking: {
      "7D": allRarities,
      "30D": allRarities,
    },
    topCharacters: {
      "7D": allCharacters,
    },
    sealedBoxes: {
      "1D": sealedWithValues,
      "7D": sealedWithValues,
    },
  };

  return (
    <div className="qd-page-shell">
      <div className="qd-page-container">
        <MarketDashboard data={dashboardData} gameRouteSlug={game.routeSlug} />
      </div>
    </div>
  );
}

export async function MarketsPageContent(
  props: { gameRouteSlug?: string | null } = {},
) {
  try {
    return await renderMarketsPageContent(props);
  } catch {
    const gameRouteSlug = props.gameRouteSlug ?? DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

    return (
      <div className="qd-page-shell">
        <section className="qd-page-container">
          <div className="rounded-c-md border-[1.5px] border-ink bg-bg-2 p-8">
            <div className="mb-3 font-mono-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
              Market service unavailable
            </div>
            <h1 className="mb-3 font-grotesk text-[34px] font-bold leading-tight text-ink">
              Live pricing is temporarily unavailable.
            </h1>
            <p className="max-w-[720px] font-mono-2 text-[13px] font-semibold leading-6 text-ink-2">
              The catalog is still available while the pricing service recovers. Please try the market page again shortly.
            </p>
            <Link
              href={gamePath(gameRouteSlug, "/catalog")}
              className="mt-6 inline-flex rounded-c-sm border-[1.5px] border-ink bg-ink px-4 py-2 font-mono-2 text-[11px] font-bold uppercase tracking-[0.08em] text-bg no-underline"
            >
              Open catalog
            </Link>
          </div>
        </section>
      </div>
    );
  }
}

export default async function MarketsPage() {
  return <MarketsPageContent />;
}
