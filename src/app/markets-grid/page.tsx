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
    <main className="markets-grid-page">
      <div className="ph-eyebrow">TCG &middot; Live prices &middot; Grid view</div>
      <div className="ph-title">
        Market grid &mdash; <span>top 20</span>
      </div>
      <div className="ph-sub">
        Sorted by market avg &middot; Updated every 60s &middot; One Piece TCG
      </div>
      <MarketGrid cards={cards} />
    </main>
  );
}
