import Link from "next/link";
import { notFound } from "next/navigation";

import ArticleCard from "@/components/articles/ArticleCard";
import { loadPublishedArticles } from "@/lib/articles";
import { gamePath } from "@/lib/game-routes";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { createCachedServiceClient } from "@/lib/supabase-server";
import "./news.css";

export const revalidate = 300;

async function loadNewsPage(gameSlug: string) {
  const supabase = createCachedServiceClient(300);
  const gameResult = await resolveGameScope(supabase, gameSlug, {
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) return null;
  const articles = await loadPublishedArticles(supabase, gameResult.game.id);
  return { game: gameResult.game, articles };
}

export async function generateMetadata(props: { params: Promise<{ game: string }> }) {
  const { game } = await props.params;
  const data = await loadNewsPage(game);
  if (!data) return { title: "News - Moon Market" };

  return {
    title: `${data.game.name} News & Events - Moon Market`,
    description: `The latest ${data.game.name} reveals, events, releases, and market stories.`,
  };
}

export default async function GameNewsPage(props: { params: Promise<{ game: string }> }) {
  const { game: gameSlug } = await props.params;
  const data = await loadNewsPage(gameSlug);
  if (!data) notFound();

  return (
    <main className="news-page">
      <div className="news-container">
        <header className="news-archive-head">
          <div>
            <div className="news-kicker">{data.game.name}</div>
            <h1>Events &amp; <em>news</em></h1>
          </div>
          <p>
            Reveals, event coverage, release notes, and market stories — newest first and always scoped to {data.game.name}.
          </p>
        </header>

        {data.articles.error ? (
          <div className="news-empty">
            <h2>The newsroom is being prepared.</h2>
            <p>Check back shortly for the latest stories.</p>
          </div>
        ) : data.articles.data.length === 0 ? (
          <div className="news-empty">
            <h2>No stories published yet.</h2>
            <p>The first {data.game.name} story will appear here when it is ready.</p>
          </div>
        ) : (
          <div className="news-grid">
            {data.articles.data.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                accentIndex={index}
                href={gamePath(data.game.routeSlug, `/news/${article.slug}`)}
              />
            ))}
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <Link href={gamePath(data.game.routeSlug, "/markets")} className="news-back">
            <span aria-hidden="true">←</span> Back to market
          </Link>
        </div>
      </div>
    </main>
  );
}
