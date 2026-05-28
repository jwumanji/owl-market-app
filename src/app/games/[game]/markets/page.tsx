import { MarketsPageContent } from "@/app/markets/MarketsPageContent";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export function generateStaticParams() {
  return publicGameStaticParams();
}

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
