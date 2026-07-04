import { SetDetailPageContent } from "@/app/sets/[slug]/SetDetailPageContent";
import { CATALOG_DATA_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = CATALOG_DATA_TTL_SECONDS;

export async function generateMetadata({
  params,
}: {
  params: { game: string; slug: string };
}) {
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} - OWL Market` };
}

export default async function GameSetDetailPage({
  params,
}: {
  params: { game: string; slug: string };
}) {
  return <SetDetailPageContent slug={params.slug} gameRouteSlug={params.game} />;
}
