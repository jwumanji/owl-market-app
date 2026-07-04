import CardDetailClient from "@/app/card/[id]/CardDetailClient";
import { loadCardDetailData } from "@/app/card/[id]/card-detail-data";
import { gameQueryValue } from "@/lib/game-routes";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

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
