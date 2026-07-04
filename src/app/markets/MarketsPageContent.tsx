import Link from "next/link";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { CardRow, SetInfo, DashboardData, DashboardCard, RarityRankItem, CharacterRankItem, SealedRankItem, EbaySaleItem } from "@/lib/types";
import MarketTable from "@/components/market/MarketTable";
import MarketDashboard from "@/components/market/MarketDashboard";
import { RARITY_META } from "@/app/rarities/rarities-data";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { cachedPublicData, PRICE_DATA_TTL_SECONDS, publicDataCacheKey } from "@/lib/public-data-cache";
import { firstRelation, flattenPriceStatsCardRow } from "@/lib/supabase-relations";

const cachedMarketData = <T,>(key: string, load: () => Promise<T>) =>
  cachedPublicData(key, load, PRICE_DATA_TTL_SECONDS);


export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

/* ── Shape a card query result into DashboardCard ── */
function toDashboardCard(row: Record<string, unknown>): DashboardCard {
  const ps = firstRelation(row.price_stats as { market_avg: number | null; chg_1d: number | null } | Array<{ market_avg: number | null; chg_1d: number | null }> | null);
  const set = firstRelation(row.sets as { code: string } | Array<{ code: string }> | null);
  return {
    id: row.id as string,
    card_image_id: row.card_image_id as string,
    name: row.name as string,
    rarity: (row.rarity as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    image_url_small: (row.image_url_small as string | null) ?? null,
    image_url_preview: (row.image_url_preview as string | null) ?? null,
    set_code: set?.code ?? null,
    market_avg: ps?.market_avg ?? null,
    chg_1d: ps?.chg_1d ?? null,
  };
}

const DASHBOARD_PRICE_CARD_SELECT = `
  market_avg, chg_1d,
  cards!price_stats_card_game_fk!inner (
    id, card_image_id, name, rarity, image_url, image_url_small, image_url_preview,
    sets!cards_set_game_fk (code)
  )
`;

const MARKET_PRICE_CARD_SELECT = `
  market_avg, tcg_market, ebay_avg, chg_1d, chg_7d, chg_30d,
  cards!price_stats_card_game_fk!inner (
    id, card_image_id, card_number, name, name_base, variant_label, rarity,
    card_type, color, game_payload, image_url, image_url_small, image_url_preview,
    sets!cards_set_game_fk (id, slug, code, name, series, color, year)
  )
`;

const PREMIUM_RARITIES = ["MR", "PROMO", "SP", "SEC", "TR"];

export async function MarketsPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const supabase = createCachedServiceClient(PRICE_DATA_TTL_SECONDS);
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }
  const { game } = gameResult;

  const [
    cardsRes,
    setsRes,
    trendingRes,
    gainersRes,
    losersRes,
    rarityCardsRes,
    charBundle,
    sealedRes,
    ebayRes,
    catalogCountRes,
  ] = await Promise.all([
    // Existing: top 20 by market value
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "cards"), async () =>
      await supabase
        .from("price_stats")
        .select(MARKET_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .not("market_avg", "is", null)
        .order("market_avg", { ascending: false })
        .limit(20)
    ),

    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "sets"), async () =>
      await supabase
        .from("sets")
        .select("id, slug, code, name, series, color, year")
        .eq("game_id", game.id)
        .order("name")
    ),

    // Trending: high-value cards with positive gains
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "trending"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .gt("market_avg", 5)
        .gt("chg_1d", 0)
        .order("chg_1d", { ascending: false })
        .limit(5)
    ),

    // Top Gainers
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "gainers"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .not("chg_1d", "is", null)
        .order("chg_1d", { ascending: false })
        .limit(5)
    ),

    // Top Losers
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "losers"), async () =>
      await supabase
        .from("price_stats")
        .select(DASHBOARD_PRICE_CARD_SELECT)
        .eq("game_id", game.id)
        .not("chg_1d", "is", null)
        .order("chg_1d", { ascending: true })
        .limit(5)
    ),

    // Rarity aggregation: fetch all cards for premium rarities
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "rarity-cards"), async () =>
      await supabase
        .from("cards")
        .select("rarity, price_stats!price_stats_card_game_fk!inner (market_avg, chg_1d)")
        .eq("game_id", game.id)
        .in("rarity", PREMIUM_RARITIES)
    ),

    // Characters (top 20 by tier) + their cards. The second query depends on
    // the first, so both run inside one batch entry instead of serializing
    // after the Promise.all (M4).
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "characters-with-cards"), async () => {
      const { data: charRows } = await supabase
        .from("characters")
        .select("id, slug, name")
        .eq("game_id", game.id)
        .order("tier")
        .limit(20);
      const charList = (charRows ?? []) as { id: string; slug: string; name: string }[];
      if (charList.length === 0) return { charList, charCards: [] as Record<string, unknown>[] };

      const { data: charCards } = await supabase
        .from("cards")
        .select("character_id, rarity, price_stats!price_stats_card_game_fk!inner (market_avg, chg_1d)")
        .eq("game_id", game.id)
        .in("character_id", charList.map((c) => c.id));
      return { charList, charCards: (charCards ?? []) as Record<string, unknown>[] };
    }),

    // Sealed boxes
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "sealed"), async () =>
      await supabase
        .from("sealed_products")
        .select("name, product_type, market_avg, chg_1d, sets!sealed_products_set_game_fk (code)")
        .eq("game_id", game.id)
        .not("market_avg", "is", null)
        .order("market_avg", { ascending: false })
        .limit(5)
    ),

    // Recent eBay sales
    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "ebay"), async () =>
      await supabase
        .from("ebay_sales")
        .select("sale_price, sold_at, title")
        .eq("game_id", game.id)
        .not("sale_price", "is", null)
        .order("sold_at", { ascending: false })
        .limit(5)
    ),

    cachedMarketData(publicDataCacheKey("markets-page-v3", game.id, "catalog-count"), async () =>
      await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("game_id", game.id)
    ),
  ]);

  // ── Existing table data ──
  const cards = (withOnePiecePayloadFallbacksList(
    ((cardsRes.data as unknown as Record<string, unknown>[] | null) ?? [])
      .map(flattenPriceStatsCardRow)
      .filter((row): row is Record<string, unknown> => row != null)
  ) as unknown as CardRow[]).sort(
    (a, b) => (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
  );

  const PREFIX_ORDER: Record<string, number> = { OP: 0, EB: 1, PRB: 2 };
  const sets = ((setsRes.data as SetInfo[] | null) ?? []).sort((a, b) => {
    const parseCode = (code: string | null) => {
      const m = code?.match(/^([A-Z]+)(\d+)/);
      if (!m) return { prefix: "ZZZ", num: 999 };
      return { prefix: m[1], num: parseInt(m[2], 10) };
    };
    const pa = parseCode(a.code);
    const pb = parseCode(b.code);
    const oa = PREFIX_ORDER[pa.prefix] ?? 99;
    const ob = PREFIX_ORDER[pb.prefix] ?? 99;
    if (oa !== ob) return oa - ob;
    return pa.num - pb.num;
  });
  const catalogCardCount = catalogCountRes.count ?? 0;

  if (cards.length === 0 && catalogCardCount > 0) {
    return (
      <main className="bg-bg text-ink min-h-screen pt-8 pb-24">
        <section className="max-w-[1280px] mx-auto px-7">
          <header className="mb-6">
            <div className="font-mono-2 font-semibold text-[12px] text-ink-2 tracking-[0.14em] uppercase mb-3">
              TCG · Catalog preview · Pricing pending
            </div>
            <h1 className="font-grotesk font-bold text-[44px] leading-none tracking-[-0.025em] text-ink">
              Markets &mdash;{" "}
              <em
                className="font-script not-italic bg-grad-brand bg-clip-text text-transparent inline-block"
                style={{ fontSize: "56px", paddingRight: "12px", paddingBottom: "4px" }}
              >
                pending
              </em>
            </h1>
            <p className="mt-3 font-mono-2 font-semibold text-[13px] text-ink-2">
              {game.name}
              <span className="text-coral mx-1.5">·</span>
              {catalogCardCount.toLocaleString()} catalog cards loaded
              <span className="text-coral mx-1.5">·</span>
              Pricing provider not enabled
            </p>
          </header>

          <div className="rounded-c-md border-[1.5px] border-ink bg-bg-2 p-8">
            <div className="font-mono-2 text-[11px] uppercase tracking-[0.14em] text-ink-3 font-semibold mb-3">
              Catalog-only game
            </div>
            <h2 className="font-grotesk text-[28px] leading-tight font-bold text-ink mb-3">
              Market pricing is not live for {game.name} yet.
            </h2>
            <p className="font-mono-2 text-[13px] leading-6 font-semibold text-ink-2 max-w-[720px]">
              The catalog schema is loaded and scoped to this game, but market tables stay empty until
              a pricing provider is mapped for this game. Use the catalog and set index for smoke
              testing card data now.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href={gamePath(game.routeSlug, "/catalog")} className="rounded-c-sm border-[1.5px] border-ink bg-ink text-bg px-4 py-2 font-mono-2 text-[11px] font-bold uppercase tracking-[0.08em] no-underline">
                Open catalog
              </Link>
              <Link href={gamePath(game.routeSlug, "/sets")} className="rounded-c-sm border-[1.5px] border-ink bg-bg text-ink px-4 py-2 font-mono-2 text-[11px] font-bold uppercase tracking-[0.08em] no-underline">
                View sets
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ── Dashboard: Trending / Gainers / Losers ──
  const trending = ((trendingRes.data ?? []) as Record<string, unknown>[])
    .map(flattenPriceStatsCardRow)
    .filter((row): row is Record<string, unknown> => row != null)
    .sort((a, b) => {
      const pa = firstRelation(a.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      const pb = firstRelation(b.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      return (pb?.chg_1d ?? 0) - (pa?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  const topGainers = ((gainersRes.data ?? []) as Record<string, unknown>[])
    .map(flattenPriceStatsCardRow)
    .filter((row): row is Record<string, unknown> => row != null)
    .sort((a, b) => {
      const pa = firstRelation(a.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      const pb = firstRelation(b.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      return (pb?.chg_1d ?? 0) - (pa?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  const topLosers = ((losersRes.data ?? []) as Record<string, unknown>[])
    .map(flattenPriceStatsCardRow)
    .filter((row): row is Record<string, unknown> => row != null)
    .sort((a, b) => {
      const pa = firstRelation(a.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      const pb = firstRelation(b.price_stats as { chg_1d: number | null } | Array<{ chg_1d: number | null }> | null);
      return (pa?.chg_1d ?? 0) - (pb?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  // ── Dashboard: Rarity Ranking ──
  const rarityGroups: Record<string, { prices: number[]; changes: number[] }> = {};
  for (const row of (rarityCardsRes.data ?? []) as unknown as { rarity: string; price_stats: { market_avg: number | null; chg_1d: number | null } | Array<{ market_avg: number | null; chg_1d: number | null }> | null }[]) {
    const r = row.rarity;
    const ps = firstRelation(row.price_stats);
    if (!rarityGroups[r]) rarityGroups[r] = { prices: [], changes: [] };
    if (ps?.market_avg != null) {
      rarityGroups[r].prices.push(ps.market_avg);
      rarityGroups[r].changes.push(ps.chg_1d ?? 0);
    }
  }

  const rarityRanking: RarityRankItem[] = PREMIUM_RARITIES
    .map((code) => {
      const g = rarityGroups[code];
      const meta = RARITY_META[code];
      if (!g || g.prices.length === 0) {
        return { code, name: meta?.name ?? code, avg_price: 0, card_count: 0, chg_1d: 0 };
      }
      const avg_price = g.prices.reduce((s, v) => s + v, 0) / g.prices.length;
      const chg_1d = g.changes.reduce((s, v) => s + v, 0) / g.changes.length;
      return {
        code,
        name: meta?.name ?? code,
        avg_price: +avg_price.toFixed(2),
        card_count: g.prices.length,
        chg_1d: +chg_1d.toFixed(1),
      };
    })
    .sort((a, b) => b.avg_price - a.avg_price);

  // ── Dashboard: Top Characters ──
  let topCharacters: CharacterRankItem[] = [];
  const { charList, charCards } = charBundle;
  if (charList.length > 0) {
    const charMap: Record<string, { total: number; chgSum: number; count: number; rarities: Set<string> }> = {};
    for (const row of (charCards ?? []) as unknown as { character_id: string; rarity: string | null; price_stats: { market_avg: number | null; chg_1d: number | null } | Array<{ market_avg: number | null; chg_1d: number | null }> | null }[]) {
      if (!charMap[row.character_id]) {
        charMap[row.character_id] = { total: 0, chgSum: 0, count: 0, rarities: new Set() };
      }
      const m = charMap[row.character_id];
      const ps = firstRelation(row.price_stats);
      m.total += ps?.market_avg ?? 0;
      m.chgSum += ps?.chg_1d ?? 0;
      m.count++;
      if (row.rarity) m.rarities.add(row.rarity);
    }

    topCharacters = charList
      .map((c) => {
        const m = charMap[c.id];
        return {
          name: c.name,
          slug: c.slug,
          rarities: m ? Array.from(m.rarities) : [],
          chg_1d: m && m.count > 0 ? +(m.chgSum / m.count).toFixed(1) : 0,
          _index: m?.total ?? 0,
        };
      })
      .filter((c) => c._index > 0)
      .sort((a, b) => b._index - a._index)
      .slice(0, 5)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ _index, ...rest }) => rest);
  }

  // ── Dashboard: Sealed Boxes ──
  const sealedBoxes: SealedRankItem[] = ((sealedRes.data ?? []) as Record<string, unknown>[]).map((row) => {
    const s = row.sets as { code: string } | null;
    return {
      name: row.name as string,
      set_code: s?.code ?? null,
      product_type: (row.product_type as string | null) ?? null,
      market_avg: (row.market_avg as number | null) ?? null,
      chg_1d: (row.chg_1d as number | null) ?? null,
    };
  });

  // ── Dashboard: Top eBay Sales ──
  const topEbaySales: EbaySaleItem[] = ((ebayRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    title: (row.title as string | null) ?? null,
    sale_price: (row.sale_price as number | null) ?? null,
    sold_at: (row.sold_at as string | null) ?? null,
  }));

  // ── Compose dashboard data ──
  const dashboardData: DashboardData = {
    trending,
    topGainers,
    topLosers,
    rarityRanking,
    topCharacters,
    sealedBoxes,
    topEbaySales,
  };

  return (
    <main className="bg-bg text-ink min-h-screen pt-8 pb-24">
      <section className="max-w-[1280px] mx-auto px-7">
        <header className="mb-6">
          <div className="font-mono-2 font-semibold text-[12px] text-ink-2 tracking-[0.14em] uppercase mb-3">
            TCG · Live prices · Verified data
          </div>
          <h1 className="font-grotesk font-bold text-[44px] leading-none tracking-[-0.025em] text-ink">
            Markets &mdash;{" "}
            <em
              className="font-script not-italic bg-grad-brand bg-clip-text text-transparent inline-block"
              style={{ fontSize: "56px", paddingRight: "12px", paddingBottom: "4px" }}
            >
              live
            </em>
          </h1>
          <p className="mt-3 font-mono-2 font-semibold text-[13px] text-ink-2">
            Top 20 by market value
            <span className="text-coral mx-1.5">·</span>
            Updated every 60s
            <span className="text-coral mx-1.5">·</span>
            {game.name}
          </p>
        </header>
        <MarketDashboard data={dashboardData} gameRouteSlug={game.routeSlug} />
        <MarketTable cards={cards} sets={sets} gameRouteSlug={game.routeSlug} />
      </section>
    </main>
  );
}

export default async function MarketsPage() {
  return <MarketsPageContent />;
}
