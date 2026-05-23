import SetsClient from "./SetsClient";
import { loadSets } from "./load-sets";
import { DEFAULT_PUBLIC_GAME_ROUTE_SLUG } from "@/lib/game-scope";
import { SETS as FALLBACK_SETS, type SetData } from "./sets-data";

export const dynamic = "force-dynamic";

export async function SetsPageContent({
  gameRouteSlug = DEFAULT_PUBLIC_GAME_ROUTE_SLUG,
}: {
  gameRouteSlug?: string | null;
} = {}) {
  let initialSets: SetData[];
  try {
    const data = await loadSets({ game: gameRouteSlug });
    const loadedSets = data.sets as unknown as SetData[];
    initialSets = loadedSets.length > 0
      ? loadedSets
      : FALLBACK_SETS;
  } catch {
    initialSets = FALLBACK_SETS;
  }
  return <SetsClient initialSets={initialSets} gameRouteSlug={gameRouteSlug} />;
}

export default async function SetsPage() {
  return <SetsPageContent />;
}
