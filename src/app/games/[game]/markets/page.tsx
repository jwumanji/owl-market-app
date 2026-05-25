import { MarketsPageContent } from "@/app/markets/MarketsPageContent";

export const dynamic = "force-dynamic";

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
