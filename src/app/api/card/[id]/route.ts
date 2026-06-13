import { NextResponse } from "next/server";
import { loadCardDetailData } from "@/app/card/[id]/card-detail-data";
import { gameParamFromRequest } from "@/lib/game-scope";
import {
  PUBLIC_DATA_CACHE_HEADERS,
  PUBLIC_DATA_CACHE_TTL_SECONDS,
} from "@/lib/public-data-cache";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const result = await loadCardDetailData({
    id: params.id,
    game: gameParamFromRequest(request),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
