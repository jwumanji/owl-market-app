import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// GET /api/characters — returns character index data with top cards + prices
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createServiceClient();

  // 1. Fetch all characters
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, slug, name, subtitle, faction, tier, type_tag")
    .order("tier")
    .order("name");

  if (charErr) {
    return NextResponse.json({ error: charErr.message }, { status: 500 });
  }

  // 2. For each character, get their cards with prices
  const results = await Promise.all(
    (characters ?? []).map(async (char) => {
      // Count cards for this character
      const { count } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("character_id", char.id);

      // Get top 5 cards by price
      const { data: topCards } = await supabase
        .from("cards")
        .select(`
          id, name, card_number, variant_label, rarity,
          set_id, image_url, image_url_small, card_image_id,
          sets!inner (code, name),
          price_stats!inner (
            tcg_market, market_avg,
            chg_1d, chg_7d, chg_30d,
            ath, atl
          )
        `)
        .eq("character_id", char.id)
        .not("price_stats.tcg_market", "is", null)
        .order("price_stats(tcg_market)", { ascending: false })
        .limit(5);

      // Get sparkline history for top cards
      const topCardIds = (topCards ?? []).map((c) => c.id);
      const { data: history } = topCardIds.length
        ? await supabase
            .from("price_history")
            .select("card_id, tcg_market, recorded_at")
            .in("card_id", topCardIds)
            .order("recorded_at", { ascending: false })
            .limit(topCardIds.length * 9)
        : { data: [] };

      // Group history by card_id
      const historyMap: Record<string, number[]> = {};
      for (const row of history ?? []) {
        if (!historyMap[row.card_id]) historyMap[row.card_id] = [];
        if (historyMap[row.card_id].length < 9) {
          historyMap[row.card_id].unshift(row.tcg_market ?? 0);
        }
      }

      // Calculate character index (sum of all card market prices)
      const { data: allPrices } = await supabase
        .from("cards")
        .select("price_stats (tcg_market, chg_7d, chg_30d)")
        .eq("character_id", char.id)
        .not("price_stats.tcg_market", "is", null);

      let indexValue = 0;
      let totalChg7d = 0;
      let totalChg30d = 0;
      let pricedCount = 0;

      for (const card of allPrices ?? []) {
        const ps = card.price_stats as unknown as {
          tcg_market: number | null;
          chg_7d: number | null;
          chg_30d: number | null;
        };
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
        topCards: (topCards ?? []).map((c) => {
          const ps = c.price_stats as unknown as {
            tcg_market: number; market_avg: number;
            chg_1d: number; chg_7d: number; chg_30d: number;
          };
          const setInfo = c.sets as unknown as { code: string; name: string };
          return {
            name: c.name,
            set: setInfo?.code ?? "",
            rarity: c.rarity ?? "",
            tcg: ps?.tcg_market ?? 0,
            avg: ps?.market_avg ?? 0,
            chg1d: ps?.chg_1d ?? 0,
            chg7d: ps?.chg_7d ?? 0,
            chg30d: ps?.chg_30d ?? 0,
            spark: historyMap[c.id] ?? [ps?.tcg_market ?? 0, ps?.tcg_market ?? 0],
            imageUrl: c.image_url ?? null,
            imageUrlSmall: c.image_url_small ?? null,
            cardImageId: c.card_image_id ?? null,
          };
        }),
      };
    })
  );

  // Filter out characters with no priced cards, sort by index value
  const withCards = results
    .filter((r) => r.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue);

  return NextResponse.json(withCards);
}
