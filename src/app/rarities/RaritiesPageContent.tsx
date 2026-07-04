import RaritiesClient from "./RaritiesClient";
import { loadRarities } from "./load-rarities";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { gameQueryValue, normalizeGameRouteSlug } from "@/lib/game-routes";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";
import { RARITIES as FALLBACK_RARITIES, type RarityData } from "./rarities-data";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export async function RaritiesPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  const routeSlug = normalizeGameRouteSlug(gameRouteSlug);
  const isDefaultGame = routeSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

  // Same policy the client fetch used: live data when available, the static
  // One Piece fallback for the default game, and an empty list (rendered as the
  // "no rarity taxonomy" notice) when another game's loader fails or is empty.
  let initialRarities: RarityData[];
  try {
    const { rarities } = await loadRarities({ game: gameQueryValue(routeSlug) });
    initialRarities = rarities.length > 0 ? rarities : isDefaultGame ? FALLBACK_RARITIES : [];
  } catch {
    initialRarities = isDefaultGame ? FALLBACK_RARITIES : [];
  }

  return <RaritiesClient initialRarities={initialRarities} gameRouteSlug={routeSlug} />;
}
