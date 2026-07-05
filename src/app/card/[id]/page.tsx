import CardDetailClient from "./CardDetailClient";
import { loadCardCore, loadCardHistory } from "./card-detail-data";
import {
  DEFAULT_PUBLIC_GAME_DB_SLUG,
  DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
} from "@/lib/game-scope";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export async function generateMetadata(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  return {
    title: `${decodeURIComponent(params.id)} - OWL Market`,
  };
}

export default async function CardDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const result = await loadCardCore({
    id: params.id,
    game: DEFAULT_PUBLIC_GAME_DB_SLUG,
  });

  // Deliberately NOT awaited — streams to the chart's Suspense boundary.
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
      gameRouteSlug={DEFAULT_PUBLIC_GAME_ROUTE_SLUG}
    />
  );
}
