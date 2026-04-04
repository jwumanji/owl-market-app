export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase-server";
import MarketGrid from "@/components/market/MarketGrid";
import { CardRow } from "@/lib/types";

export default async function MarketsGridPage() {
  const supabase = createServiceClient();

  const { data } = await supabase
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
    .limit(20);

  const cards: CardRow[] = ((data as unknown as CardRow[]) ?? []).sort(
    (a, b) => (b.price_stats?.market_avg ?? 0) - (a.price_stats?.market_avg ?? 0)
  );

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 1400, margin: "0 auto" }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 24,
          color: "var(--text)",
        }}
      >
        Market Grid
      </h1>
      <MarketGrid cards={cards} />
    </main>
  );
}
