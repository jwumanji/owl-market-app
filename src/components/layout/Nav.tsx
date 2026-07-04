"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import OwlMark from "@/components/brand/OwlMark";
import Wordmark from "@/components/brand/Wordmark";
import { DEFAULT_PUBLIC_GAME_DB_SLUG, DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath, gameQueryValue } from "@/lib/game-routes";
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

function publicLinks(gameRouteSlug: string): NavLink[] {
  const isDefaultPublicGame = gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

  return [
    { label: "Home", href: isDefaultPublicGame ? "/" : gamePath(gameRouteSlug), exact: true },
    { label: "Markets", href: gamePath(gameRouteSlug, "/markets") },
    { label: "Catalog", href: gamePath(gameRouteSlug, "/catalog") },
    { label: "Rarities", href: gamePath(gameRouteSlug, "/rarities") },
    { label: "Sets", href: gamePath(gameRouteSlug, "/sets") },
    { label: "Characters", href: gamePath(gameRouteSlug, "/characters") },
  ];
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

export default function Nav({ variant }: NavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Dev tools (/dev/*) render as bare full-bleed pages — no global chrome.
  const hideNav = pathname.startsWith("/dev");
  const resolvedVariant: NavVariant =
    variant ?? (pathname.startsWith("/admin") ? "admin" : "public");
  const isAdmin = resolvedVariant === "admin";
  const activeAdminGameSlug = adminGameSlugFromSearchParams(searchParams);
  const activeAdminGameRouteSlug = gameRouteSlugFromAdminGame(activeAdminGameSlug);
  const activeGameRouteSlug = gameRouteSlugFromPath(pathname);
  const isDefaultPublicGame = activeGameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const links = useMemo(
    () => (isAdmin ? adminLinks(activeAdminGameSlug) : publicLinks(activeGameRouteSlug)),
    [activeAdminGameSlug, activeGameRouteSlug, isAdmin]
  );
  const viewSiteHref = activeAdminGameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG
    ? "/"
    : gamePath(activeAdminGameRouteSlug);

  useEffect(() => {
    if (isAdmin || hideNav) return;

    const timeout = window.setTimeout(() => {
      for (const link of links) {
        router.prefetch(link.href);
      }

      const game = encodeURIComponent(gameQueryValue(activeGameRouteSlug));
      void fetch(`/api/rarities?game=${game}`, { cache: "force-cache" }).catch(() => {});
      void fetch(`/api/characters?game=${game}`, { cache: "force-cache" }).catch(() => {});
      void fetch(`/api/markets?game=${game}&limit=20`, { cache: "force-cache" }).catch(() => {});
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [activeGameRouteSlug, isAdmin, hideNav, links, router]);

  if (hideNav) return null;

  return (
    <nav className="c-topnav" aria-label="Primary">
      <div className={`c-topnav-inner${isAdmin ? " is-admin" : ""}`}>
        <div className="c-nav-left">
          <Link href="/" className="c-lockup">
            <OwlMark size={36} />
            <Wordmark />
          </Link>

          {isAdmin ? <span className="c-internal-chip">INTERNAL</span> : null}
        </div>

        <ul className="c-nav-links">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`c-nav-link${isActivePath(pathname, link.href, link.exact) ? " active" : ""}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="c-nav-right">
          {isAdmin ? (
            <>
              <Link href={viewSiteHref} className="c-nav-view">
                View site ↗
              </Link>
              <Link href="/logout" className="c-signin-btn">
                Sign out
              </Link>
            </>
          ) : (
            <>
              <span className="c-live-chip">
                <span className="c-live-dot" />
                {isDefaultPublicGame ? "LIVE" : "CATALOG"}
              </span>
              <Link href="/login" className="c-signin-btn">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>

      {!isAdmin && isDefaultPublicGame && <Ticker />}
    </nav>
  );
}
