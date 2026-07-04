import { SetDetailPageContent } from "./SetDetailPageContent";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} — OWL Market` };
}

export default async function SetDetailPage({ params }: { params: { slug: string } }) {
  return <SetDetailPageContent slug={params.slug} />;
}
