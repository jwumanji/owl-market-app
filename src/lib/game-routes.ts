import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { getGameDefinitionByRouteSlug } from "@/lib/games/registry";

export function normalizeGameRouteSlug(gameRouteSlug: string | null | undefined) {
  return gameRouteSlug?.trim() || DEFAULT_PUBLIC_GAME_ROUTE_SLUG;
}

export function gamePath(gameRouteSlug: string | null | undefined, path = "") {
  const game = normalizeGameRouteSlug(gameRouteSlug);
  const suffix = path.trim().replace(/^\/+/, "");
  return suffix ? `/games/${game}/${suffix}` : `/games/${game}`;
}

export function gameQueryValue(gameRouteSlug: string | null | undefined) {
  const routeSlug = normalizeGameRouteSlug(gameRouteSlug);
  return getGameDefinitionByRouteSlug(routeSlug)?.dbSlug ?? routeSlug;
}
