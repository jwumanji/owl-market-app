import CardDetailClient from "@/app/card/[id]/CardDetailClient";
import { loadCardCore, loadCardHistory } from "@/app/card/[id]/card-detail-data";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gameQueryValue } from "@/lib/game-routes";
import { createServiceClient } from "@/lib/supabase-server";
import { ONE_PIECE_DB_SLUG } from "@/lib/games/one-piece";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// Pre-render the head of the traffic distribution at build time so those
// cards are cold-proof even right after a deploy (empty ISR cache). The
// long tail stays dynamic (dynamicParams defaults to true).
const STATIC_CARD_COUNT = Number(process.env.CARD_STATIC_PARAMS_COUNT ?? 150);

export async function generateStaticParams() {
  try {
    const supabase = createServiceClient();
    const { data: game } = await supabase
      .from("games")
      .select("id")
      .eq("slug", ONE_PIECE_DB_SLUG)
      .single();
    if (!game) return [];

    const { data: rows } = await supabase
      .from("price_stats")
      .select("cards!price_stats_card_game_fk!inner (card_image_id)")
      .eq("game_id", game.id)
      .not("market_avg", "is", null)
      .order("market_avg", { ascending: false })
      .limit(STATIC_CARD_COUNT);

    const ids = (rows ?? [])
      .map((row) => {
        const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
        return (card as { card_image_id?: string } | null)?.card_image_id;
      })
      .filter((id): id is string => Boolean(id));

    return ids.map((id) => ({ game: DEFAULT_PUBLIC_GAME_ROUTE_SLUG, id }));
  } catch (error) {
    // A build must never fail because the DB was unreachable — the pages
    // just fall back to on-demand rendering.
    console.warn("generateStaticParams(card) skipped:", error);
    return [];
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ game: string; id: string }>;
  }
) {
  const params = await props.params;
  return {
    title: `${decodeURIComponent(params.id)} - ${params.game.replace(/-/g, " ")} card - OWL Market`,
  };
}

export default async function GameCardDetailPage(
  props: {
    params: Promise<{ game: string; id: string }>;
  }
) {
  const params = await props.params;
  const result = await loadCardCore({
    id: params.id,
    game: gameQueryValue(params.game),
  });

  // Deliberately NOT awaited: the promise streams to the client and the
  // chart block unsuspends when the history query lands.
  const historyPromise = result.ok
    ? loadCardHistory({
        gameId: result.data.game.id,
        cardId: result.data.card.id,
        priceStats: result.data.priceStats,
      })
    : null;

  return (
    <CardDetailClient
      data={result.ok ? result.data : null}
      historyPromise={historyPromise}
      error={result.ok ? null : result.message}
      gameRouteSlug={params.game}
    />
  );
}
