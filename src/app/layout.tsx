import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/layout/Nav";
import "./globals.css";

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
        className={`${inter.variable} ${ibmPlexMono.variable} font-sans antialiased`}
      >
        <Nav />
        <main style={{ paddingTop: "var(--top)" }}>{children}</main>
      </body>
    </html>
  );
}
