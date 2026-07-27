import { RaritiesPageContent } from "./RaritiesPageContent";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;
// This legacy path redirects at the edge to the game-scoped route.
export const dynamic = "force-dynamic";

export default async function RaritiesPage() {
  return <RaritiesPageContent />;
}
