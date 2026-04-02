import Link from "next/link";

export default function Home() {
  return (
    <section className="max-w-[1400px] mx-auto px-4 py-16 flex flex-col items-center text-center">
      <div className="logo-owl mb-4" style={{ width: 64, height: 64, fontSize: 32 }}>
        🦉
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">
        OWL<span className="text-owl">Market</span>
      </h1>
      <p className="text-text-2 text-sm mb-8 max-w-md">
        Real-time price tracking for One Piece TCG cards.
        Market data, eBay sales, and portfolio tools.
      </p>
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
