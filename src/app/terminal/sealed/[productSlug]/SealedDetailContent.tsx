import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { loadSealedDetail, type SealedDetailData } from "./load-sealed-detail";
import SealedDetailClient from "./SealedDetailClient";
import "../terminal.css";
import "./sealed-detail.css";

// Server component: calls the loader (service-role — market_index_snapshots is
// anon-revoked, so set value / Value Ratio resolve HERE and travel down as
// props, spec §6), then hands everything to the client for interactivity.
//
// Section seams: this component renders the breadcrumb shell and mounts the
// Phase E client (§3.1 hero + §3.2 price history). Later phases append their
// sections after it — §3.3 market stats, §3.4 top 10, §3.5 Box EV — without
// touching anything above the marker comment below.

export async function SealedDetailContent({
  slug,
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  slug: string;
  gameRouteSlug?: string | null;
}) {
  const isDefaultGame = !gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const homeHref = isDefaultGame ? "/" : gamePath(gameRouteSlug);
  const sealedHref = isDefaultGame ? "/terminal/sealed" : gamePath(gameRouteSlug, "/terminal/sealed");

  let data: SealedDetailData | null = null;
  let loadError = false;
  try {
    data = await loadSealedDetail({ slug, game: gameRouteSlug });
  } catch {
    loadError = true;
  }

  if (loadError) {
    // Error fallback consistent with Phase D's dashboard placeholder.
    return (
      <section className="terminal-page sealed-detail-page">
        <div className="terminal-breadcrumb">
          <Link href={homeHref} prefetch={false}>OWL Market</Link>
          <span aria-hidden="true">›</span>
          <span>Terminal</span>
          <span aria-hidden="true">›</span>
          <Link href={sealedHref} prefetch={false}>Sealed</Link>
        </div>
        <div className="terminal-placeholder">
          <div className="terminal-placeholder-label">Data unavailable</div>
          <p className="terminal-placeholder-body">
            Failed to load sealed product data. Try again shortly.
          </p>
        </div>
      </section>
    );
  }

  // Unknown slug → 404. Outside the try/catch so Next's notFound() control
  // throw is never swallowed by the error fallback.
  if (!data) {
    notFound();
  }

  return (
    <section className="terminal-page sealed-detail-page">
      <div className="terminal-breadcrumb">
        <Link href={homeHref} prefetch={false}>OWL Market</Link>
        <span aria-hidden="true">›</span>
        <span>Terminal</span>
        <span aria-hidden="true">›</span>
        <Link href={sealedHref} prefetch={false}>Sealed</Link>
        <span aria-hidden="true">›</span>
        <span className="here">{data.product.name}</span>
      </div>

      <SealedDetailClient data={data} />

      {/* Phase F/G seam — §3.3 market stats, §3.4 top 10, §3.5 Box EV mount
          here as sibling sections. Nothing renders for them in Phase E. */}
    </section>
  );
}
