import { SetsPageContent } from "./SetsPageContent";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export default async function SetsPage() {
  return <SetsPageContent />;
}
