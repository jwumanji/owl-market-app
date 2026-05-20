import type { Metadata } from "next";
import {
  Inter,
  IBM_Plex_Mono,
  Space_Grotesk,
  Caveat,
  JetBrains_Mono,
} from "next/font/google";
import Nav from "@/components/layout/Nav";
import "./globals.css";

// ── Legacy fonts (kept during migration) ──
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

// ── C1.5 fonts (introduced in Stage A) ──
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-caveat",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OWL Market — See What Others Miss",
  description:
    "Market intelligence platform for the One Piece TCG. Real-time pricing, trends, and portfolio tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${ibmPlexMono.variable} ${spaceGrotesk.variable} ${caveat.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
