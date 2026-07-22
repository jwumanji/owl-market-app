import { GAME_DEFINITIONS } from "@/lib/games/registry";

export function publicGameStaticParams() {
  // Game routes use on-demand ISR by default so deploys do not depend on
  // Supabase latency or grow linearly as new games are added. Static
  // pre-rendering remains an explicit operator opt-in.
  if (process.env.GAME_STATIC_PARAMS_ENABLED !== "true") {
    return [];
  }

  return Object.values(GAME_DEFINITIONS)
    .filter((game) => game.isPublic)
    .map((game) => ({ game: game.routeSlug }));
}
