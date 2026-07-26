import Link from "next/link";

import { formatArticleDate, type ArticleSummary } from "@/lib/articles";
import "./article-card.css";

export default function ArticleCard({
  article,
  href,
  accentIndex = 0,
}: {
  article: ArticleSummary;
  href: string;
  accentIndex?: number;
}) {
  return (
    <Link href={href} className="article-card" prefetch={false}>
      <div className={`article-card-hero article-card-accent-${(accentIndex % 4) + 1}`}>
        {article.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.hero_image_url}
            alt={article.hero_alt ?? ""}
            loading="lazy"
          />
        ) : (
          <span>Moon Market dispatch</span>
        )}
      </div>
      <div className="article-card-body">
        <span className={`article-card-tag is-${article.category}`}>{article.category}</span>
        <span className="article-card-title">{article.title}</span>
        {article.summary && <span className="article-card-summary">{article.summary}</span>}
        <time className="article-card-date" dateTime={article.published_at ?? undefined}>
          {formatArticleDate(article.published_at)}
        </time>
      </div>
    </Link>
  );
}
