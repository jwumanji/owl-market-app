"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Ticker from "./Ticker";

const NAV_LINKS = [
  { label: "HOME", href: "/" },
  { label: "MARKETS", href: "/markets" },
  { label: "RARITIES", href: "/rarities" },
  { label: "SETS", href: "/sets" },
  { label: "CHARACTERS", href: "/characters" },
  { label: "PORTFOLIO", href: "/portfolio" },
  { label: "INVENTORY", href: "/admin/inventory" },
  { label: "OWL LENS", href: "/admin/lens" },
];

const ADMIN_NAV_LINKS = [
  { label: "INVENTORY", href: "/admin/inventory" },
  { label: "ORDERS", href: "/admin/orders" },
  { label: "BUNDLES", href: "/admin/bundles" },
  { label: "PSA", href: "/admin/psa-submissions" },
  { label: "OWL LENS", href: "/admin/lens" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Nav() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const links = isAdmin ? ADMIN_NAV_LINKS : NAV_LINKS;

  return (
    <nav className={isAdmin ? "admin-nav" : undefined}>
      <div className="nav-row">
        <Link href="/" className="logo">
          <div className="logo-owl">🦉</div>
          <span className="logo-name">
            OWL<span> Market</span>
          </span>
        </Link>

        <div className="nav-mid">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link${isActivePath(pathname, link.href) ? " active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="nav-right">
          {isAdmin ? (
            <div className="live-badge admin-badge">INTERNAL</div>
          ) : (
            <>
              <div className="live-badge">
                <span className="live-dot" />
                LIVE
              </div>
              <Link href="/login" className="btn-login">
                Login
              </Link>
            </>
          )}
          <Link href="/logout" className="btn-login">
            Logout
          </Link>
        </div>
      </div>

      {!isAdmin && <Ticker />}
    </nav>
  );
}
