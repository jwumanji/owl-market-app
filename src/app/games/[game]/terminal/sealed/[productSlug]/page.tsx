import { SealedDetailContent } from "@/app/terminal/sealed/[productSlug]/SealedDetailContent";
import {
  loadTrackedSealedSlugs,
  sealedDetailTitle,
} from "@/app/terminal/sealed/[productSlug]/load-sealed-detail";
import { publicGameStaticParams } from "@/lib/static-game-params";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// Compose game × tracked slug, per the /sets convention on [game]. Games with
// zero tracked products (e.g. Lorcana today) contribute no params; their
// unknown slugs render on demand and 404 via notFound().
export async function generateStaticParams() {
  try {
    const games = publicGameStaticParams();
    const perGame = await Promise.all(
      games.map(async ({ game }) => {
        const slugs = await loadTrackedSealedSlugs(game);
        return slugs.map((productSlug) => ({ game, productSlug }));
      })
    );
    return perGame.flat();
  } catch (error) {
    // A build must never fail because the DB was unreachable — the Vercel
    // build env has no Supabase creds; pages fall back to on-demand rendering.
    console.warn("generateStaticParams(terminal-sealed/[game]) skipped:", error);
    return [];
  }
}

export async function generateMetadata(
  props: {
    params: Promise<{ game: string; productSlug: string }>;
  }
) {
  const params = await props.params;
  return {
    title: `${sealedDetailTitle(params.productSlug)} - OWL Market`,
  };
}

export default async function GameSealedDetailPage(
  props: {
    params: Promise<{ game: string; productSlug: string }>;
  }
) {
  const params = await props.params;
  return <SealedDetailContent slug={params.productSlug} gameRouteSlug={params.game} />;
}
