import { GAME_DEFINITIONS } from "@/lib/games/registry";

export function publicGameStaticParams() {
  return Object.values(GAME_DEFINITIONS)
    .filter((game) => game.isPublic)
    .map((game) => ({ game: game.routeSlug }));
}
