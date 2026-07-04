import { MarketsPageContent } from "@/app/markets/MarketsPageContent";
import { PRICE_DATA_TTL_SECONDS } from "@/lib/public-data-cache";
import { publicGameStaticParams } from "@/lib/static-game-params";

export const revalidate = PRICE_DATA_TTL_SECONDS;

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
