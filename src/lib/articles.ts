import type { SupabaseClient } from "@supabase/supabase-js";

export const ARTICLE_CATEGORIES = [
  "news",
  "reveal",
  "market",
  "event",
  "release",
  "guide",
] as const;

export const ARTICLE_STATUSES = ["draft", "published"] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export type Article = {
  id: string;
  game_id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: ArticleCategory;
  status: ArticleStatus;
  hero_image_url: string | null;
  hero_alt: string | null;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ArticleSummary = Pick<
  Article,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "category"
  | "hero_image_url"
  | "hero_alt"
  | "author_name"
  | "published_at"
>;

export type ArticleLoadResult<T> = {
  data: T;
  error: string | null;
};

const ARTICLE_SUMMARY_SELECT = `
  id, slug, title, summary, category, hero_image_url, hero_alt, author_name, published_at
`;

const ARTICLE_SELECT = `
  id, game_id, slug, title, summary, body, category, status,
  hero_image_url, hero_alt, author_name, published_at, created_at, updated_at
`;

export function slugifyArticleTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

export function formatArticleDate(value: string | null) {
  if (!value) return "Unscheduled";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unscheduled";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function articleReadMinutes(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function loadPublishedArticles(
  supabase: SupabaseClient,
  gameId: string,
  limit?: number,
): Promise<ArticleLoadResult<ArticleSummary[]>> {
  let query = supabase
    .from("articles")
    .select(ARTICLE_SUMMARY_SELECT)
    .eq("game_id", gameId)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });

  if (limit != null) query = query.limit(limit);
  const { data, error } = await query;

  return {
    data: error ? [] : (data ?? []) as ArticleSummary[],
    error: error?.message ?? null,
  };
}

export async function loadPublishedArticle(
  supabase: SupabaseClient,
  gameId: string,
  slug: string,
): Promise<ArticleLoadResult<Article | null>> {
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("game_id", gameId)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  return {
    data: error ? null : (data as Article | null),
    error: error?.message ?? null,
  };
}

export async function loadAdminArticles(
  supabase: SupabaseClient,
  gameId: string,
): Promise<ArticleLoadResult<Article[]>> {
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("game_id", gameId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return {
    data: error ? [] : (data ?? []) as Article[],
    error: error?.message ?? null,
  };
}

export async function loadAdminArticle(
  supabase: SupabaseClient,
  gameId: string,
  id: string,
): Promise<ArticleLoadResult<Article | null>> {
  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("game_id", gameId)
    .eq("id", id)
    .maybeSingle();

  return {
    data: error ? null : (data as Article | null),
    error: error?.message ?? null,
  };
}
