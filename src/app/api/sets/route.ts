import { NextResponse } from "next/server";
import { loadSets } from "@/app/sets/load-sets";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS, PUBLIC_DATA_CACHE_TTL_SECONDS } from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

// GET /api/sets — returns all sets with aggregated price data for index page
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await loadSets({
      game: gameParamFromRequest(request),
      includeTopCards: searchParams.get("includeTopCards") === "1",
    });
    return NextResponse.json(data, {
      headers: PUBLIC_DATA_CACHE_HEADERS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
