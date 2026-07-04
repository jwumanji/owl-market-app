import { SetsPageContent } from "./SetsPageContent";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export default async function SetsPage() {
  return <SetsPageContent />;
}
