"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Nav's variant union is 'public' | 'admin' and it renders once in the root
// layout, so the Terminal band is a separate component mounted by the layouts
// at the terminal route segments. See docs/moon-terminal-sealed-spec.md §5.2.

type TerminalSection = {
  label: string;
  // Undefined = not built yet; renders as a disabled span, never a dead link.
  path?: string;
};

const SECTIONS: TerminalSection[] = [
  { label: "SEALED", path: "/sealed" },
  { label: "CHASE" },
  { label: "MOVERS" },
  { label: "SET INDEX" },
  { label: "BOX EV" },
];

// One component serves both mounts. Rather than rebuilding the href from the
// game slug, the base is read back off the pathname — whichever mirror the
// user arrived on (bare or game-scoped), the band keeps them on it.
function terminalBasePath(pathname: string) {
  const scoped = /^\/games\/[^/]+\/terminal/.exec(pathname);
  return scoped ? scoped[0] : "/terminal";
}

export default function TerminalSubNav() {
  const pathname = usePathname();
  const base = terminalBasePath(pathname);

  return (
    <nav className="c-terminal-subnav" aria-label="Moon Terminal sections">
      <div className="c-terminal-subnav-inner">
        <span className="c-terminal-subnav-label">TERMINAL</span>

        {SECTIONS.map((section) => {
          if (!section.path) {
            return (
              <span
                key={section.label}
                className="c-terminal-subnav-link is-disabled"
                aria-disabled="true"
              >
                {section.label}
              </span>
            );
          }

          const href = `${base}${section.path}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={section.label}
              href={href}
              prefetch={false}
              className={`c-terminal-subnav-link${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
