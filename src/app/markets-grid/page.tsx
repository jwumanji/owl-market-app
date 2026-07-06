import { createCachedServiceClient } from "@/lib/supabase-server";
import MarketGrid from "@/components/market/MarketGrid";
import { CardRow } from "@/lib/types";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import { resolveGameScope } from "@/lib/game-scope";
import { PRICE_DATA_TTL_SECONDS } from "@/lib/public-data-cache";
import { flattenPriceStatsCardRow } from "@/lib/supabase-relations";
import "./markets-grid.css";

// Keep in sync with PRICE_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 900;

export default async function MarketsGridPage() {
  const supabase = createCachedServiceClient(PRICE_DATA_TTL_SECONDS);
  const gameResult = await resolveGameScope(supabase, null, {
    defaultToOnePiece: true,
    publicOnly: true,
  });

  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }
  const { game } = gameResult;

  const { data } = await supabase
    .from("price_stats")
    .select(`
      market_avg,
      tcg_market,
      ebay_avg,
      chg_1d,
      chg_7d,
      chg_30d,
      cards!price_stats_card_game_fk!inner (
        id,
        card_image_id,
        card_number,
        name,
        name_base,
        variant_label,
        rarity,
        card_type,
        color,
        game_payload,
        image_url,
        image_url_small,
        image_url_preview,
        sets!cards_set_game_fk (
          id,
          slug,
          code,
          name,
          series,
          color,
          year
        )
      )
    `)
    .eq("game_id", game.id)
    .not("market_avg", "is", null)
    .order("market_avg", { ascending: false })
    .limit(20);

  const cards: CardRow[] = (withOnePiecePayloadFallbacksList(
    ((data as unknown as Record<string, unknown>[] | null) ?? [])
      .map(flattenPriceStatsCardRow)
      .filter((row): row is Record<string, unknown> => row != null)
  ) as unknown as CardRow[]).sort(
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
      <MarketGrid cards={cards} gameRouteSlug={game.routeSlug} />
    </main>
  );
}
