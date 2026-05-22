import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSets } from "../load-sets";
import type { SetData } from "../sets-data";
import SetDetailClient from "./SetDetailClient";
import "./set-detail.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug).toLowerCase();
  return { title: `${slug.toUpperCase()} — OWL Market` };
}

export default async function SetDetailPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug).toLowerCase();

  let loadedSets: SetData[] = [];
  try {
    const data = await loadSets();
    loadedSets = data.sets as unknown as SetData[];
  } catch (e) {
    console.error("Failed to load sets for detail page:", e);
    return (
      <section className="setd-page">
        <div className="setd-breadcrumb">
          <Link href="/">OWL Market</Link>
          <span className="bsep">›</span>
          <Link href="/sets">Sets</Link>
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

  return <SetDetailClient set={set} allSets={loadedSets} />;
}
