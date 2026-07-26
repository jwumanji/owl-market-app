"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  ARTICLE_CATEGORIES,
  articleReadMinutes,
  slugifyArticleTitle,
  type Article,
  type ArticleStatus,
} from "@/lib/articles";
import type { AdminGameOption } from "@/lib/admin-games";
import "./articles-admin.css";

function dateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function ArticleEditor({
  activeGameSlug,
  article,
  games,
}: {
  activeGameSlug: string;
  article: Article | null;
  games: AdminGameOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(article));
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [status, setStatus] = useState<ArticleStatus>(article?.status ?? "draft");
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [removeHero, setRemoveHero] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroPreview = useMemo(
    () => heroFile ? URL.createObjectURL(heroFile) : removeHero ? null : article?.hero_image_url ?? null,
    [article?.hero_image_url, heroFile, removeHero],
  );

  useEffect(() => {
    return () => {
      if (heroPreview?.startsWith("blob:")) URL.revokeObjectURL(heroPreview);
    };
  }, [heroPreview]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugifyArticleTitle(value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const rawPublishedAt = formData.get("published_at");
    if (typeof rawPublishedAt === "string" && rawPublishedAt) {
      formData.set("published_at", new Date(rawPublishedAt).toISOString());
    }
    formData.set("remove_hero", removeHero ? "true" : "false");

    const url = article ? `/api/admin/articles/${article.id}` : "/api/admin/articles";
    const response = await fetch(url, {
      method: article ? "PATCH" : "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => null) as { error?: string; slug?: string } | null;

    if (!response.ok) {
      setError(payload?.error ?? "The story could not be saved.");
      setSaving(false);
      return;
    }

    router.push(`/admin/articles?game=${encodeURIComponent(activeGameSlug)}&saved=${encodeURIComponent(title)}`);
    router.refresh();
  }

  async function deleteArticle() {
    if (!article || !window.confirm(`Delete “${article.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);

    const response = await fetch(
      `/api/admin/articles/${article.id}?game=${encodeURIComponent(activeGameSlug)}`,
      { method: "DELETE" },
    );
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(payload?.error ?? "The story could not be deleted.");
      setDeleting(false);
      return;
    }

    router.push(`/admin/articles?game=${encodeURIComponent(activeGameSlug)}`);
    router.refresh();
  }

  return (
    <form className="article-editor" onSubmit={submit}>
      {error && <div className="article-editor-error" role="alert">{error}</div>}

      <div className="article-editor-grid">
        <section className="admin-card article-editor-main">
          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-title">
              Headline <span className="admin-required">*</span>
            </label>
            <input
              id="article-title"
              name="title"
              value={title}
              maxLength={180}
              onChange={(event) => updateTitle(event.target.value)}
              required
            />
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-slug">
              URL slug <span className="admin-required">*</span>
            </label>
            <input
              id="article-slug"
              name="slug"
              value={slug}
              maxLength={100}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugifyArticleTitle(event.target.value));
              }}
              required
            />
            <span className="article-editor-help">Used in the public story URL. Lowercase letters, numbers, and hyphens only.</span>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-summary">
              Summary <span className="admin-required">*</span>
            </label>
            <textarea
              id="article-summary"
              name="summary"
              value={summary}
              maxLength={320}
              onChange={(event) => setSummary(event.target.value)}
              required
            />
            <span className="article-editor-count">{summary.length}/320</span>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-body">
              Story <span className="admin-required">*</span>
            </label>
            <textarea
              className="article-editor-body"
              id="article-body"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Write the story here.\n\n## Add a section heading\n\n- Add a list item"}
              required
            />
            <span className="article-editor-help">
              Use ## for section headings, ### for smaller headings, and - for lists. Estimated reading time: {articleReadMinutes(body)} min.
            </span>
          </div>
        </section>

        <aside className="admin-card article-editor-side">
          <input type="hidden" name="game" value={activeGameSlug} />

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-game">Card game</label>
            <select
              id="article-game"
              value={activeGameSlug}
              onChange={(event) => router.push(`/admin/articles/new?game=${encodeURIComponent(event.target.value)}`)}
              disabled={Boolean(article)}
            >
              {games.map((game) => (
                <option value={game.slug} key={game.slug}>
                  {game.name}{game.isPublic ? "" : " (Preview)"}
                </option>
              ))}
            </select>
            {article && <span className="article-editor-help">A published story cannot be moved between games.</span>}
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-category">Story tag</label>
            <select id="article-category" name="category" defaultValue={article?.category ?? "news"}>
              {ARTICLE_CATEGORIES.map((category) => (
                <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-author">Byline</label>
            <input id="article-author" name="author_name" defaultValue={article?.author_name ?? "Moon Market Editorial"} />
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-status">Status</label>
            <select
              id="article-status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as ArticleStatus)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published / scheduled</option>
            </select>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-published">Publish date</label>
            <input
              id="article-published"
              name="published_at"
              type="datetime-local"
              defaultValue={dateTimeLocalValue(article?.published_at ?? null)}
            />
            <span className="article-editor-help">
              Leave blank to publish now. A future date schedules the story and sets its chronological position.
            </span>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-hero">Hero image</label>
            <div className="article-editor-preview">
              {heroPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroPreview} alt="Hero preview" />
              )}
            </div>
            <input
              id="article-hero"
              name="hero"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => {
                setHeroFile(event.target.files?.[0] ?? null);
                setRemoveHero(false);
              }}
            />
            <span className="article-editor-help">16:9 works best. JPEG, PNG, WEBP, or AVIF up to 8 MB.</span>
          </div>

          <div className="article-editor-field">
            <label className="admin-field-label" htmlFor="article-hero-alt">Hero image description</label>
            <input
              id="article-hero-alt"
              name="hero_alt"
              defaultValue={article?.hero_alt ?? ""}
              placeholder="Describe the image for screen readers"
            />
          </div>

          {article?.hero_image_url && (
            <label className="article-editor-checkbox">
              <input
                type="checkbox"
                checked={removeHero}
                onChange={(event) => {
                  setRemoveHero(event.target.checked);
                  if (event.target.checked) setHeroFile(null);
                }}
              />
              Remove the current hero image when saving
            </label>
          )}
        </aside>
      </div>

      <div className="article-editor-actions">
        <div>
          {article && (
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              onClick={deleteArticle}
              disabled={deleting || saving}
            >
              {deleting ? "Deleting…" : "Delete story"}
            </button>
          )}
        </div>
        <div>
          <Link href={`/admin/articles?game=${encodeURIComponent(activeGameSlug)}`} className="admin-btn admin-btn-ghost">
            Cancel
          </Link>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={saving || deleting}>
            {saving ? "Saving…" : status === "published" ? "Publish story" : "Save draft"}
          </button>
        </div>
      </div>
    </form>
  );
}
