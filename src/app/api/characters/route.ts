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

  const searchParams = new URL(request.url).searchParams;
  const slug = searchParams.get("slug")?.trim();
  if (slug) {
    const character = result.characters.find((entry) => entry.slug === slug);
    if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });
    return NextResponse.json(character, { headers: PUBLIC_DATA_CACHE_HEADERS });
  }

  if (searchParams.get("view") === "overview") {
    return NextResponse.json(
      result.characters.map((character) => ({ ...character, topCards: [] })),
      { headers: PUBLIC_DATA_CACHE_HEADERS }
    );
  }

  return NextResponse.json(result.characters, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
