import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { parseArticleAdminInput } from "@/lib/article-admin-input";
import {
  isArticleHeroFile,
  removeArticleHero,
  uploadArticleHero,
} from "@/lib/article-heroes";
import { gamePath } from "@/lib/game-routes";
import { gameParamFromRequest, resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidId(id: string) {
  return !UUID_PATTERN.test(id);
}

function saveError(error: unknown) {
  const message = error instanceof Error ? error.message : "The story could not be updated.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    if (invalidId(id)) return NextResponse.json({ error: "Invalid story id." }, { status: 400 });

    const formData = await request.formData();
    const input = parseArticleAdminInput(formData);
    if (input.error || !input.data) {
      return NextResponse.json({ error: input.error ?? "Invalid story." }, { status: 400 });
    }

    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, input.data.game);
    if (gameResult.error) {
      return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
    }

    const existingResult = await supabase
      .from("articles")
      .select("id, slug, hero_image_url")
      .eq("id", id)
      .eq("game_id", gameResult.game.id)
      .maybeSingle();
    if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
    if (!existingResult.data) return NextResponse.json({ error: "Story not found." }, { status: 404 });

    const existing = existingResult.data as { id: string; slug: string; hero_image_url: string | null };
    const heroFile = formData.get("hero");
    let heroImageUrl = input.data.removeHero ? null : existing.hero_image_url;
    let uploadedHeroUrl: string | null = null;

    if (isArticleHeroFile(heroFile)) {
      if (!input.data.heroAlt) {
        return NextResponse.json({ error: "Describe the hero image before uploading it." }, { status: 400 });
      }
      heroImageUrl = await uploadArticleHero(supabase, heroFile, {
        gameSlug: gameResult.game.slug,
        articleSlug: input.data.slug,
      });
      uploadedHeroUrl = heroImageUrl;
    }

    if (heroImageUrl && !input.data.heroAlt) {
      return NextResponse.json({ error: "A hero image description is required." }, { status: 400 });
    }

    const { error } = await supabase
      .from("articles")
      .update({
        slug: input.data.slug,
        title: input.data.title,
        summary: input.data.summary,
        body: input.data.body,
        category: input.data.category,
        status: input.data.status,
        hero_image_url: heroImageUrl,
        hero_alt: heroImageUrl ? input.data.heroAlt : null,
        author_name: input.data.authorName,
        published_at: input.data.publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("game_id", gameResult.game.id);

    if (error) {
      await removeArticleHero(supabase, uploadedHeroUrl);
      const status = error.code === "23505" ? 409 : 500;
      const message = error.code === "23505"
        ? "That URL slug is already used by another story for this game."
        : error.message;
      return NextResponse.json({ error: message }, { status });
    }

    if (existing.hero_image_url && existing.hero_image_url !== heroImageUrl) {
      await removeArticleHero(supabase, existing.hero_image_url);
    }

    revalidatePath(gamePath(gameResult.game.routeSlug, "/markets"));
    revalidatePath(gamePath(gameResult.game.routeSlug, "/news"));
    revalidatePath(gamePath(gameResult.game.routeSlug, `/news/${existing.slug}`));
    revalidatePath(gamePath(gameResult.game.routeSlug, `/news/${input.data.slug}`));

    return NextResponse.json({ id, slug: input.data.slug });
  } catch (error) {
    return saveError(error);
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    if (invalidId(id)) return NextResponse.json({ error: "Invalid story id." }, { status: 400 });

    const supabase = createServiceClient();
    const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
      defaultToOnePiece: true,
    });
    if (gameResult.error) {
      return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
    }

    const existingResult = await supabase
      .from("articles")
      .select("id, slug, hero_image_url")
      .eq("id", id)
      .eq("game_id", gameResult.game.id)
      .maybeSingle();
    if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
    if (!existingResult.data) return NextResponse.json({ error: "Story not found." }, { status: 404 });

    const existing = existingResult.data as { id: string; slug: string; hero_image_url: string | null };
    const { error } = await supabase
      .from("articles")
      .delete()
      .eq("id", id)
      .eq("game_id", gameResult.game.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await removeArticleHero(supabase, existing.hero_image_url);
    revalidatePath(gamePath(gameResult.game.routeSlug, "/markets"));
    revalidatePath(gamePath(gameResult.game.routeSlug, "/news"));
    revalidatePath(gamePath(gameResult.game.routeSlug, `/news/${existing.slug}`));

    return NextResponse.json({ id });
  } catch (error) {
    return saveError(error);
  }
}
