"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import OwlMark from "@/components/brand/OwlMark";
import Wordmark from "@/components/brand/Wordmark";
import Ticker from "./Ticker";

type NavVariant = "public" | "admin";

type NavProps = {
  variant?: NavVariant;
};

const PUBLIC_LINKS = [
  { label: "Home", href: "/" },
  { label: "Markets", href: "/markets" },
  { label: "Rarities", href: "/rarities" },
  { label: "Sets", href: "/sets" },
  { label: "Characters", href: "/characters" },
];

const ADMIN_LINKS = [
  { label: "Inventory", href: "/admin/inventory" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Lens", href: "/admin/lens" },
  { label: "PSA", href: "/admin/psa-submissions" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav({ variant }: NavProps) {
  const pathname = usePathname();
  const resolvedVariant: NavVariant =
    variant ?? (pathname.startsWith("/admin") ? "admin" : "public");
  const isAdmin = resolvedVariant === "admin";
  const links = isAdmin ? ADMIN_LINKS : PUBLIC_LINKS;

  return (
    <nav className="c-topnav" aria-label="Primary">
      <div className={`c-topnav-inner${isAdmin ? " is-admin" : ""}`}>
        <Link href="/" className="c-lockup">
          <OwlMark size={36} />
          <Wordmark />
        </Link>

        {isAdmin ? <span className="c-internal-chip">INTERNAL</span> : null}

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
                LIVE
              </span>
              <Link href="/login" className="c-signin-btn">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>

      {!isAdmin && <Ticker />}
    </nav>
  );
}
