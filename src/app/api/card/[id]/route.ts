import { NextResponse } from "next/server";
import { loadCardDetailData } from "@/app/card/[id]/card-detail-data";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS } from "@/lib/public-data-cache";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await loadCardDetailData({
    id: params.id,
    game: gameParamFromRequest(request),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
