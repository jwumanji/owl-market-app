import { createServiceClient } from "@/lib/supabase-server";
import { CardRow, SetInfo, DashboardData, DashboardCard, RarityRankItem, CharacterRankItem, SealedRankItem, EbaySaleItem } from "@/lib/types";
import MarketTable from "@/components/market/MarketTable";
import MarketDashboard from "@/components/market/MarketDashboard";
import { RARITY_META } from "@/app/rarities/rarities-data";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG, resolveGameScope } from "@/lib/game-scope";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

/* ── Shape a card query result into DashboardCard ── */
function toDashboardCard(row: Record<string, unknown>): DashboardCard {
  const ps = row.price_stats as { market_avg: number | null; chg_1d: number | null } | null;
  const set = row.sets as { code: string } | null;
  return {
    id: row.id as string,
    card_image_id: row.card_image_id as string,
    name: row.name as string,
    rarity: (row.rarity as string | null) ?? null,
    image_url_small: (row.image_url_small as string | null) ?? null,
    set_code: set?.code ?? null,
    market_avg: ps?.market_avg ?? null,
    chg_1d: ps?.chg_1d ?? null,
  };
}

const CARD_SELECT = `
  id, card_image_id, name, rarity, image_url_small,
  sets (code),
  price_stats!inner (market_avg, chg_1d)
`;

const PREMIUM_RARITIES = ["MR", "PROMO", "SP", "SEC", "TR"];

export async function MarketsPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: true,
    publicOnly: true,
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
    charsRes,
    sealedRes,
    ebayRes,
  ] = await Promise.all([
    // Existing: top 20 by market value
    supabase
      .from("cards")
      .select(`
        id, card_image_id, card_number, name, name_base, variant_label, rarity,
        card_type, color, game_payload, image_url, image_url_small,
        price_stats (market_avg, tcg_market, ebay_avg, chg_1d, chg_7d, chg_30d),
        sets (id, slug, code, name, series, color, year)
      `)
      .eq("game_id", game.id)
      .not("price_stats", "is", null)
      .order("market_avg", { referencedTable: "price_stats", ascending: false })
      .limit(20),

    supabase
      .from("sets")
      .select("id, slug, code, name, series, color, year")
      .eq("game_id", game.id)
      .order("name"),

    // Trending: high-value cards with positive gains
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("game_id", game.id)
      .gt("price_stats.market_avg", 5)
      .gt("price_stats.chg_1d", 0)
      .order("chg_1d", { referencedTable: "price_stats", ascending: false })
      .limit(5),

    // Top Gainers
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("game_id", game.id)
      .not("price_stats.chg_1d", "is", null)
      .order("chg_1d", { referencedTable: "price_stats", ascending: false })
      .limit(5),

    // Top Losers
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("game_id", game.id)
      .not("price_stats.chg_1d", "is", null)
      .order("chg_1d", { referencedTable: "price_stats", ascending: true })
      .limit(5),

    // Rarity aggregation: fetch all cards for premium rarities
    supabase
      .from("cards")
      .select("rarity, price_stats!inner (market_avg, chg_1d)")
      .eq("game_id", game.id)
      .in("rarity", PREMIUM_RARITIES),

    // Characters (top 20 by tier, then we compute index)
    supabase
      .from("characters")
      .select("id, slug, name")
      .eq("game_id", game.id)
      .order("tier")
      .limit(20),

    // Sealed boxes
    supabase
      .from("sealed_products")
      .select("name, product_type, market_avg, chg_1d, sets (code)")
      .eq("game_id", game.id)
      .not("market_avg", "is", null)
      .order("market_avg", { ascending: false })
      .limit(5),

    // Recent eBay sales
    supabase
      .from("ebay_sales")
      .select("sale_price, sold_at, title")
      .eq("game_id", game.id)
      .not("sale_price", "is", null)
      .order("sold_at", { ascending: false })
      .limit(5),
  ]);

  // ── Existing table data ──
  const cards = (withOnePiecePayloadFallbacksList(
    (cardsRes.data as unknown as Record<string, unknown>[] | null) ?? []
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

  // ── Dashboard: Trending / Gainers / Losers ──
  const trending = ((trendingRes.data ?? []) as Record<string, unknown>[])
    .sort((a, b) => {
      const pa = a.price_stats as { chg_1d: number | null } | null;
      const pb = b.price_stats as { chg_1d: number | null } | null;
      return (pb?.chg_1d ?? 0) - (pa?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  const topGainers = ((gainersRes.data ?? []) as Record<string, unknown>[])
    .sort((a, b) => {
      const pa = a.price_stats as { chg_1d: number | null } | null;
      const pb = b.price_stats as { chg_1d: number | null } | null;
      return (pb?.chg_1d ?? 0) - (pa?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  const topLosers = ((losersRes.data ?? []) as Record<string, unknown>[])
    .sort((a, b) => {
      const pa = a.price_stats as { chg_1d: number | null } | null;
      const pb = b.price_stats as { chg_1d: number | null } | null;
      return (pa?.chg_1d ?? 0) - (pb?.chg_1d ?? 0);
    })
    .map(toDashboardCard);

  // ── Dashboard: Rarity Ranking ──
  const rarityGroups: Record<string, { prices: number[]; changes: number[] }> = {};
  for (const row of (rarityCardsRes.data ?? []) as unknown as { rarity: string; price_stats: { market_avg: number | null; chg_1d: number | null } }[]) {
    const r = row.rarity;
    if (!rarityGroups[r]) rarityGroups[r] = { prices: [], changes: [] };
    if (row.price_stats?.market_avg != null) {
      rarityGroups[r].prices.push(row.price_stats.market_avg);
      rarityGroups[r].changes.push(row.price_stats.chg_1d ?? 0);
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
  const charList = (charsRes.data ?? []) as { id: string; slug: string; name: string }[];
  if (charList.length > 0) {
    const charIds = charList.map((c) => c.id);
    const { data: charCards } = await supabase
      .from("cards")
      .select("character_id, rarity, price_stats!inner (market_avg, chg_1d)")
      .eq("game_id", game.id)
      .in("character_id", charIds);

    const charMap: Record<string, { total: number; chgSum: number; count: number; rarities: Set<string> }> = {};
    for (const row of (charCards ?? []) as unknown as { character_id: string; rarity: string | null; price_stats: { market_avg: number | null; chg_1d: number | null } }[]) {
      if (!charMap[row.character_id]) {
        charMap[row.character_id] = { total: 0, chgSum: 0, count: 0, rarities: new Set() };
      }
      const m = charMap[row.character_id];
      m.total += row.price_stats?.market_avg ?? 0;
      m.chgSum += row.price_stats?.chg_1d ?? 0;
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
