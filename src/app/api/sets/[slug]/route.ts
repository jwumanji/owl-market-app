import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: true,
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // 1. Fetch set by slug or code
  const { data: set, error: setErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series, color, year")
    .eq("game_id", game.id)
    .or(`slug.eq.${slug},code.ilike.${slug}`)
    .limit(1)
    .single();

  if (setErr || !set) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }

  // 2. Fetch all cards in this set with prices
  const allCards: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data: batch, error: cardsErr } = await supabase
      .from("cards")
      .select(`
        id,
        card_image_id,
        card_number,
        name,
        name_base,
        variant_label,
        rarity,
        card_type,
        color,
        game_payload,
        image_url,
        image_url_small,
        price_stats (
          market_avg,
          tcg_market,
          ebay_avg,
          chg_1d,
          chg_7d,
          chg_30d
        )
      `)
      .eq("game_id", game.id)
      .eq("set_id", set.id)
      .range(from, from + pageSize - 1);

    if (cardsErr) {
      return NextResponse.json({ error: cardsErr.message }, { status: 500 });
    }
    if (!batch || batch.length === 0) break;
    allCards.push(...withOnePiecePayloadFallbacksList(batch as Record<string, unknown>[]));
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return NextResponse.json({ game: gameResponsePayload(game), set, cards: allCards });
}
