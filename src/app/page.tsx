import Link from "next/link";

const GAMES = [
  { name: "One Piece TCG", href: "/markets", enabled: true, emoji: "🏴‍☠️" },
  { name: "Pokemon TCG", href: null, enabled: false, emoji: "⚡" },
  { name: "Magic: The Gathering", href: null, enabled: false, emoji: "🧙" },
  { name: "Riftbound", href: null, enabled: false, emoji: "🌀" },
  { name: "Dragon Ball Z", href: null, enabled: false, emoji: "🐉" },
];

export default function Home() {
  return (
    <section className="max-w-[1400px] mx-auto px-4 py-16 flex flex-col items-center text-center">
      <div className="logo-owl mb-4" style={{ width: 64, height: 64, fontSize: 32 }}>
        🦉
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">
        OWL<span className="text-owl">Market</span>
      </h1>
      <p className="text-text-2 text-sm mb-6 max-w-md">
        Real-time price tracking for One Piece TCG cards.
        Market data, eBay sales, and portfolio tools.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full max-w-3xl mb-8">
        {GAMES.map((game) =>
          game.enabled ? (
            <Link
              key={game.name}
              href={game.href!}
              className="group flex flex-col items-center justify-center gap-2 p-4 rounded-lg
                         border border-border-2 bg-surface
                         hover:border-owl hover:-translate-y-0.5
                         transition-all duration-150 cursor-pointer"
            >
              <span className="text-2xl">{game.emoji}</span>
              <span className="font-mono text-[10px] font-medium tracking-wide text-owl uppercase">
                {game.name}
              </span>
            </Link>
          ) : (
            <div
              key={game.name}
              className="relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg
                         border border-border bg-surface opacity-40 cursor-not-allowed select-none"
            >
              <span className="text-2xl grayscale">{game.emoji}</span>
              <span className="font-mono text-[10px] font-medium tracking-wide text-text-2 uppercase">
                {game.name}
              </span>
              <span className="absolute top-1.5 right-1.5 font-mono text-[7px] text-text-3 uppercase tracking-widest">
                Soon
              </span>
            </div>
          )
        )}
      </div>

      <Link
        href="/markets"
        className="btn-signup"
        style={{ fontSize: 12, padding: "10px 28px" }}
      >
        VIEW MARKETS →
      </Link>
    </section>
  );
}
