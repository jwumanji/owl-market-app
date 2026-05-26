import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { cachedPublicData, PUBLIC_DATA_CACHE_HEADERS, publicDataCacheKey } from "@/lib/public-data-cache";
import { firstRelation, flattenPriceStatsCardRow } from "@/lib/supabase-relations";

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
    .from("price_stats")
    .select(`
      market_avg,
      tcg_market,
      ebay_avg,
      chg_1d,
      chg_7d,
      chg_30d,
      cards!price_stats_card_game_fk!inner (
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
        image_url_preview,
        sets!cards_set_game_fk (
          id,
          slug,
          code,
          name,
          series,
          color,
          year
        )
      )
    `)
    .eq("game_id", game.id)
    .not(orderBy, "is", null)
    .order(orderBy, { ascending: false })
    .limit(limit);

  if (setId && setId !== "all") {
    query = query.eq("cards.set_id", setId);
  }

  try {
    const sorted = await cachedPublicData(
      publicDataCacheKey("api-markets-v3", game.id, setId ?? "all", sort, limit),
      async () => {
        const { data, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        // Fallback JS sort in case referencedTable ordering doesn't work
        const normalized = ((data ?? []) as Record<string, unknown>[])
          .map(flattenPriceStatsCardRow)
          .filter((row): row is Record<string, unknown> => row != null);

        return withOnePiecePayloadFallbacksList(normalized).sort((a, b) => {
          const pa = firstRelation(a.price_stats as Record<string, number> | Record<string, number>[] | null);
          const pb = firstRelation(b.price_stats as Record<string, number> | Record<string, number>[] | null);
          return (pb?.[orderBy] ?? 0) - (pa?.[orderBy] ?? 0);
        });
      }
    );

    return NextResponse.json(sorted, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load market cards." },
      { status: 500 }
    );
  }
}
