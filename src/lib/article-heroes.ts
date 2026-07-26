import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ARTICLE_HERO_BUCKET = "article-heroes";
export const MAX_ARTICLE_HERO_SIZE_BYTES = 8 * 1024 * 1024;

const HERO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function safePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/avif") return "avif";
  return "jpg";
}

export function isArticleHeroFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

export async function ensureArticleHeroBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.getBucket(ARTICLE_HERO_BUCKET);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(ARTICLE_HERO_BUCKET, {
    public: true,
    fileSizeLimit: MAX_ARTICLE_HERO_SIZE_BYTES,
    allowedMimeTypes: Array.from(HERO_CONTENT_TYPES),
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
}

export async function uploadArticleHero(
  supabase: SupabaseClient,
  file: File,
  { gameSlug, articleSlug }: { gameSlug: string; articleSlug: string },
) {
  if (!HERO_CONTENT_TYPES.has(file.type)) {
    throw new Error("Hero images must be JPEG, PNG, WEBP, or AVIF files.");
  }

  if (file.size > MAX_ARTICLE_HERO_SIZE_BYTES) {
    throw new Error("Hero images must be 8 MB or smaller.");
  }

  await ensureArticleHeroBucket(supabase);
  const path = `${safePathSegment(gameSlug)}/${safePathSegment(articleSlug)}-${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(ARTICLE_HERO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(ARTICLE_HERO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeArticleHero(supabase: SupabaseClient, publicUrl: string | null) {
  if (!publicUrl) return;

  const marker = `/storage/v1/object/public/${ARTICLE_HERO_BUCKET}/`;
  const markerIndex = publicUrl.indexOf(marker);
  if (markerIndex < 0) return;

  const path = decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
  if (!path || path.includes("..")) return;
  await supabase.storage.from(ARTICLE_HERO_BUCKET).remove([path]);
}
