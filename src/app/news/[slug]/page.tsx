import { redirect } from "next/navigation";

import { gamePath } from "@/lib/game-routes";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";

export default async function LegacyArticlePage(
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  redirect(gamePath(DEFAULT_PUBLIC_GAME_ROUTE_SLUG, `/news/${slug}`));
}
