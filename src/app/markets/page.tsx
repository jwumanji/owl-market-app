import { MarketsPageContent } from "./MarketsPageContent";
import { PRICE_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PRICE_DATA_TTL_SECONDS;

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

export default async function MarketsPage() {
  return <MarketsPageContent />;
}
