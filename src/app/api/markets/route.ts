import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const setId = searchParams.get("set"); // "all" or a set UUID
  const sort = searchParams.get("sort") ?? "value";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // Map sort key to column
  const sortCol: Record<string, string> = {
    value: "market_avg",
    chg_1d: "chg_1d",
    chg_7d: "chg_7d",
    chg_30d: "chg_30d",
  };
  const orderBy = sortCol[sort] ?? "market_avg";

  let query = supabase
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
      ),
      sets (
        id,
        slug,
        code,
        name,
        series,
        color,
        year
      )
    `)
    .eq("game_id", game.id)
    .not("price_stats", "is", null)
    .order(orderBy, { referencedTable: "price_stats", ascending: false })
    .limit(limit);

  if (setId && setId !== "all") {
    query = query.eq("set_id", setId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fallback JS sort in case referencedTable ordering doesn't work
  const sorted = withOnePiecePayloadFallbacksList((data ?? []) as Record<string, unknown>[]).sort((a, b) => {
    const pa = a.price_stats as Record<string, number> | null;
    const pb = b.price_stats as Record<string, number> | null;
    return (pb?.[orderBy] ?? 0) - (pa?.[orderBy] ?? 0);
  });

  return NextResponse.json(sorted);
}
