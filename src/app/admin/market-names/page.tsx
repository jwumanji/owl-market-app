import Link from "next/link";

import AdminGameSwitcher from "@/app/admin/AdminGameSwitcher";
import MarketNameReviewQueue from "@/app/admin/market-names/MarketNameReviewQueue";
import {
  loadMarketNameSuggestionCounts,
  loadMarketNameSuggestions,
  type MarketNameSuggestionStatus,
} from "@/lib/card-market-name-admin";
import { loadAdminGameOptions, type AdminGameOption } from "@/lib/admin-games";
import { DEFAULT_PUBLIC_GAME_DB_SLUG, resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";
import "./market-names-admin.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market Names - Moon Market",
};

const STATUSES: Array<{ value: MarketNameSuggestionStatus; label: string }> = [
  { value: "pending", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
function reviewStatus(value?: string): MarketNameSuggestionStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

async function loadPageData(gameSlug: string, status: MarketNameSuggestionStatus) {
  try {
    const supabase = createServiceClient();
    const [gameResult, games] = await Promise.all([
      resolveGameScope(supabase, gameSlug, { defaultToOnePiece: true }),
      loadAdminGameOptions(supabase),
    ]);

    if (gameResult.error) {
      return {
        suggestions: [],
        counts: { pending: 0, approved: 0, rejected: 0 },
        games,
        game: null,
        error: gameResult.error.message,
      };
    }

    const [suggestions, counts] = await Promise.all([
      loadMarketNameSuggestions(supabase, gameResult.game.id, status),
      loadMarketNameSuggestionCounts(supabase, gameResult.game.id),
    ]);

    return {
      suggestions: suggestions.data,
      counts: counts.counts,
      games,
      game: gameResult.game,
      error: suggestions.error ?? counts.error,
    };
  } catch (error) {
    return {
      suggestions: [],
      counts: { pending: 0, approved: 0, rejected: 0 },
      games: [] as AdminGameOption[],
      game: null,
      error: error instanceof Error ? error.message : "Unable to load the market-name queue.",
    };
  }
}

export default async function AdminMarketNamesPage(
  props: {
    searchParams?: Promise<{
      game?: string | string[];
      status?: string | string[];
    }>;
  },
) {
  const searchParams = await props.searchParams;
  const gameSlug = searchParamValue(searchParams?.game) || DEFAULT_PUBLIC_GAME_DB_SLUG;
  const status = reviewStatus(searchParamValue(searchParams?.status));
  const data = await loadPageData(gameSlug, status);

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Investor terminology</p>
          <h1 className="admin-title">Market Names</h1>
          <p className="admin-subline">
            Approve one display name per exact printing. Aliases improve search without replacing official card identity.
          </p>
        </div>
        <AdminGameSwitcher activeGameSlug={gameSlug} games={data.games} />
      </div>

      {data.error && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          The Market Names system is not ready in Supabase yet. Apply migration{" "}
          <span className="font-mono font-semibold text-coral">20260726160000_card_market_names.sql</span>, then return here.
          <div className="mt-2 font-mono text-xs text-ink-2">{data.error}</div>
        </div>
      )}

      {!data.error && (
        <>
          <nav className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Market name review status">
            {STATUSES.map((item) => (
              <Link
                key={item.value}
                className={`admin-scard${status === item.value ? " active" : ""}`}
                href={`/admin/market-names?game=${encodeURIComponent(gameSlug)}&status=${item.value}`}
              >
                <span className="slbl">{item.label}</span>
                <span className="snum">{data.counts[item.value]}</span>
                <span className="ssub">{item.value === "pending" ? "Sorted by market value" : "Curated decisions"}</span>
              </Link>
            ))}
          </nav>

          {data.suggestions.length > 0 ? (
            <MarketNameReviewQueue suggestions={data.suggestions} />
          ) : (
            <div className="admin-card p-10 text-center">
              <h2 className="font-grotesk text-2xl font-bold text-ink">Nothing in {status}.</h2>
              <p className="mt-2 font-grotesk text-sm text-ink-2">
                {status === "pending"
                  ? "All current candidates have been reviewed."
                  : "Decisions will appear here as the queue is curated."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
