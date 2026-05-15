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

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav>
      <div className="nav-row">
        <Link href="/" className="logo">
          <div className="logo-owl">🦉</div>
          <span className="logo-name">
            OWL<span> Market</span>
          </span>
        </Link>

        <div className="nav-mid">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link${pathname === link.href ? " active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="nav-right">
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
          <Link href="/login" className="btn-login">
            Login
          </Link>
          <Link href="/logout" className="btn-login">
            Logout
          </Link>
        </div>
      </div>

      <Ticker />
    </nav>
  );
}
