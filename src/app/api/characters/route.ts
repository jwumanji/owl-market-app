import { NextResponse } from "next/server";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";
import { cachedPublicData, PUBLIC_DATA_CACHE_HEADERS, publicDataCacheKey } from "@/lib/public-data-cache";
import { createServiceClient } from "@/lib/supabase-server";
import { firstRelation, flattenPriceStatsCardRow } from "@/lib/supabase-relations";

// ---------------------------------------------------------------------------
// GET /api/characters - returns character index data with top cards + prices
// ---------------------------------------------------------------------------

async function loadCharacterIndex(gameId: string) {
  const supabase = createServiceClient();

  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, slug, name, subtitle, faction, tier, type_tag")
    .eq("game_id", gameId)
    .order("tier")
    .order("name");

  if (charErr) {
    throw new Error(charErr.message);
  }

  const results = await Promise.all(
    (characters ?? []).map(async (char) => {
      const { count } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("game_id", gameId)
        .eq("character_id", char.id);

      const { data: topCards } = await supabase
        .from("price_stats")
        .select(`
          tcg_market, market_avg,
          chg_1d, chg_7d, chg_30d,
          ath, atl,
          cards!price_stats_card_game_fk!inner (
            id, name, card_number, variant_label, rarity,
            set_id, image_url, image_url_small, card_image_id,
            sets!cards_set_game_fk (code, name)
          )
        `)
        .eq("game_id", gameId)
        .eq("cards.character_id", char.id)
        .not("tcg_market", "is", null)
        .order("tcg_market", { ascending: false })
        .limit(10);

      const normalizedTopCards = ((topCards ?? []) as Record<string, unknown>[])
        .map(flattenPriceStatsCardRow)
        .filter((row): row is Record<string, unknown> => row != null);
      const topCardIds = normalizedTopCards.map((c) => c.id as string);
      const { data: history } = topCardIds.length
        ? await supabase
            .from("price_history")
            .select("card_id, tcg_market, recorded_at")
            .eq("game_id", gameId)
            .in("card_id", topCardIds)
            .order("recorded_at", { ascending: false })
            .limit(topCardIds.length * 9)
        : { data: [] };

      const historyMap: Record<string, number[]> = {};
      for (const row of history ?? []) {
        if (!historyMap[row.card_id]) historyMap[row.card_id] = [];
        if (historyMap[row.card_id].length < 9) {
          historyMap[row.card_id].unshift(row.tcg_market ?? 0);
        }
      }

      const { data: allPrices } = await supabase
        .from("cards")
        .select("price_stats!price_stats_card_game_fk!inner (tcg_market, chg_7d, chg_30d)")
        .eq("game_id", gameId)
        .eq("character_id", char.id)
        .not("price_stats.tcg_market", "is", null);

      let indexValue = 0;
      let totalChg7d = 0;
      let totalChg30d = 0;
      let pricedCount = 0;

      for (const card of allPrices ?? []) {
        const ps = firstRelation(card.price_stats as unknown as {
          tcg_market: number | null;
          chg_7d: number | null;
          chg_30d: number | null;
        } | Array<{
          tcg_market: number | null;
          chg_7d: number | null;
          chg_30d: number | null;
        }> | null);
        if (ps?.tcg_market) {
          indexValue += ps.tcg_market;
          totalChg7d += ps.chg_7d ?? 0;
          totalChg30d += ps.chg_30d ?? 0;
          pricedCount++;
        }
      }

      const avgChg7d = pricedCount > 0 ? +(totalChg7d / pricedCount).toFixed(1) : 0;
      const avgChg30d = pricedCount > 0 ? +(totalChg30d / pricedCount).toFixed(1) : 0;

      return {
        slug: char.slug,
        name: char.name,
        subtitle: char.subtitle,
        faction: char.faction,
        tier: char.tier,
        indexValue: +indexValue.toFixed(2),
        cardCount: count ?? 0,
        chg7d: avgChg7d,
        chg30d: avgChg30d,
        up: avgChg7d >= 0,
        topCards: normalizedTopCards.map((c) => {
          const ps = firstRelation(c.price_stats as unknown as {
            tcg_market: number;
            market_avg: number;
            chg_1d: number;
            chg_7d: number;
            chg_30d: number;
          } | Array<{
            tcg_market: number;
            market_avg: number;
            chg_1d: number;
            chg_7d: number;
            chg_30d: number;
          }> | null);
          const setInfo = firstRelation(c.sets as unknown as { code: string; name: string } | Array<{ code: string; name: string }> | null);
          return {
            name: c.name,
            set: setInfo?.code ?? "",
            rarity: c.rarity ?? "",
            tcg: ps?.tcg_market ?? 0,
            avg: ps?.market_avg ?? 0,
            chg1d: ps?.chg_1d ?? 0,
            chg7d: ps?.chg_7d ?? 0,
            chg30d: ps?.chg_30d ?? 0,
            spark: historyMap[c.id as string] ?? [ps?.tcg_market ?? 0, ps?.tcg_market ?? 0],
            imageUrl: c.image_url ?? null,
            imageUrlSmall: c.image_url_small ?? null,
            cardImageId: c.card_image_id ?? null,
          };
        }),
      };
    })
  );

  return results
    .filter((r) => r.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue);
}

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }

  try {
    const withCards = await cachedPublicData(
      publicDataCacheKey("api-characters", gameResult.game.id),
      () => loadCharacterIndex(gameResult.game.id)
    );
    return NextResponse.json(withCards, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load character data." },
      { status: 500 }
    );
  }
}
