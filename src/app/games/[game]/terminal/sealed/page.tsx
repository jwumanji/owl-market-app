import { SealedTrackerContent } from "@/app/terminal/sealed/SealedTrackerContent";
import { publicGameStaticParams } from "@/lib/static-game-params";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default async function GameSealedTrackerPage(
  props: {
    params: Promise<{ game: string }>;
  }
) {
  const params = await props.params;
  return <SealedTrackerContent gameRouteSlug={params.game} />;
}
