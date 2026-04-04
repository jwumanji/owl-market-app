import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createServiceClient();

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

  // 2. Fetch price history
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("tcg_market, market_avg, recorded_at")
    .eq("card_id", card.id)
    .order("recorded_at", { ascending: true });

  return NextResponse.json({
    card: {
      id: card.id,
      card_image_id: card.card_image_id,
      card_number: card.card_number,
      name: card.name,
      name_base: card.name_base,
      variant_label: card.variant_label,
      rarity: card.rarity,
      card_type: card.card_type,
      color: card.color,
      image_url: card.image_url,
      image_url_small: card.image_url_small,
    },
    set,
    priceStats,
    priceHistory: priceHistory ?? [],
  });
}
