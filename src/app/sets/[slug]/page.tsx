import { SetDetailPageContent } from "./SetDetailPageContent";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} — OWL Market` };
}

export default async function SetDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return <SetDetailPageContent slug={params.slug} />;
}
