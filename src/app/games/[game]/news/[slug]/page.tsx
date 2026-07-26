import Link from "next/link";
import { notFound } from "next/navigation";

import ArticleBody from "@/components/articles/ArticleBody";
import ArticleCard from "@/components/articles/ArticleCard";
import {
  articleReadMinutes,
  formatArticleDate,
  loadPublishedArticle,
  loadPublishedArticles,
} from "@/lib/articles";
import { gamePath } from "@/lib/game-routes";
import { publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { createCachedServiceClient } from "@/lib/supabase-server";
import "../news.css";

export const revalidate = 300;

async function loadArticlePage(gameSlug: string, articleSlug: string) {
  const supabase = createCachedServiceClient(300);
  const gameResult = await resolveGameScope(supabase, gameSlug, {
    publicOnly: publicOnlyForCatalogPreview(),
  });
  if (gameResult.error) return null;

  const articleResult = await loadPublishedArticle(supabase, gameResult.game.id, articleSlug);
  if (!articleResult.data) return null;

  const relatedResult = await loadPublishedArticles(supabase, gameResult.game.id, 4);
  return {
    game: gameResult.game,
    article: articleResult.data,
    related: relatedResult.data.filter((article) => article.slug !== articleSlug).slice(0, 3),
  };
}

export async function generateMetadata(
  props: { params: Promise<{ game: string; slug: string }> },
) {
  const { game, slug } = await props.params;
  const data = await loadArticlePage(game, slug);
  if (!data) return { title: "Story not found - Moon Market" };

  return {
    title: `${data.article.title} - Moon Market`,
    description: data.article.summary,
    openGraph: {
      title: data.article.title,
      description: data.article.summary,
      type: "article",
      publishedTime: data.article.published_at ?? undefined,
      images: data.article.hero_image_url
        ? [{ url: data.article.hero_image_url, alt: data.article.hero_alt ?? data.article.title }]
        : undefined,
    },
  };
}

export default async function ArticlePage(
  props: { params: Promise<{ game: string; slug: string }> },
) {
  const { game, slug } = await props.params;
  const data = await loadArticlePage(game, slug);
  if (!data) notFound();

  const archiveHref = gamePath(data.game.routeSlug, "/news");

  return (
    <main className="news-page">
      <article className="news-article">
        <header className="news-article-header">
          <div className="news-article-meta">
            <span className={`article-card-tag is-${data.article.category}`}>{data.article.category}</span>
            <time dateTime={data.article.published_at ?? undefined}>
              {formatArticleDate(data.article.published_at)}
            </time>
            <span>{articleReadMinutes(data.article.body)} min read</span>
            {data.article.author_name && <span>By {data.article.author_name}</span>}
          </div>
          <h1>{data.article.title}</h1>
          <p className="news-article-dek">{data.article.summary}</p>
        </header>

        <div className="news-article-hero">
          {data.article.hero_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.article.hero_image_url} alt={data.article.hero_alt ?? ""} />
          )}
        </div>

        <ArticleBody body={data.article.body} />

        {data.related.length > 0 && (
          <aside className="news-related" aria-labelledby="more-stories">
            <h2 id="more-stories">More {data.game.name} stories</h2>
            <div className="news-grid">
              {data.related.map((article, index) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  accentIndex={index + 1}
                  href={gamePath(data.game.routeSlug, `/news/${article.slug}`)}
                />
              ))}
            </div>
          </aside>
        )}

        <div style={{ marginTop: 38 }}>
          <Link href={archiveHref} className="news-back">
            <span aria-hidden="true">←</span> Back to all stories
          </Link>
        </div>
      </article>
    </main>
  );
}
