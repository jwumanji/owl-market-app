import SetsClient from "./SetsClient";
import { loadSets } from "./load-sets";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";
import { SETS as FALLBACK_SETS, type SetData } from "./sets-data";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

function fallbackGameName(gameRouteSlug: string | null | undefined) {
  if (!gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG) return "One Piece TCG";
  return gameRouteSlug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function SetsPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  let initialSets: SetData[];
  let gameName = fallbackGameName(gameRouteSlug);
  let loadError: string | null = null;
  const isDefaultGame = !gameRouteSlug || gameRouteSlug === DEFAULT_PUBLIC_GAME_ROUTE_SLUG;

  try {
    const data = await loadSets({ game: gameRouteSlug });
    const loadedSets = data.sets as unknown as SetData[];
    gameName = data.game.name;
    initialSets = loadedSets.length > 0 ? loadedSets : isDefaultGame ? FALLBACK_SETS : [];
  } catch {
    initialSets = isDefaultGame ? FALLBACK_SETS : [];
    loadError = isDefaultGame ? null : `Failed to load ${gameName} catalog data.`;
  }

  return <SetsClient initialSets={initialSets} gameRouteSlug={gameRouteSlug} gameName={gameName} loadError={loadError} />;
}

export default async function SetsPage() {
  return <SetsPageContent />;
}
