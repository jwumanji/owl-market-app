import Link from "next/link";

import ArticleEditor from "../ArticleEditor";
import { loadAdminGameOptions, type AdminGameOption } from "@/lib/admin-games";
import { DEFAULT_PUBLIC_GAME_DB_SLUG } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New Story - Moon Market",
};

function searchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadGames() {
  try {
    return await loadAdminGameOptions(createServiceClient());
  } catch {
    return [] as AdminGameOption[];
  }
}

export default async function NewArticlePage(
  props: { searchParams?: Promise<{ game?: string | string[] }> },
) {
  const searchParams = await props.searchParams;
  const requestedGame = searchParamValue(searchParams?.game) || DEFAULT_PUBLIC_GAME_DB_SLUG;
  const games = await loadGames();
  const activeGameSlug = games.some((game) => game.slug === requestedGame)
    ? requestedGame
    : games[0]?.slug ?? requestedGame;

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <p className="admin-eyebrow">Editorial</p>
          <h1 className="admin-title">New story</h1>
          <p className="admin-subline">Start as a draft or publish immediately into this game’s news feed.</p>
        </div>
        <Link href={`/admin/articles?game=${encodeURIComponent(activeGameSlug)}`} className="admin-btn admin-btn-ghost">
          Back to stories
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="rounded-c-md border-[1.5px] border-coral bg-[#FFE2DD] px-4 py-3 font-grotesk text-sm text-ink">
          Game options could not be loaded. Check the Supabase connection before creating a story.
        </div>
      ) : (
        <ArticleEditor activeGameSlug={activeGameSlug} article={null} games={games} />
      )}
    </section>
  );
}
