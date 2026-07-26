import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  slugifyArticleTitle,
  type ArticleCategory,
  type ArticleStatus,
} from "@/lib/articles";

export type ArticleAdminInput = {
  game: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: ArticleCategory;
  status: ArticleStatus;
  heroAlt: string | null;
  authorName: string | null;
  publishedAt: string | null;
  removeHero: boolean;
};

type ArticleAdminInputResult =
  | { data: ArticleAdminInput; error: null }
  | { data: null; error: string };

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseArticleAdminInput(formData: FormData): ArticleAdminInputResult {
  const game = textValue(formData, "game");
  const title = textValue(formData, "title");
  const slug = slugifyArticleTitle(textValue(formData, "slug") || title);
  const summary = textValue(formData, "summary");
  const body = textValue(formData, "body");
  const category = textValue(formData, "category") || "news";
  const status = textValue(formData, "status") || "draft";
  const rawPublishedAt = textValue(formData, "published_at");

  if (!game) return { data: null, error: "Choose a card game." };
  if (!title) return { data: null, error: "Title is required." };
  if (title.length > 180) return { data: null, error: "Title must be 180 characters or fewer." };
  if (!slug) return { data: null, error: "A valid URL slug is required." };
  if (slug.length > 100) return { data: null, error: "URL slug must be 100 characters or fewer." };
  if (!summary) return { data: null, error: "Summary is required." };
  if (summary.length > 320) return { data: null, error: "Summary must be 320 characters or fewer." };
  if (!body) return { data: null, error: "Story body is required." };
  if (!(ARTICLE_CATEGORIES as readonly string[]).includes(category)) {
    return { data: null, error: "Choose a valid story tag." };
  }
  if (!(ARTICLE_STATUSES as readonly string[]).includes(status)) {
    return { data: null, error: "Choose a valid publication status." };
  }

  let publishedAt: string | null = null;
  if (rawPublishedAt) {
    const parsedDate = new Date(rawPublishedAt);
    if (!Number.isFinite(parsedDate.getTime())) {
      return { data: null, error: "Choose a valid publication date." };
    }
    publishedAt = parsedDate.toISOString();
  } else if (status === "published") {
    publishedAt = new Date().toISOString();
  }

  return {
    data: {
      game,
      title,
      slug,
      summary,
      body,
      category: category as ArticleCategory,
      status: status as ArticleStatus,
      heroAlt: textValue(formData, "hero_alt") || null,
      authorName: textValue(formData, "author_name") || null,
      publishedAt,
      removeHero: textValue(formData, "remove_hero") === "true",
    },
    error: null,
  };
}
