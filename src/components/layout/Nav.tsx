"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import OwlMark from "@/components/brand/OwlMark";
import Wordmark from "@/components/brand/Wordmark";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import Ticker from "./Ticker";

type NavVariant = "public" | "admin";

type NavProps = {
  variant?: NavVariant;
};

function publicLinks(gameRouteSlug: string) {
  return [
    { label: "Home", href: "/" },
    { label: "Markets", href: gamePath(gameRouteSlug, "/markets") },
    { label: "Rarities", href: gamePath(gameRouteSlug, "/rarities") },
    { label: "Sets", href: gamePath(gameRouteSlug, "/sets") },
    { label: "Characters", href: gamePath(gameRouteSlug, "/characters") },
  ];
}

const ADMIN_LINKS = [
  { label: "Inventory", href: "/admin/inventory?game=one_piece" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Lens", href: "/admin/lens" },
  { label: "PSA", href: "/admin/psa-submissions" },
];

function isActivePath(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  if (hrefPath === "/") return pathname === hrefPath;
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

export default function Nav({ variant }: NavProps) {
  const pathname = usePathname();
  const resolvedVariant: NavVariant =
    variant ?? (pathname.startsWith("/admin") ? "admin" : "public");
  const isAdmin = resolvedVariant === "admin";
  const activeGameRouteSlug = gameRouteSlugFromPath(pathname);
  const isDefaultPublicGame = activeGameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
  const links = isAdmin ? ADMIN_LINKS : publicLinks(activeGameRouteSlug);

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
                className={`c-nav-link${isActivePath(pathname, link.href) ? " active" : ""}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="c-nav-right">
          {isAdmin ? (
            <>
              <Link href="/" className="c-nav-view">
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
