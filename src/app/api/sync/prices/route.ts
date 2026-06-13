import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authorizeInternalRequest } from "@/lib/internal-api-auth";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";

export async function GET(request: Request) {
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request));

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // Fetch all sets with card_count
  const { data: sets, error } = await supabase
    .from("sets")
    .select("id, slug, code, name, series, card_count")
    .eq("game_id", game.id)
    .order("code");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get card IDs per set in parallel
  const setsWithIds = await Promise.all(
    sets.map(async (set) => {
      const { data } = await supabase
        .from("cards")
        .select("id")
        .eq("game_id", game.id)
        .eq("set_id", set.id);
      return { set, cardIds: data?.map((c) => c.id) ?? [] };
    })
  );

  // Get top 5 cards by price per set in parallel
  const setsWithTopCards = await Promise.all(
    setsWithIds.map(async ({ set, cardIds }) => {
      if (!cardIds.length) return { set, topCards: [], topCardIds: [] };

      const { data: priceRows } = await supabase
        .from("price_stats")
        .select(`
          card_id, tcg_market, market_avg,
          chg_1d, chg_7d, chg_30d,
          card:card_id (name, rarity)
        `)
        .eq("game_id", game.id)
        .in("card_id", cardIds)
        .not("tcg_market", "is", null)
        .order("tcg_market", { ascending: false })
        .limit(5);

      return {
        set,
        topCards: priceRows ?? [],
        topCardIds: priceRows?.map((r) => r.card_id) ?? [],
      };
    })
  );

  // Batch-fetch sparkline history for all top cards in one query
  const allTopIds = setsWithTopCards.flatMap((s) => s.topCardIds);
  const { data: historyRows } = allTopIds.length
    ? await supabase
        .from("price_history")
        .select("card_id, tcg_market, recorded_at")
        .eq("game_id", game.id)
        .in("card_id", allTopIds)
        .order("recorded_at", { ascending: false })
        .limit(allTopIds.length * 9)
    : { data: [] };

  // Group history by card_id — 9 points each, oldest-first
  const historyMap: Record<string, number[]> = {};
  for (const row of historyRows ?? []) {
    if (!historyMap[row.card_id]) historyMap[row.card_id] = [];
    if (historyMap[row.card_id].length < 9) {
      historyMap[row.card_id].unshift(row.tcg_market ?? 0);
    }
  }

  // Build response
  const result = setsWithTopCards.map(({ set, topCards }) => ({
    slug: set.slug,
    code: set.code,
    name: set.name,
    cards: set.card_count ?? 0,
    topCards: topCards.map((ps) => ({
      n:   (ps.card as unknown as { name: string; rarity: string })?.name ?? "",
      rl:  (ps.card as unknown as { name: string; rarity: string })?.rarity ?? "",
      tcg: ps.tcg_market ?? 0,
      avg: ps.market_avg ?? 0,
      d1:  ps.chg_1d ?? 0,
      d7:  ps.chg_7d ?? 0,
      d30: ps.chg_30d ?? 0,
      sp:  historyMap[ps.card_id] ?? [ps.tcg_market ?? 0, ps.tcg_market ?? 0],
    })),
  }));

  return NextResponse.json({ game: gameResponsePayload(game), sets: result });
}
