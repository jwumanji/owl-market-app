"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import MoonMarketLogo from "@/components/brand/MoonMarketLogo";
import MoonMark from "@/components/brand/MoonMark";
import { DEFAULT_PUBLIC_GAME_DB_SLUG, DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import {
  DEFAULT_PUBLIC_GAME,
  PUBLIC_GAME_DEFINITIONS,
  getGameDefinitionByRouteSlug,
  isNavigableCapability,
  type GameCapabilityStatus,
  type GameDefinition,
} from "@/lib/games/registry";
import Ticker from "./Ticker";

type NavVariant = "public" | "admin";

type NavProps = {
  variant?: NavVariant;
};

type NavLink = {
  label: string;
  href: string;
  exact?: boolean;
};

type PublicNavLink = {
  label: string;
  href?: string;
  exact?: boolean;
  status?: "coming-soon";
  divider?: boolean;
};

function publicLinks(gameRouteSlug: string): PublicNavLink[] {
  const game = getGameDefinitionByRouteSlug(gameRouteSlug) ?? DEFAULT_PUBLIC_GAME;
  const links: Array<PublicNavLink | null> = [
    capabilityLink(game, "Markets", "/markets", game.capabilities.markets),
    capabilityLink(game, "Champions", "/champions", game.capabilities.champions),
    capabilityLink(game, "Characters", "/characters", game.capabilities.characters),
    capabilityLink(game, "Sets", "/sets", game.capabilities.sets),
    capabilityLink(game, "Rarities", "/rarities", game.capabilities.rarities),
    capabilityLink(
      game,
      game.dbSlug === DEFAULT_PUBLIC_GAME_DB_SLUG ? "Japan Market" : "Languages",
      "/languages",
      game.capabilities.languages
    ),
    capabilityLink(game, "eBay Sales", "/sales", game.capabilities.sales),
    capabilityLink(game, "All Cards", "/catalog", game.capabilities.catalog, true),
  ];

  return links.filter((link): link is PublicNavLink => link !== null);
}

function capabilityLink(
  game: GameDefinition,
  label: string,
  path: string,
  status: GameCapabilityStatus,
  divider = false
): PublicNavLink | null {
  if (status === "unsupported") return null;
  return {
    label,
    href: isNavigableCapability(status) ? gamePath(game.routeSlug, path) : undefined,
    status: status === "planned" ? "coming-soon" : undefined,
    divider,
  };
}

function adminLinks(gameSlug: string): NavLink[] {
  const game = encodeURIComponent(gameSlug || DEFAULT_PUBLIC_GAME_DB_SLUG);

  return [
    { label: "Inventory", href: `/admin/inventory?game=${game}` },
    { label: "Bundles", href: `/admin/bundles?game=${game}` },
    { label: "Orders", href: `/admin/orders?game=${game}` },
    { label: "Lens", href: "/admin/lens" },
    { label: "PSA", href: `/admin/psa-submissions?game=${game}` },
  ];
}

function isActivePath(pathname: string, href: string, exact = false) {
  const hrefPath = href.split("?")[0];
  if (exact || hrefPath === "/") return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function gameRouteSlugFromPath(pathname: string) {
  const [, root, game] = pathname.split("/");
  if (root !== "games" || !game) return DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

  try {
    return decodeURIComponent(game);
  } catch {
    return game;
  }
}

function adminGameSlugFromSearchParams(searchParams: { get(name: string): string | null }) {
  return searchParams.get("game")?.trim() || DEFAULT_PUBLIC_GAME_DB_SLUG;
}

function gameRouteSlugFromAdminGame(gameSlug: string) {
  return gameSlug.replace(/_/g, "-");
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`c-game-switcher-chevron${open ? " is-open" : ""}`}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
    >
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" width="17" height="17" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12 12 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PublicGameSwitcher({ gameRouteSlug }: { gameRouteSlug: string }) {
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const activeGame = getGameDefinitionByRouteSlug(gameRouteSlug) ?? DEFAULT_PUBLIC_GAME;
  const currentLabel = gameSwitcherLabel(activeGame);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="c-game-switcher" ref={switcherRef}>
      <button
        type="button"
        className="c-game-switcher-btn"
        aria-expanded={open}
        aria-controls="public-game-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="c-game-switcher-dot" aria-hidden="true" />
        <span className="c-game-switcher-name">{currentLabel}</span>
        <ChevronDownIcon open={open} />
      </button>

      <div id="public-game-menu" className="c-game-switcher-menu" hidden={!open}>
        <div className="c-game-switcher-heading">Switch game</div>
        {PUBLIC_GAME_DEFINITIONS.map((game) => {
          const isActive = game.routeSlug === activeGame.routeSlug;
          const defaultPath = isNavigableCapability(game.capabilities.markets) ? "/markets" : "/catalog";
          return (
            <Link
              key={game.dbSlug}
              href={gamePath(game.routeSlug, defaultPath)}
              className={`c-game-option${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              prefetch={false}
              onClick={() => setOpen(false)}
            >
              <span>
                <strong>{gameSwitcherLabel(game)}</strong>
                <small>{game.capabilities.pricing === "live" ? "Live market" : "Catalog preview"}</small>
              </span>
              {isActive && <span className="c-game-option-check" aria-hidden="true">✓</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function gameSwitcherLabel(game: GameDefinition) {
  return game.dbSlug === DEFAULT_PUBLIC_GAME_DB_SLUG ? "One Piece" : game.name;
}

// The public nav must not read useSearchParams(): doing so bails static
// prerenders out to the Suspense fallback, which shipped HTML with no nav at
// all — the nav then mounted at hydration, shoving the whole page down (CLS)
// and re-positioning the LCP element. Only the admin variant needs the
// ?game= param, so only AdminNav pays the Suspense cost (admin routes are
// request-rendered anyway).
export default function Nav({ variant }: NavProps) {
  const pathname = usePathname();
  // Dev tools (/dev/*) render as bare full-bleed pages — no global chrome.
  if (pathname.startsWith("/dev")) return null;

  const resolvedVariant: NavVariant =
    variant ?? (pathname.startsWith("/admin") ? "admin" : "public");

  if (resolvedVariant === "admin") {
    return (
      <Suspense fallback={null}>
        <AdminNav pathname={pathname} />
      </Suspense>
    );
  }

  return <PublicNav pathname={pathname} />;
}

function PublicNav({ pathname }: { pathname: string }) {
  const activeGameRouteSlug = gameRouteSlugFromPath(pathname);
  const isDefaultPublicGame = activeGameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const links = publicLinks(activeGameRouteSlug);

  return (
    <nav className="c-topnav" aria-label="Primary">
      <div className="c-topnav-inner c-public-masthead">
        <div className="c-nav-left">
          <Link href="/" className="c-lockup" aria-label="Moon Market" prefetch={false}>
            <MoonMarketLogo className="c-lockup-brand" priority />
            <MoonMark className="c-lockup-mark-mobile" size={36} />
          </Link>

          <PublicGameSwitcher gameRouteSlug={activeGameRouteSlug} />
        </div>

        <div className="c-nav-right">
          <Link
            href={gamePath(activeGameRouteSlug, "/catalog")}
            className="c-nav-search"
            prefetch={false}
          >
            <SearchIcon />
            <span>Search</span>
          </Link>
          <span className="c-live-chip">
            <span className="c-live-dot" />
            {isDefaultPublicGame ? "LIVE" : "CATALOG"}
          </span>
          <Link href="/login" className="c-signin-btn" prefetch={false}>
            Sign in
          </Link>
        </div>
      </div>

      <div className="c-public-nav-strip">
        <ul className="c-nav-links c-public-nav-links">
          {links.map((link) => (
            <li key={link.label} className={link.divider ? "c-nav-item-divider" : undefined}>
              {link.href ? (
                <Link
                  href={link.href}
                  prefetch={false}
                  className={`c-nav-link${isActivePath(pathname, link.href, link.exact) ? " active" : ""}`}
                >
                  {link.label}
                </Link>
              ) : (
                <span className="c-nav-link is-disabled" aria-disabled="true">
                  {link.label}
                  {link.status === "coming-soon" && <span className="c-nav-soon">Soon</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isDefaultPublicGame && <Ticker />}
    </nav>
  );
}

function AdminNav({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const activeAdminGameSlug = adminGameSlugFromSearchParams(searchParams);
  const activeAdminGameRouteSlug = gameRouteSlugFromAdminGame(activeAdminGameSlug);
  const links = useMemo(() => adminLinks(activeAdminGameSlug), [activeAdminGameSlug]);
  const viewSiteHref = activeAdminGameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG
    ? "/"
    : gamePath(activeAdminGameRouteSlug);

  return (
    <nav className="c-topnav" aria-label="Primary">
      <div className="c-topnav-inner is-admin">
        <div className="c-nav-left">
          <Link href="/" className="c-lockup" aria-label="Moon Market" prefetch={false}>
            <MoonMarketLogo className="c-lockup-brand" priority />
            <MoonMark className="c-lockup-mark-mobile" size={36} />
          </Link>

          <span className="c-internal-chip">INTERNAL</span>
        </div>

        <ul className="c-nav-links">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                prefetch={false}
                className={`c-nav-link${isActivePath(pathname, link.href, link.exact) ? " active" : ""}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="c-nav-right">
          <Link href={viewSiteHref} className="c-nav-view">
            View site ↗
          </Link>
          <Link href="/logout" className="c-signin-btn">
            Sign out
          </Link>
        </div>
      </div>
    </nav>
  );
}
