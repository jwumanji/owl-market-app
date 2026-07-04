import { RaritiesPageContent } from "./RaritiesPageContent";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export default async function RaritiesPage() {
  return <RaritiesPageContent />;
}
