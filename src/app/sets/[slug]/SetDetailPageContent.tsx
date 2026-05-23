import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSets } from "../load-sets";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import type { SetData } from "../sets-data";
import SetDetailClient from "./SetDetailClient";
import "./set-detail.css";

export const dynamic = "force-dynamic";

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
  try {
    const data = await loadSets({ game: gameRouteSlug });
    loadedSets = data.sets as unknown as SetData[];
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

  const set = loadedSets.find((s) => s.slug.toLowerCase() === slug || s.code.toLowerCase() === slug);
  if (!set) {
    notFound();
  }

  return <SetDetailClient set={set} allSets={loadedSets} gameRouteSlug={gameRouteSlug} />;
}

export default async function SetDetailPage({ params }: { params: { slug: string } }) {
  return <SetDetailPageContent slug={params.slug} />;
}
