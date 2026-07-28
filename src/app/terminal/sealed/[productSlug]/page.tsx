import { SealedDetailContent } from "./SealedDetailContent";
import { loadTrackedSealedSlugs, sealedDetailTitle } from "./load-sealed-detail";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// Prerender every tracked product for the default game. Unknown slugs render
// on demand and 404 via notFound() in SealedDetailContent.
export async function generateStaticParams() {
  try {
    const slugs = await loadTrackedSealedSlugs();
    return slugs.map((productSlug) => ({ productSlug }));
  } catch (error) {
    // A build must never fail because the DB was unreachable — the Vercel
    // build env has no Supabase creds; pages fall back to on-demand rendering.
    console.warn("generateStaticParams(terminal-sealed) skipped:", error);
    return [];
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ productSlug: string }>;
  }
) {
  const params = await props.params;
  return {
    title: `${sealedDetailTitle(params.productSlug)} - OWL Market`,
  };
}

export default async function SealedDetailPage(
  props: {
    params: Promise<{ productSlug: string }>;
  }
) {
  const params = await props.params;
  return <SealedDetailContent slug={params.productSlug} />;
}
