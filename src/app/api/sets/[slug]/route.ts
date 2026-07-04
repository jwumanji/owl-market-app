import { NextResponse } from "next/server";
import { createCachedServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacksList } from "@/lib/game-payload";
import {
  gameParamFromRequest,
  gameResponsePayload,
  publicOnlyForCatalogPreview,
  resolveGameScope,
} from "@/lib/game-scope";
import {
  cachedPublicData,
  PUBLIC_DATA_CACHE_HEADERS,
  PUBLIC_DATA_CACHE_TTL_SECONDS,
  publicDataCacheKey,
} from "@/lib/public-data-cache";
import { firstRelation } from "@/lib/supabase-relations";

export const revalidate = PUBLIC_DATA_CACHE_TTL_SECONDS;

class SetDetailLoadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SetDetailLoadError";
    this.status = status;
  }
}

async function loadSetDetailData(options: {
  slug: string;
  game?: string | null;
  publicOnly: boolean;
}) {
  const supabase = createCachedServiceClient(PUBLIC_DATA_CACHE_TTL_SECONDS);
  const gameResult = await resolveGameScope(supabase, options.game, {
    defaultToOnePiece: true,
    publicOnly: options.publicOnly,
  });

  if (gameResult.error) {
    throw new SetDetailLoadError(gameResult.error.message, gameResult.error.status);
  }
  const { game } = gameResult;
  const slug = decodeURIComponent(options.slug);

  const { data: set, error: setErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, series, color, year")
    .eq("game_id", game.id)
    .or(`slug.eq.${slug},code.ilike.${slug}`)
    .limit(1)
    .single();

  if (setErr || !set) {
    throw new SetDetailLoadError("Set not found", 404);
  }

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
        price_stats!price_stats_card_game_fk (
          market_avg,
          tcg_market,
          ebay_avg,
          chg_1d,
          chg_7d,
          chg_30d
        )
      `)
      .eq("game_id", game.id)
      .eq("region", "en")
      .eq("set_id", set.id)
      .range(from, from + pageSize - 1);

    if (cardsErr) {
      throw new SetDetailLoadError(cardsErr.message, 500);
    }
    if (!batch || batch.length === 0) break;

    allCards.push(
      ...withOnePiecePayloadFallbacksList(
        (batch as Record<string, unknown>[]).map((row) => ({
          ...row,
          price_stats: firstRelation(row.price_stats as Record<string, unknown> | Record<string, unknown>[] | null),
        }))
      )
    );

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { game: gameResponsePayload(game), set, cards: allCards };
}

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const game = gameParamFromRequest(request);
  const publicOnly = publicOnlyForCatalogPreview();

  try {
    const data = await cachedPublicData(
      publicDataCacheKey("api-set-detail-v2", game ?? "default", params.slug, publicOnly),
      () => loadSetDetailData({ slug: params.slug, game, publicOnly })
    );

    return NextResponse.json(data, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    if (error instanceof SetDetailLoadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load set." },
      { status: 500 }
    );
  }
}
