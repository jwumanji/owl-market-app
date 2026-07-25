import TerminalSubNav from "@/components/layout/TerminalSubNav";

// Scopes the Terminal band to /terminal/* — it must not appear on any other
// public route. The /games/[game]/terminal/* mirror re-exports this same
// layout (Next scopes layouts to their filesystem segment, so the mirror needs
// its own file), which keeps one TerminalSubNav across two mount points.
export default function TerminalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <TerminalSubNav />
      {children}
    </>
  );
}
