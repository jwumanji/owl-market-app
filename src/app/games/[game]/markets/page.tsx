import { MarketsPageContent } from "@/app/markets/MarketsPageContent";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export const metadata = {
  title: "Markets - OWL Market",
  description: "Top cards ranked by market value.",
};

export default async function GameMarketsPage({
  params,
}: {
  params: { game: string };
}) {
  return <MarketsPageContent gameRouteSlug={params.game} />;
}
