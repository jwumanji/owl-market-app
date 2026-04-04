import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { RARITY_META } from "@/app/rarities/rarities-data";

// ---------------------------------------------------------------------------
// GET /api/rarities — returns rarity index data with top cards + prices
// ---------------------------------------------------------------------------

// Map long-form rarity names to short codes
function normalizeRarity(raw: string): string {
  const r = raw.toUpperCase().trim();
  if (r.includes("GOLDEN") || r === "GMR") return "GMR";
  if (r.includes("MANGA") || r === "MR") return "MR";
  if (r === "SAR" || r.includes("SUPER ALT")) return "SAR";
  if (r.includes("SECRET") || r === "SEC") return "SEC";
  if (r.includes("SPECIAL") || r === "SP") return "SP";
  if (r.includes("TREAS") || r === "TR") return "TR";
  if (r.includes("ALT") || r === "AA") return "AA";
  if (r.includes("SUPER") || r === "SR") return "SR";
  if (r.includes("LEADER") || r === "L") return "L";
  if (r.includes("UNCOMMON") || r === "UC") return "UC";
  if (r.includes("COMMON") || r === "C") return "C";
  if (r === "R" || r === "RARE") return "R";
  return r; // return as-is if no match
}

export async function GET() {
  const supabase = createServiceClient();

  // 1. Get distinct rarity values
  const { data: allCards, error: err } = await supabase
    .from("cards")
    .select("rarity")
    .not("rarity", "is", null);

  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const raritySet = new Set<string>();
  for (const c of allCards ?? []) {
    if (c.rarity) raritySet.add(normalizeRarity(c.rarity));
  }
  const distinctRarities = Array.from(raritySet);

  // 2. For each rarity, aggregate data
  const results = await Promise.all(
    distinctRarities.map(async (code) => {
      const meta = RARITY_META[code];
      if (!meta) return null;

      // Count cards for this rarity
      const { count } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("rarity", code);

      // Get top 5 cards by price
      const { data: topCards } = await supabase
        .from("cards")
        .select(`
          id, name, card_number, variant_label, rarity,
          sets!inner (code, name),
          price_stats!inner (
            tcg_market, market_avg,
            chg_1d, chg_7d, chg_30d
          )
        `)
        .eq("rarity", code)
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

      // Calculate rarity index (sum of all card market prices)
      const { data: allPrices } = await supabase
        .from("cards")
        .select("price_stats (tcg_market, chg_7d, chg_30d)")
        .eq("rarity", code)
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
      const cardCount = count ?? 0;

      return {
        slug: code.toLowerCase(),
        name: meta.name,
        code,
        subtitle: meta.subtitle,
        color: meta.color,
        colorD: meta.colorD,
        colorBd: meta.colorBd,
        indexValue: +indexValue.toFixed(2),
        cardCount,
        avgCardPrice: cardCount > 0 ? +(indexValue / cardCount).toFixed(2) : 0,
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
            rarity: c.rarity ?? code,
            tcg: ps?.tcg_market ?? 0,
            avg: ps?.market_avg ?? 0,
            chg1d: ps?.chg_1d ?? 0,
            chg7d: ps?.chg_7d ?? 0,
            chg30d: ps?.chg_30d ?? 0,
            spark: historyMap[c.id] ?? [ps?.tcg_market ?? 0, ps?.tcg_market ?? 0],
          };
        }),
      };
    })
  );

  // Filter nulls and zero-value entries, sort by index value
  const withCards = results
    .filter((r): r is NonNullable<typeof r> => r != null && r.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue);

  return NextResponse.json(withCards);
}
