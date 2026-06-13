import { SetsPageContent } from "./SetsPageContent";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export default async function SetsPage() {
  return <SetsPageContent />;
}
