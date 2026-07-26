import Link from "next/link";
import { notFound } from "next/navigation";

import ArticleEditor from "../ArticleEditor";
import { loadAdminArticle } from "@/lib/articles";
import { loadAdminGameOptions, type AdminGameOption } from "@/lib/admin-games";
import { DEFAULT_PUBLIC_GAME_DB_SLUG, resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit Story - Moon Market",
};

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadPageData(id: string, gameSlug: string) {
  try {
    const supabase = createServiceClient();
    const [gameResult, games] = await Promise.all([
      resolveGameScope(supabase, gameSlug, { defaultToOnePiece: true }),
      loadAdminGameOptions(supabase),
    ]);
    if (gameResult.error) return { article: null, games, error: gameResult.error.message };
    const article = await loadAdminArticle(supabase, gameResult.game.id, id);
    return { article: article.data, games, error: article.error };
  } catch (error) {
    return {
      article: null,
      games: [] as AdminGameOption[],
      error: error instanceof Error ? error.message : "Unable to load the story.",
    };
  }
}

export default async function EditArticlePage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ game?: string | string[] }>;
  },
) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const gameSlug = searchParamValue(searchParams?.game) || DEFAULT_PUBLIC_GAME_DB_SLUG;
  const data = await loadPageData(id, gameSlug);
  if (!data.error && !data.article) notFound();

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Editorial</p>
          <h1 className="admin-title">Edit story</h1>
          <p className="admin-subline">Update the story, replace its hero, or change its publication status.</p>
        </div>
        <Link href={`/admin/articles?game=${encodeURIComponent(gameSlug)}`} className="admin-btn admin-btn-ghost">
          Back to stories
        </Link>
      </div>

      {data.error || !data.article ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          This story could not be loaded.
          {data.error && <div className="mt-2 font-mono text-xs text-ink-2">{data.error}</div>}
        </div>
      ) : (
        <ArticleEditor activeGameSlug={gameSlug} article={data.article} games={data.games} />
      )}
    </section>
  );
}
