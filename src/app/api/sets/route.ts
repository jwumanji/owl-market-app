import { NextResponse } from "next/server";
import { loadSets } from "@/app/sets/load-sets";
import { gameParamFromRequest } from "@/lib/game-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/sets — returns all sets with aggregated price data for index page
export async function GET(request: Request) {
  try {
    const data = await loadSets({ game: gameParamFromRequest(request) });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
