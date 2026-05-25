import { MarketsPageContent } from "./MarketsPageContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets — OWL Market",
  description: "Top cards ranked by market value.",
};

export default async function MarketsPage() {
  return <MarketsPageContent />;
}
