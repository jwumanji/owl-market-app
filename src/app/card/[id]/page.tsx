import CardDetailClient from "./CardDetailClient";
import { loadCardDetailData } from "./card-detail-data";
import {
  DEFAULT_PUBLIC_GAME_DB_SLUG,
  DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
} from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  return {
    title: `${decodeURIComponent(params.id)} - OWL Market`,
  };
}

export default async function CardDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const result = await loadCardDetailData({
    id: params.id,
    game: DEFAULT_PUBLIC_GAME_DB_SLUG,
  });

  return (
    <CardDetailClient
      data={result.ok ? result.data : null}
      error={result.ok ? null : result.message}
      gameRouteSlug={DEFAULT_PUBLIC_GAME_ROUTE_SLUG}
    />
  );
}
