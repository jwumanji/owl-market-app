import type { ReactNode } from "react";

// Shared shell for /dev/* tools. The global Nav hides itself on these routes
// (see components/layout/Nav.tsx), so dev pages render bare and full-bleed.
// Default every dev route to noindex so internal tools never get crawled.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: { children: ReactNode }) {
  return children;
}
