import { RaritiesPageContent } from "@/app/rarities/RaritiesPageContent";
import { publicGameStaticParams } from "@/lib/static-game-params";
import { RiftboundTreatments } from "./RiftboundTreatments";
import "../riftbound-pages.css";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export function generateStaticParams() {
  return publicGameStaticParams();
}

export default async function GameRaritiesPage(
  props: {
    params: Promise<{ game: string }>;
  }
) {
  const params = await props.params;
  return (
    <>
      <RaritiesPageContent gameRouteSlug={params.game} />
      {params.game === "riftbound" && <RiftboundTreatments gameRouteSlug={params.game} />}
    </>
  );
}
