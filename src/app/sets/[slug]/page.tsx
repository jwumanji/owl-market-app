import { SetDetailPageContent } from "./SetDetailPageContent";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} — OWL Market` };
}

export default async function SetDetailPage({ params }: { params: { slug: string } }) {
  return <SetDetailPageContent slug={params.slug} />;
}
