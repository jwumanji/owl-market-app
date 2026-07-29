import Link from "next/link";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { loadSealedDashboard, type SealedDashboardData } from "./load-sealed";
import SealedTrackerClient from "./SealedTrackerClient";
import "./terminal.css";

// Server component: calls the loader (service-role — market_index_snapshots is
// anon-revoked, so set value / Value Ratio resolve HERE and travel down as
// props, spec §6), then hands everything to the client for interactivity.

function metaDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return "—";
  return new Date(t)
    .toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase();
}

export async function SealedTrackerContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const isDefaultGame = !gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const homeHref = isDefaultGame ? "/" : gamePath(gameRouteSlug);

  let data: SealedDashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadSealedDashboard({ game: gameRouteSlug });
  } catch {
    loadError = "Failed to load sealed market data. Try again shortly.";
  }

  return (
    <section className="terminal-page">
      <div className="terminal-breadcrumb">
        <Link href={homeHref} prefetch={false}>OWL Market</Link>
        <span aria-hidden="true">›</span>
        <span>Terminal</span>
        <span aria-hidden="true">›</span>
        <span className="here">Sealed</span>
      </div>

      <div className="terminal-head">
        <div>
          <div className="terminal-head-eyebrow">Moon Terminal / Sealed</div>
          <h1 className="terminal-head-title">
            Sealed <em>Tracker</em>
          </h1>
          <p className="terminal-head-sub">
            Booster box prices tracked week by week, against the value of the singles inside them.
          </p>
        </div>
        {data && (
          <div className="terminal-head-meta">
            DATA: JUSTTCG · DAILY SNAPSHOT
            <br />
            LAST UPDATE: {metaDate(data.latestPriceDate)}
          </div>
        )}
      </div>

      {data ? (
        <SealedTrackerClient data={data} />
      ) : (
        <div className="terminal-placeholder">
          <div className="terminal-placeholder-label">Data unavailable</div>
          <p className="terminal-placeholder-body">{loadError}</p>
        </div>
      )}
    </section>
  );
}
