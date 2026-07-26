import Link from "next/link";

import AdminGameSwitcher from "@/app/admin/AdminGameSwitcher";
import { formatArticleDate, loadAdminArticles, type Article } from "@/lib/articles";
import { loadAdminGameOptions, type AdminGameOption } from "@/lib/admin-games";
import { DEFAULT_PUBLIC_GAME_DB_SLUG, resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";
import "./articles-admin.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stories - Moon Market",
};

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function displayStatus(article: Article) {
  if (article.status === "draft") return { label: "Draft", className: "" };
  if (article.published_at && new Date(article.published_at).getTime() > Date.now()) {
    return { label: "Scheduled", className: "is-scheduled" };
  }
  return { label: "Published", className: "is-published" };
}

async function loadPageData(gameSlug: string) {
  try {
    const supabase = createServiceClient();
    const [gameResult, games] = await Promise.all([
      resolveGameScope(supabase, gameSlug, { defaultToOnePiece: true }),
      loadAdminGameOptions(supabase),
    ]);
    if (gameResult.error) {
      return { articles: [] as Article[], games, game: null, error: gameResult.error.message };
    }

    const articles = await loadAdminArticles(supabase, gameResult.game.id);
    return { articles: articles.data, games, game: gameResult.game, error: articles.error };
  } catch (error) {
    return {
      articles: [] as Article[],
      games: [] as AdminGameOption[],
      game: null,
      error: error instanceof Error ? error.message : "Unable to load stories.",
    };
  }
}

export default async function AdminArticlesPage(
  props: {
    searchParams?: Promise<{
      game?: string | string[];
      saved?: string | string[];
    }>;
  },
) {
  const searchParams = await props.searchParams;
  const gameSlug = searchParamValue(searchParams?.game) || DEFAULT_PUBLIC_GAME_DB_SLUG;
  const saved = searchParamValue(searchParams?.saved);
  const data = await loadPageData(gameSlug);

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Editorial</p>
          <h1 className="admin-title">Stories</h1>
          <p className="admin-subline">
            Write and publish a separate chronological news feed for each card game.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <AdminGameSwitcher activeGameSlug={gameSlug} games={data.games} />
          <Link
            href={`/admin/articles/new?game=${encodeURIComponent(gameSlug)}`}
            className="admin-btn admin-btn-primary"
          >
            New story
          </Link>
        </div>
      </div>

      {saved && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-gain-2 bg-[#DCF1E6] px-4 py-3 font-grotesk text-sm font-semibold text-ink">
          Story saved: <span className="font-bold text-gain-2">{saved}</span>
        </div>
      )}

      {data.error && (
        <div className="mb-5 rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          The article system is not ready in Supabase yet. Apply migration{" "}
          <span className="font-mono font-semibold text-coral">20260726110000_game_articles.sql</span>, then return here.
          <div className="mt-2 font-mono text-xs text-ink-2">{data.error}</div>
        </div>
      )}

      {!data.error && data.articles.length === 0 && (
        <div className="admin-card p-10 text-center">
          <h2 className="font-grotesk text-2xl font-bold text-ink">No stories for {data.game?.name ?? "this game"} yet.</h2>
          <p className="mt-2 font-grotesk text-sm text-ink-2">Create a draft, add a hero image, and publish when it is ready.</p>
        </div>
      )}

      {!data.error && data.articles.length > 0 && (
        <div className="admin-card articles-admin-list">
          <div className="articles-admin-row is-head" aria-hidden="true">
            <span>Story</span>
            <span>Status</span>
            <span>Tag</span>
            <span>Publish date</span>
            <span />
          </div>
          {data.articles.map((article) => {
            const status = displayStatus(article);
            return (
              <Link
                key={article.id}
                className="articles-admin-row"
                href={`/admin/articles/${article.id}?game=${encodeURIComponent(gameSlug)}`}
              >
                <span className="articles-admin-title">
                  {article.title}
                  <span>/{article.slug}</span>
                </span>
                <span className="articles-admin-cell">
                  <span className={`articles-admin-status ${status.className}`}>{status.label}</span>
                </span>
                <span className="articles-admin-cell">{article.category}</span>
                <span className="articles-admin-cell">{formatArticleDate(article.published_at)}</span>
                <span className="articles-admin-edit">Edit →</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
