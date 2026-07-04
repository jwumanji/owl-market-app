import { NextResponse } from "next/server";
import { loadCharactersPageData } from "@/app/characters/characters-index-data";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS } from "@/lib/public-data-cache";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// ---------------------------------------------------------------------------
// GET /api/characters - returns character index data with top cards + prices
// (data logic lives in src/app/characters/characters-index-data.ts, shared
// with the server-rendered /characters and /games/[game]/characters pages)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const result = await loadCharactersPageData({ game: gameParamFromRequest(request) });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.characters, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
