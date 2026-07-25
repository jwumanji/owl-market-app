import Link from "next/link";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import "./terminal.css";

// Phase A ships the shell only — no loader, no Supabase access, no client
// component yet. The dashboard lands in Phase D on top of migration v46.

export function SealedTrackerContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const isDefaultGame = !gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const homeHref = isDefaultGame ? "/" : gamePath(gameRouteSlug);

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
      </div>

      <div className="terminal-placeholder">
        <div className="terminal-placeholder-label">Phase A — shell</div>
        <p className="terminal-placeholder-body">
          The sealed dashboard lands once migration v46 and the weekly snapshot job are in place.
        </p>
      </div>
    </section>
  );
}
