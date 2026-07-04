import { SetsPageContent } from "@/app/sets/SetsPageContent";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default async function GameSetsPage({
  params,
}: {
  params: { game: string };
}) {
  return <SetsPageContent gameRouteSlug={params.game} />;
}
