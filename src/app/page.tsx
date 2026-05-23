import Link from "next/link";
import OwlMark from "@/components/brand/OwlMark";
import Wordmark from "@/components/brand/Wordmark";
import HomeTeaserTable, { type TeaserCard } from "@/components/home/HomeTeaserTable";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG, resolveGameScope } from "@/lib/game-scope";
import { gamePath } from "@/lib/game-routes";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "OwlMarket — See what others miss",
  description:
    "TCG Market Intelligence. Real-time price tracking, market trends, and portfolio tools — built for serious TCG players and collectors. Currently powering One Piece TCG.",
};

const GAMES = [
  { name: "One Piece TCG", href: gamePath(DEFAULT_PUBLIC_GAME_ROUTE_SLUG, "/markets"), enabled: true, emoji: "🏴‍☠️" },
  { name: "Pokémon TCG", href: null, enabled: false, emoji: "⚡" },
  { name: "Magic: The Gathering", href: null, enabled: false, emoji: "🧙" },
  { name: "Riftbound", href: null, enabled: false, emoji: "🌀" },
  { name: "Dragon Ball Z", href: null, enabled: false, emoji: "🐉" },
] as const;

async function fetchTopCards(): Promise<TeaserCard[]> {
  try {
    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, DEFAULT_PUBLIC_GAME_ROUTE_SLUG, {
      defaultToOnePiece: true,
      publicOnly: true,
    });
    if (gameResult.error) return [];

    const { data, error } = await supabase
      .from("cards")
      .select(
        `id, card_image_id, card_number, name, rarity, image_url_small,
         price_stats (market_avg, chg_1d),
         sets (code, name)`,
      )
      .eq("game_id", gameResult.game.id)
      .not("price_stats", "is", null)
      .order("market_avg", { referencedTable: "price_stats", ascending: false })
      .limit(5);

    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map((row): TeaserCard => {
      const ps = row.price_stats as { market_avg: number | null; chg_1d: number | null } | null;
      const set = row.sets as { code: string | null; name: string | null } | null;
      return {
        id: row.id as string,
        card_image_id: (row.card_image_id as string | null) ?? null,
        name: row.name as string,
        rarity: (row.rarity as string | null) ?? null,
        image_url_small: (row.image_url_small as string | null) ?? null,
        set_code: set?.code ?? null,
        set_name: set?.name ?? null,
        card_number: (row.card_number as string | null) ?? null,
        market_avg: ps?.market_avg ?? null,
        chg_1d: ps?.chg_1d ?? null,
      };
    });
  } catch {
    return [];
  }
}

export default async function Home() {
  const topCards = await fetchTopCards();
  const marketHref = gamePath(DEFAULT_PUBLIC_GAME_ROUTE_SLUG, "/markets");

  return (
    <main className="c-home-main">
      <div className="c-home-container">
        {/* HERO */}
        <section className="c-hero">
          <div className="c-hero-lockup">
            <OwlMark size={80} />
            <Wordmark className="c-hero-wm" />
          </div>

          <div className="c-hero-eyebrow">TCG Market Intelligence · Live</div>
          <h1 className="c-hero-tagline">
            See what <em>others miss</em>.
          </h1>
          <p className="c-hero-sub">
            Real-time price tracking, market trends, and portfolio tools — built for serious TCG
            players and collectors. Currently powering One Piece TCG, with more games coming.
          </p>
        </section>

        {/* GAMES */}
        <section className="c-games-section">
          <div className="c-section-label">Pick your game</div>
          <div className="c-games-grid">
            {GAMES.map((game) =>
              game.enabled ? (
                <Link
                  key={game.name}
                  href={game.href!}
                  className="c-game-card active featured"
                >
                  <span className="c-game-emoji">{game.emoji}</span>
                  <span className="c-game-name">{game.name}</span>
                  <span className="c-game-status">Live</span>
                </Link>
              ) : (
                <div key={game.name} className="c-game-card disabled" aria-disabled="true">
                  <span className="c-game-emoji">{game.emoji}</span>
                  <span className="c-game-name">{game.name}</span>
                  <span className="c-game-status">Soon</span>
                </div>
              ),
            )}
          </div>
        </section>

        {/* MARKETS TEASER */}
        <section className="c-preview-section">
          <div className="c-preview-head">
            <h2 className="c-preview-title">
              Top of market — <em>live</em>
            </h2>
            <Link href={marketHref} className="c-preview-link">
              See full market →
            </Link>
          </div>
          <HomeTeaserTable cards={topCards} gameRouteSlug={DEFAULT_PUBLIC_GAME_ROUTE_SLUG} />
        </section>

        {/* FEATURES TRIO */}
        <section className="c-features-section">
          <div className="c-section-label">What you get</div>
          <div className="c-features-grid">
            <article className="c-feature">
              <div className="c-feature-icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFF5E4"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 17 9 11 13 15 21 7" />
                  <polyline points="14 7 21 7 21 14" />
                </svg>
              </div>
              <h3>Live market prices</h3>
              <p>
                Real-time pricing from TCGPlayer, eBay sold listings, and Limitless. Updated every
                minute, ranked by volume and movement.
              </p>
              <Link href={marketHref} className="c-feature-link">
                Explore markets →
              </Link>
            </article>

            <article className="c-feature disabled">
              <div className="c-feature-icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFF5E4"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="3" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="21" />
                </svg>
              </div>
              <h3>Owl Lens grading</h3>
              <p>
                Pre-grade your cards with computer-vision centering analysis. See PSA ceilings
                before you submit and skip the bad bets.
              </p>
              <span className="c-feature-link" aria-disabled="true">
                See the Lens →
              </span>
            </article>

            <article className="c-feature">
              <div className="c-feature-icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFF5E4"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <h3>Portfolio tracking</h3>
              <p>
                Track every card you own with live valuations, P&amp;L vs cost basis, and 24-hour
                movement. Built for collectors who treat collecting like a portfolio.
              </p>
              <span className="c-feature-link" aria-disabled="true">
                Build your portfolio →
              </span>
            </article>
          </div>
        </section>

        {/* CTA STRIP */}
        <section>
          <div className="c-cta-strip">
            <div className="c-cta-text">
              Track every card. <em>One market.</em>
            </div>
            <Link href={marketHref} className="c-cta-btn">
              View live markets →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
