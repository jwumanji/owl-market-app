import type { Metadata } from "next";
import { preconnect, prefetchDNS } from "react-dom";
import {
  Space_Grotesk,
  Caveat,
  JetBrains_Mono,
} from "next/font/google";
import Nav from "@/components/layout/Nav";
import "./globals.css";


// ── C1.5 fonts (introduced in Stage A) ──
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "optional",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-caveat",
  display: "optional",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moon Market — See What Others Miss",
  description:
    "TCG market intelligence platform for pricing, trends, catalog data, and portfolio tracking.",
  applicationName: "Moon Market",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/brand/moon-mark-512.png", sizes: "512x512", type: "image/png" }],
  },
};

function publicSupabaseOrigin() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseOrigin = publicSupabaseOrigin();
  // Resource hints go through the react-dom API, NOT a hand-rendered <head>:
  // a manual <head> in the root layout displaces Next's managed head, which
  // silently dropped every next/font preload link — fonts were discovered
  // late, and the post-swap repaint of headline text re-fired LCP seconds in.
  if (supabaseOrigin) {
    prefetchDNS(supabaseOrigin);
    preconnect(supabaseOrigin, { crossOrigin: "anonymous" });
  }

  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${caveat.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {/* No Suspense here: the public nav is prerender-safe (no
            useSearchParams), so static HTML always includes it — the old
            null fallback shipped nav-less HTML that shifted the whole page
            at hydration. The admin variant carries its own boundary. */}
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
