import { MarketsPageContent } from "./MarketsPageContent";

// Keep in sync with PRICE_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 900;

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

export default async function MarketsPage() {
  return <MarketsPageContent />;
}
