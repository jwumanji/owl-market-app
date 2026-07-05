import { NextResponse } from "next/server";
import {
  loadCardCore,
  loadCardMarketExtras,
} from "@/app/card/[id]/card-detail-data";
import { gameParamFromRequest } from "@/lib/game-scope";
import { PUBLIC_DATA_CACHE_HEADERS } from "@/lib/public-data-cache";

// Keep in sync with CATALOG_DATA_TTL_SECONDS (Next 15 requires a literal).
export const revalidate = 3600;

// JP price + eBay solds for the card detail page. Fetched from the client
// (not streamed by the page) so the ~4.4k statically generated card pages
// don't fan 3 extra Supabase queries each into the build — that saturated
// the DB pool and timed out static generation on Vercel.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const core = await loadCardCore({
    id: params.id,
    game: gameParamFromRequest(request),
  });

  if (!core.ok) {
    return NextResponse.json({ error: core.message }, { status: core.status });
  }

  const extras = await loadCardMarketExtras({
    gameId: core.data.game.id,
    cardId: core.data.card.id,
  });

  return NextResponse.json(extras, { headers: PUBLIC_DATA_CACHE_HEADERS });
}
