import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSetDetail } from "../load-sets";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";
import type { SetData } from "../sets-data";
import SetDetailClient from "./SetDetailClient";
import "./set-detail.css";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} — OWL Market` };
}

export async function SetDetailPageContent({
  slug: rawSlug,
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  slug: string;
  gameRouteSlug?: string | null;
}) {
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  let loadedSets: SetData[] = [];
  let set: SetData | null = null;
  let gameName = "One Piece TCG";
  try {
    const data = await loadSetDetail({ slug, game: gameRouteSlug });
    loadedSets = data.allSets as unknown as SetData[];
    set = data.set as unknown as SetData | null;
    gameName = data.game.name;
  } catch (e) {
    console.error("Failed to load sets for detail page:", e);
    return (
      <section className="setd-page">
        <div className="setd-breadcrumb">
          <Link href="/">OWL Market</Link>
          <span className="bsep">›</span>
          <Link href={gamePath(gameRouteSlug, "/sets")}>Sets</Link>
        </div>
        <p style={{ color: "var(--loss-2)", fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 13, fontWeight: 600 }}>
          Failed to load set data.
        </p>
      </section>
    );
  }

  if (!set) {
    notFound();
  }

  return <SetDetailClient set={set} allSets={loadedSets} gameRouteSlug={gameRouteSlug} gameName={gameName} />;
}

export default async function SetDetailPage({ params }: { params: { slug: string } }) {
  return <SetDetailPageContent slug={params.slug} />;
}
