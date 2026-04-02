import { createServiceClient } from "@/lib/supabase-server";
import { CardRow, SetInfo } from "@/lib/types";
import MarketTable from "@/components/market/MarketTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top 200 One Piece TCG cards ranked by market value.",
};

export default async function MarketsPage() {
  const supabase = createServiceClient();

  const [cardsRes, setsRes] = await Promise.all([
    supabase
      .from("cards")
      .select(`
        id,
        card_image_id,
        card_number,
        name,
        name_base,
        variant_label,
        rarity,
        card_type,
        color,
        image_url,
        image_url_small,
        price_stats (
          market_avg,
          tcg_market,
          ebay_avg,
          chg_1d,
          chg_7d,
          chg_30d
        ),
        sets (
          id,
          slug,
          code,
          name,
          series,
          color,
          year
        )
      `)
      .not("price_stats", "is", null)
      .order("market_avg", { referencedTable: "price_stats", ascending: false })
      .limit(200),

    supabase
      .from("sets")
      .select("id, slug, code, name, series, color, year")
      .order("name"),
  ]);

  // Fallback JS sort in case referencedTable ordering doesn't work
  const cards = ((cardsRes.data as CardRow[] | null) ?? []).sort(
    (a, b) => (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
  );

  const sets = (setsRes.data as SetInfo[] | null) ?? [];

  return (
    <section className="max-w-[1400px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1 tracking-tight">Markets</h1>
      <p className="text-text-2 text-sm mb-6">
        Top 200 cards by market value
      </p>
      <MarketTable cards={cards} sets={sets} />
    </section>
  );
}
