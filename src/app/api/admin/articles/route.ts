import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { parseArticleAdminInput } from "@/lib/article-admin-input";
import { isArticleHeroFile, removeArticleHero, uploadArticleHero } from "@/lib/article-heroes";
import { getCurrentAdminUser } from "@/lib/admin-user";
import { gamePath } from "@/lib/game-routes";
import { resolveGameScope } from "@/lib/game-scope";
import { createServiceClient } from "@/lib/supabase-server";

function saveError(error: unknown) {
  const message = error instanceof Error ? error.message : "The story could not be saved.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
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

    const heroFile = formData.get("hero");
    let heroImageUrl: string | null = null;
    if (isArticleHeroFile(heroFile)) {
      if (!input.data.heroAlt) {
        return NextResponse.json({ error: "Describe the hero image before uploading it." }, { status: 400 });
      }
      heroImageUrl = await uploadArticleHero(supabase, heroFile, {
        gameSlug: gameResult.game.slug,
        articleSlug: input.data.slug,
      });
    }

    const currentUser = await getCurrentAdminUser();
    const { data, error } = await supabase
      .from("articles")
      .insert({
        game_id: gameResult.game.id,
        slug: input.data.slug,
        title: input.data.title,
        summary: input.data.summary,
        body: input.data.body,
        category: input.data.category,
        status: input.data.status,
        hero_image_url: heroImageUrl,
        hero_alt: heroImageUrl ? input.data.heroAlt : null,
        author_name: input.data.authorName,
        created_by: currentUser?.id ?? null,
        published_at: input.data.publishedAt,
      })
      .select("id, slug")
      .single();

    if (error) {
      await removeArticleHero(supabase, heroImageUrl);
      const status = error.code === "23505" ? 409 : 500;
      const message = error.code === "23505"
        ? "That URL slug is already used by another story for this game."
        : error.message;
      return NextResponse.json({ error: message }, { status });
    }

    revalidatePath(gamePath(gameResult.game.routeSlug, "/markets"));
    revalidatePath(gamePath(gameResult.game.routeSlug, "/news"));
    revalidatePath(gamePath(gameResult.game.routeSlug, `/news/${input.data.slug}`));

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return saveError(error);
  }
}
