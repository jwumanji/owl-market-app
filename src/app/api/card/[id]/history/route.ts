import { NextResponse } from "next/server";
import {
  loadCardCore,
  loadCardHistory,
} from "@/app/card/[id]/card-detail-data";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS } from "@/lib/public-data-cache";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// Price history for the card detail chart. Fetched from the client (not
// streamed by the page) so the ~4.4k statically generated card pages build
// on the core query alone — the per-page history reads were half the build's
// DB load and kept tipping static generation into 60s timeouts.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const core = await loadCardCore({
    id: params.id,
    game: gameParamFromRequest(request),
  });

  if (!core.ok) {
    return NextResponse.json({ error: core.message }, { status: core.status });
  }

  const history = await loadCardHistory({
    gameId: core.data.game.id,
    cardId: core.data.card.id,
    priceStats: core.data.priceStats,
  });

  return NextResponse.json(history, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
