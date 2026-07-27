import Link from "next/link";
import { redirect } from "next/navigation";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { gamePath } from "@/lib/game-routes";
import { publicGameStaticParams } from "@/lib/static-game-params";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import "../riftbound-pages.css";

export const revalidate = 3600;

export function generateStaticParams() {
  return publicGameStaticParams();
}

type EditionRow = {
  id: string;
  code: string;
  name: string;
  language_code: string | null;
  region_code: string | null;
  is_default: boolean;
};

function languageName(code: string | null) {
  if (!code) return "Unspecified";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export default async function RiftboundLanguagesPage(props: { params: Promise<{ game: string }> }) {
  const { game: gameRouteSlug } = await props.params;
  const supabase = createCachedServiceClient();
  const gameResult = await resolveGameScope(supabase, gameRouteSlug, {
    defaultToOnePiece: false,
    publicOnly: publicOnlyForCatalogPreview(),
  });
  if (gameResult.error) {
    return <main className="rb-page"><div className="rb-empty"><h2>Languages unavailable</h2><p>{gameResult.error.message}</p></div></main>;
  }
  if (gameResult.game.slug !== "riftbound") redirect(gamePath(gameRouteSlug, "/catalog"));

  const [editionsResult, cardsResult, pricedResult] = await Promise.all([
    supabase.from("game_editions").select("id, code, name, language_code, region_code, is_default").eq("game_id", gameResult.game.id).order("is_default", { ascending: false }),
    supabase.from("cards").select("region", { count: "exact", head: false }).eq("game_id", gameResult.game.id).range(0, 4999),
    supabase.from("price_stats").select("card_id", { count: "exact", head: true }).eq("game_id", gameResult.game.id),
  ]);

  const editions = (editionsResult.data ?? []) as EditionRow[];
  const regionCounts = new Map<string, number>();
  for (const row of cardsResult.data ?? []) {
    const region = typeof row.region === "string" ? row.region.toLowerCase() : "unspecified";
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }
  const cardCount = cardsResult.count ?? [...regionCounts.values()].reduce((sum, count) => sum + count, 0);
  const loadError = editionsResult.error?.message ?? cardsResult.error?.message ?? null;

  return (
    <main className="rb-page">
      <div className="rb-breadcrumb"><Link href={gamePath(gameRouteSlug, "/markets")}>Riftbound</Link> / Languages</div>
      <header className="rb-hero">
        <div className="rb-kicker">Edition coverage</div>
        <h1 className="rb-title">Riftbound, market by market.</h1>
        <p className="rb-subtitle">Language editions stay separated so card identities and prices are never mixed. New regions will appear here after both catalog and market coverage are verified.</p>
      </header>

      <section className="rb-stat-grid" aria-label="Language coverage summary">
        <div className="rb-stat"><span className="rb-stat-label">Editions tracked</span><strong className="rb-stat-value">{editions.length}</strong><span className="rb-stat-note">verified catalog editions</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Catalog cards</span><strong className="rb-stat-value">{cardCount.toLocaleString()}</strong><span className="rb-stat-note">all language rows</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Default market</span><strong className="rb-stat-value">{editions.find((edition) => edition.is_default)?.language_code?.toUpperCase() ?? "—"}</strong><span className="rb-stat-note">used throughout Moon Market</span></div>
        <div className="rb-stat"><span className="rb-stat-label">Priced cards</span><strong className="rb-stat-value">{pricedResult.count ? pricedResult.count.toLocaleString() : "Pending"}</strong><span className="rb-stat-note">live market coverage</span></div>
      </section>

      <section className="rb-section">
        <div className="rb-section-head"><div><h2 className="rb-section-title">Available editions</h2><p className="rb-section-copy">Only independently verified catalogs are shown as active.</p></div></div>
        {loadError ? <div className="rb-empty"><h2>Edition coverage could not be loaded</h2><p>{loadError}</p></div> : (
          <div className="rb-edition-grid">
            {editions.map((edition) => {
              const code = edition.language_code?.toLowerCase() ?? "unspecified";
              const count = edition.is_default
                ? cardCount
                : regionCounts.get(code) ?? 0;
              return <article className="rb-card" key={edition.id}>
                <span className={`rb-status${count ? "" : " is-pending"}`}>{count ? "Catalog active" : "Catalog pending"}</span>
                <h2 className="rb-card-title" style={{ marginTop: 15 }}>{edition.name}</h2>
                <p className="rb-card-copy">{languageName(edition.language_code)}{edition.region_code ? ` · ${edition.region_code}` : " · Global market"}</p>
                <div className="rb-metrics" style={{ marginTop: 18 }}>
                  <div className="rb-metric"><strong>{count.toLocaleString()}</strong><span>Cards</span></div>
                  <div className="rb-metric"><strong>{edition.language_code?.toUpperCase() ?? "—"}</strong><span>Language</span></div>
                  <div className="rb-metric"><strong>{edition.is_default ? "Yes" : "No"}</strong><span>Default</span></div>
                </div>
                {count ? <div className="rb-value"><Link href={gamePath(gameRouteSlug, "/catalog")}>Browse this catalog →</Link></div> : <div className="rb-value"><small>Market status</small>Awaiting verified catalog and price mapping</div>}
              </article>;
            })}
            {!editions.length && <div className="rb-empty"><h2>No language editions configured</h2><p>Edition records will appear after the Riftbound catalog foundation is applied.</p></div>}
          </div>
        )}
      </section>
    </main>
  );
}
