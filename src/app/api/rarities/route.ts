import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { RARITY_META } from "@/app/rarities/rarities-data";
import { gameParamFromRequest, publicOnlyForCatalogPreview, resolveGameScope } from "@/lib/game-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// GET /api/rarities — returns rarity index data with top cards + prices
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const gameResult = await resolveGameScope(supabase, gameParamFromRequest(request), {
    defaultToOnePiece: true,
    publicOnly: publicOnlyForCatalogPreview(),
  });

  if (gameResult.error) {
    return NextResponse.json({ error: gameResult.error.message }, { status: gameResult.error.status });
  }
  const { game } = gameResult;

  const distinctRarities = Object.keys(RARITY_META).filter((k) => k !== "SEALED");
  const nonPromoRarities = distinctRarities.filter((k) => k !== "PROMO");

  // Resolve promo set ID so we can query by set membership
  const { data: promoSet } = await supabase
    .from("sets")
    .select("id")
    .eq("game_id", game.id)
    .eq("slug", "promo")
    .single();
  const promoSetId = promoSet?.id as string | null;

  const applyPromoFilter = <T extends { or: (filters: string) => T; eq: (column: string, value: string) => T }>(
    query: T
  ): T => {
    if (!promoSetId) return query.eq("rarity", "PR");
    return query.or(`set_id.eq.${promoSetId},rarity.eq.PR`);
  };

  // ── Step 1: Batch-fetch ALL card counts + price aggregation in one pass ──
  // Paginate all cards with price_stats to avoid 1000-row limit
  const allPriced: { rarity: string; tcg_market: number; chg_7d: number; chg_30d: number }[] = [];
  const rarityCounts: Record<string, number> = {};

  // Count all cards per rarity in parallel
  const countPromises = distinctRarities.map(async (code) => {
    if (code === "PROMO") {
      let q = supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("game_id", game.id);
      q = applyPromoFilter(q);
      const { count } = await q;
      return { code, count: count ?? 0 };
    }
    let q = supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("game_id", game.id)
      .eq("rarity", code);
    if (promoSetId) q = q.neq("set_id", promoSetId);
    const { count } = await q;
    return { code, count: count ?? 0 };
  });

  // Paginate priced cards — non-promo rarities (exclude promo set cards)
  let priceFrom = 0;
  const pricePageSize = 1000;
  while (true) {
    let q = supabase
      .from("cards")
      .select("rarity, price_stats!inner (tcg_market, chg_7d, chg_30d)")
      .eq("game_id", game.id)
      .in("rarity", nonPromoRarities)
      .not("price_stats.tcg_market", "is", null)
      .range(priceFrom, priceFrom + pricePageSize - 1);
    if (promoSetId) q = q.neq("set_id", promoSetId);
    const { data: page } = await q;

    if (!page || page.length === 0) break;

    for (const card of page) {
      const ps = card.price_stats as unknown as {
        tcg_market: number | null;
        chg_7d: number | null;
        chg_30d: number | null;
      };
      if (ps?.tcg_market) {
        allPriced.push({
          rarity: card.rarity as string,
          tcg_market: ps.tcg_market,
          chg_7d: ps.chg_7d ?? 0,
          chg_30d: ps.chg_30d ?? 0,
        });
      }
    }

    if (page.length < pricePageSize) break;
    priceFrom += pricePageSize;
  }

  // Paginate priced cards — promo set cards
  let promoFrom = 0;
  while (true) {
    let q = supabase
      .from("cards")
      .select("rarity, price_stats!inner (tcg_market, chg_7d, chg_30d)")
      .eq("game_id", game.id)
      .not("price_stats.tcg_market", "is", null)
      .range(promoFrom, promoFrom + pricePageSize - 1);
    q = applyPromoFilter(q);
    const { data: page } = await q;

    if (!page || page.length === 0) break;

    for (const card of page) {
      const ps = card.price_stats as unknown as {
        tcg_market: number | null;
        chg_7d: number | null;
        chg_30d: number | null;
      };
      if (ps?.tcg_market) {
        allPriced.push({
          rarity: "PROMO",
          tcg_market: ps.tcg_market,
          chg_7d: ps.chg_7d ?? 0,
          chg_30d: ps.chg_30d ?? 0,
        });
      }
    }

    if (page.length < pricePageSize) break;
    promoFrom += pricePageSize;
  }

  // Wait for counts
  const countResults = await Promise.all(countPromises);
  for (const { code, count } of countResults) {
    rarityCounts[code] = count;
  }

  // Aggregate prices by rarity
  const rarityAgg: Record<string, { indexValue: number; totalChg7d: number; totalChg30d: number; pricedCount: number }> = {};
  for (const p of allPriced) {
    if (!rarityAgg[p.rarity]) {
      rarityAgg[p.rarity] = { indexValue: 0, totalChg7d: 0, totalChg30d: 0, pricedCount: 0 };
    }
    const a = rarityAgg[p.rarity];
    a.indexValue += p.tcg_market;
    a.totalChg7d += p.chg_7d;
    a.totalChg30d += p.chg_30d;
    a.pricedCount++;
  }

  // ── Step 2: Fetch top 10 cards per rarity (parallel) ──
  const topCardsPromises = distinctRarities.map(async (code) => {
    const fields = `
        id, name, card_number, variant_label, rarity,
        card_image_id, image_url, image_url_small,
        sets!inner (code, name),
        price_stats!inner (
          tcg_market, market_avg,
          chg_1d, chg_7d, chg_30d
        )
      `;

    if (code === "PROMO") {
      let q = supabase
        .from("cards")
        .select(fields)
        .eq("game_id", game.id)
        .not("price_stats.tcg_market", "is", null)
        .order("price_stats(tcg_market)", { ascending: false })
        .limit(10);
      q = applyPromoFilter(q);
      const { data: topCards } = await q;
      return { code, topCards: topCards ?? [] };
    }

    let q = supabase
      .from("cards")
      .select(fields)
      .eq("game_id", game.id)
      .eq("rarity", code)
      .not("price_stats.tcg_market", "is", null)
      .order("price_stats(tcg_market)", { ascending: false })
      .limit(10);
    if (promoSetId) q = q.neq("set_id", promoSetId);
    const { data: topCards } = await q;

    return { code, topCards: topCards ?? [] };
  });

  const topCardsResults = await Promise.all(topCardsPromises);
  const topCardsByRarity: Record<string, typeof topCardsResults[0]["topCards"]> = {};
  const allTopCardIds: string[] = [];

  for (const { code, topCards } of topCardsResults) {
    topCardsByRarity[code] = topCards;
    for (const c of topCards) allTopCardIds.push(c.id);
  }

  // ── Step 3: Fetch sparkline history for ALL top cards at once ──
  const historyMap: Record<string, number[]> = {};
  if (allTopCardIds.length > 0) {
    // Batch in groups of 100 to avoid query size limits
    const historyData: { card_id: string; tcg_market: number | null }[] = [];
    for (let i = 0; i < allTopCardIds.length; i += 100) {
      const batch = allTopCardIds.slice(i, i + 100);
      const { data } = await supabase
        .from("price_history")
        .select("card_id, tcg_market, recorded_at")
        .eq("game_id", game.id)
        .in("card_id", batch)
        .order("recorded_at", { ascending: false })
        .limit(batch.length * 10);
      if (data) historyData.push(...data);
    }

    for (const row of historyData) {
      if (!historyMap[row.card_id]) historyMap[row.card_id] = [];
      if (historyMap[row.card_id].length < 9) {
        historyMap[row.card_id].unshift(row.tcg_market ?? 0);
      }
    }
  }

  // ── Step 4: Build response ──
  const results = distinctRarities.map((code) => {
    const meta = RARITY_META[code];
    if (!meta) return null;

    const cardCount = rarityCounts[code] ?? 0;
    const agg = rarityAgg[code];
    const indexValue = agg ? +agg.indexValue.toFixed(2) : 0;
    const pricedCount = agg?.pricedCount ?? 0;
    const avgChg7d = pricedCount > 0 ? +(agg!.totalChg7d / pricedCount).toFixed(1) : 0;
    const avgChg30d = pricedCount > 0 ? +(agg!.totalChg30d / pricedCount).toFixed(1) : 0;

    const topCards = (topCardsByRarity[code] ?? []).map((c) => {
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
        cardImageId: (c as Record<string, unknown>).card_image_id as string ?? "",
        imageSmall: ((c as Record<string, unknown>).image_url_small as string | null) || ((c as Record<string, unknown>).image_url as string | null) || null,
      };
    });

    return {
      slug: code.toLowerCase(),
      name: meta.name,
      code,
      subtitle: meta.subtitle,
      color: meta.color,
      colorD: meta.colorD,
      colorBd: meta.colorBd,
      indexValue,
      cardCount,
      avgCardPrice: pricedCount > 0 ? +(indexValue / pricedCount).toFixed(2) : 0,
      chg7d: avgChg7d,
      chg30d: avgChg30d,
      up: avgChg7d >= 0,
      topCards,
    };
  });

  // Filter nulls; include any rarity with cards OR prices, sort by index value
  const withCards = results
    .filter((r): r is NonNullable<typeof r> => r != null && (r.indexValue > 0 || r.cardCount > 0))
    .sort((a, b) => b.indexValue - a.indexValue);

  return NextResponse.json(withCards, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
