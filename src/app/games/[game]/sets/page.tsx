import { SetsPageContent } from "@/app/sets/SetsPageContent";

export const dynamic = "force-dynamic";

export default async function GameSetsPage({
  params,
}: {
  params: { game: string };
}) {
  return <SetsPageContent gameRouteSlug={params.game} />;
}
