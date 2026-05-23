import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { withOnePiecePayloadFallbacks } from "@/lib/game-payload";
import {
  gameParamFromRequest,
  gameResponsePayload,
  resolveGameScope,
} from "@/lib/game-scope";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: true,
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  // 1. Fetch card with price_stats and set info
  const { data: card, error: cardErr } = await supabase
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
        tcg_low,
        tcg_mid,
        tcg_high,
        chg_1d,
        chg_7d,
        chg_30d,
        ath,
        ath_date,
        atl,
        atl_date,
        updated_at
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
    .eq("card_image_id", id)
    .limit(1)
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Normalize joined relations (Supabase returns object for unique FK)
  const priceStats = Array.isArray(card.price_stats)
    ? card.price_stats[0] ?? null
    : card.price_stats ?? null;
  const set = Array.isArray(card.sets)
    ? card.sets[0] ?? null
    : card.sets ?? null;
  const payloadCard = withOnePiecePayloadFallbacks(card as Record<string, unknown>);

  // 2. Fetch price history
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("tcg_market, market_avg, recorded_at")
    .eq("game_id", game.id)
    .eq("card_id", card.id)
    .order("recorded_at", { ascending: true });

  const realHistory = priceHistory ?? [];

  // 3. Fallback: synthesize a sparse series from price_stats when we have
  //    fewer than 2 real points, so the chart isn't blank.
  let historyOut = realHistory;
  let synthetic = false;
  if (realHistory.length < 2 && priceStats) {
    const synth = synthesizeHistory(priceStats);
    if (synth.length >= 2) {
      historyOut = synth;
      synthetic = true;
    }
  }

  return NextResponse.json({
    game: gameResponsePayload(game),
    card: {
      id: card.id,
      card_image_id: card.card_image_id,
      card_number: card.card_number,
      name: card.name,
      name_base: card.name_base,
      variant_label: card.variant_label,
      rarity: card.rarity,
      card_type: payloadCard.card_type,
      color: payloadCard.color,
      image_url: card.image_url,
      image_url_small: card.image_url_small,
    },
    set,
    priceStats,
    priceHistory: historyOut,
    priceHistorySynthetic: synthetic,
  });
}

interface PriceStatsRow {
  market_avg: number | null;
  tcg_market: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  updated_at: string | null;
}

interface SynthPoint {
  tcg_market: number;
  market_avg: number;
  recorded_at: string;
}

function synthesizeHistory(stats: PriceStatsRow): SynthPoint[] {
  const current = stats.market_avg ?? stats.tcg_market;
  if (current == null) return [];

  const tcgCurrent = stats.tcg_market ?? current;
  const nowMs = stats.updated_at ? new Date(stats.updated_at).getTime() : Date.now();
  const day = 86400000;

  const points: SynthPoint[] = [];
  const seen = new Set<string>();
  const push = (whenMs: number, marketAvg: number | null, tcg: number | null) => {
    if (marketAvg == null || !isFinite(marketAvg) || marketAvg <= 0) return;
    const iso = new Date(whenMs).toISOString();
    if (seen.has(iso)) return;
    seen.add(iso);
    points.push({
      market_avg: marketAvg,
      tcg_market: tcg != null && isFinite(tcg) && tcg > 0 ? tcg : marketAvg,
      recorded_at: iso,
    });
  };

  // ATL / ATH anchors
  if (stats.atl != null && stats.atl_date) {
    push(new Date(stats.atl_date).getTime(), stats.atl, stats.atl);
  }
  if (stats.ath != null && stats.ath_date) {
    push(new Date(stats.ath_date).getTime(), stats.ath, stats.ath);
  }

  // Derive prior prices from % changes: priceThen = current / (1 + chg/100)
  const derive = (chgPct: number | null): number | null => {
    if (chgPct == null) return null;
    const denom = 1 + chgPct / 100;
    if (denom <= 0) return null;
    return current / denom;
  };

  push(nowMs - 30 * day, derive(stats.chg_30d), null);
  push(nowMs - 7 * day, derive(stats.chg_7d), null);
  push(nowMs - 1 * day, derive(stats.chg_1d), null);
  push(nowMs, current, tcgCurrent);

  points.sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  return points;
}
