import { MarketsPageContent } from "@/app/markets/MarketsPageContent";
import { publicGameStaticParams } from "@/lib/static-game-params";

// Keep in sync with PRICE_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 900;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export const metadata = {
  title: "Markets - OWL Market",
  description: "Top cards ranked by market value.",
};

export default async function GameMarketsPage(
  props: {
    params: Promise<{ game: string }>;
  }
) {
  const params = await props.params;
  return <MarketsPageContent gameRouteSlug={params.game} />;
}
