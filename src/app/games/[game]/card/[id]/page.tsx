import CardDetailClient from "@/app/card/[id]/CardDetailClient";
import { loadCardDetailData } from "@/app/card/[id]/card-detail-data";
import { gameQueryValue } from "@/lib/game-routes";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export async function generateMetadata({
  params,
}: {
  params: { game: string; id: string };
}) {
  return {
    title: `${decodeURIComponent(params.id)} - ${params.game.replace(/-/g, " ")} card - OWL Market`,
  };
}

export default async function GameCardDetailPage({
  params,
}: {
  params: { game: string; id: string };
}) {
  const result = await loadCardDetailData({
    id: params.id,
    game: gameQueryValue(params.game),
  });

  return (
    <CardDetailClient
      data={result.ok ? result.data : null}
      error={result.ok ? null : result.message}
      gameRouteSlug={params.game}
    />
  );
}
