import { NextResponse } from "next/server";
import { loadRarities, RaritiesLoadError } from "@/app/rarities/load-rarities";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS } from "@/lib/public-data-cache";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;
export const maxDuration = 30;

// GET /api/rarities — rarity index for the requested game (shared with the
// server-rendered /rarities and /games/[game]/rarities pages via loadRarities).
export async function GET(request: Request) {
  try {
    const { rarities } = await loadRarities({ game: gameParamFromRequest(request) });
    return NextResponse.json(rarities, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof RaritiesLoadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rarity data." },
      { status: 500 }
    );
  }
}
