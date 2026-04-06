import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// GET /api/sets — returns all sets with aggregated price data for index page
// ---------------------------------------------------------------------------

/* ── Helpers ── */

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const RARITY_LABELS: Record<string, string> = {
  MR: "MANGA RARE",
  GMR: "GOLDEN MR",
  SP: "SPECIAL RARE",
  SEC: "SECRET RARE",
  TR: "TREAS. RARE",
  AA: "ALT ART",
  SR: "SUPER RARE",
  L: "LEADER",
  R: "RARE",
};

const RARITY_EMOJI: Record<string, string> = {
  MR: "\u2620",
  GMR: "\uD83D\uDC51",
  SP: "\uD83D\uDD25",
  SEC: "\uD83D\uDD34",
  TR: "\uD83C\uDFF4",
  AA: "\uD83C\uDFB4",
  SR: "\uD83C\uDF0A",
  L: "\u2694",
  R: "\uD83D\uDC8E",
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPrice(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatChg(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// Default color when set has no color stored
const DEFAULT_COLOR = "#4F8EF7";

export async function GET() {
  const supabase = createServiceClient();

  // 1. Fetch all sets
  const { data: allSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, year, color, card_count")
    .order("code");

  if (setsErr) {
    return NextResponse.json({ error: setsErr.message }, { status: 500 });
  }

  if (!allSets || allSets.length === 0) {
    return NextResponse.json({ sets: [], extraSets: [] });
  }

  // 2. Fetch ALL cards with price_stats in bulk (paginated)
  const allCards: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data: batch, error: cardsErr } = await supabase
      .from("cards")
      .select(`
        id,
        set_id,
        name,
        rarity,
        image_url,
        image_url_small,
        price_stats (
          market_avg,
          tcg_market,
          chg_1d,
          chg_7d,
          chg_30d,
          volume_7d,
          ath,
          atl
        )
      `)
      .not("price_stats", "is", null)
      .range(from, from + pageSize - 1);

    if (cardsErr) {
      return NextResponse.json({ error: cardsErr.message }, { status: 500 });
    }
    if (!batch || batch.length === 0) break;
    allCards.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  // 3. Group cards by set_id
  const cardsBySet: Record<string, Array<{
    id: string;
    name: string;
    rarity: string;
    image_url: string | null;
    image_url_small: string | null;
    ps: {
      market_avg: number;
      tcg_market: number;
      chg_1d: number;
      chg_7d: number;
      chg_30d: number;
      volume_7d: number;
      ath: number;
      atl: number;
    };
  }>> = {};

  for (const card of allCards) {
    const setId = card.set_id as string;
    const ps = card.price_stats as Record<string, number> | null;
    if (!setId || !ps || !ps.tcg_market) continue;

    if (!cardsBySet[setId]) cardsBySet[setId] = [];
    cardsBySet[setId].push({
      id: card.id as string,
      name: card.name as string,
      rarity: card.rarity as string,
      image_url: card.image_url as string | null,
      image_url_small: card.image_url_small as string | null,
      ps: {
        market_avg: ps.market_avg ?? ps.tcg_market ?? 0,
        tcg_market: ps.tcg_market ?? 0,
        chg_1d: ps.chg_1d ?? 0,
        chg_7d: ps.chg_7d ?? 0,
        chg_30d: ps.chg_30d ?? 0,
        volume_7d: ps.volume_7d ?? 0,
        ath: ps.ath ?? 0,
        atl: ps.atl ?? 0,
      },
    });
  }

  // 4. Get top 5 card IDs across all sets for sparkline history
  const top5BySet: Record<string, typeof cardsBySet[string]> = {};
  const allTop5Ids: string[] = [];

  for (const [setId, cards] of Object.entries(cardsBySet)) {
    const sorted = [...cards].sort((a, b) => b.ps.tcg_market - a.ps.tcg_market);
    top5BySet[setId] = sorted.slice(0, 5);
    allTop5Ids.push(...top5BySet[setId].map((c) => c.id));
  }

  // 5. Fetch sparkline history for top cards (9 points each)
  const historyMap: Record<string, number[]> = {};

  if (allTop5Ids.length > 0) {
    // Batch in chunks of 200 IDs to avoid URL length limits
    const chunkSize = 200;
    for (let i = 0; i < allTop5Ids.length; i += chunkSize) {
      const chunk = allTop5Ids.slice(i, i + chunkSize);
      const { data: history } = await supabase
        .from("price_history")
        .select("card_id, tcg_market, recorded_at")
        .in("card_id", chunk)
        .order("recorded_at", { ascending: false })
        .limit(chunk.length * 13);

      for (const row of history ?? []) {
        if (!historyMap[row.card_id]) historyMap[row.card_id] = [];
        if (historyMap[row.card_id].length < 13) {
          historyMap[row.card_id].unshift(row.tcg_market ?? 0);
        }
      }
    }
  }

  // 6. Build response for each set
  const sets = [];
  const extraSets = [];

  for (const set of allSets) {
    const cards = cardsBySet[set.id] ?? [];
    const color = set.color || DEFAULT_COLOR;

    // Aggregate stats
    let totalValue = 0;
    let weightedChg1d = 0;
    let weightedChg7d = 0;
    let weightedChg30d = 0;
    let totalVolume = 0;
    let totalAth = 0;
    let totalAtl = 0;

    for (const c of cards) {
      totalValue += c.ps.tcg_market;
      weightedChg1d += c.ps.tcg_market * (c.ps.chg_1d ?? 0);
      weightedChg7d += c.ps.tcg_market * (c.ps.chg_7d ?? 0);
      weightedChg30d += c.ps.tcg_market * (c.ps.chg_30d ?? 0);
      totalVolume += (c.ps.volume_7d ?? 0) * (c.ps.tcg_market ?? 1);
      totalAth += c.ps.ath || c.ps.tcg_market;
      totalAtl += c.ps.atl || c.ps.tcg_market;
    }

    const price = +totalValue.toFixed(2);
    const chg1d = totalValue > 0 ? +(weightedChg1d / totalValue).toFixed(1) : 0;
    const chg7d = totalValue > 0 ? +(weightedChg7d / totalValue).toFixed(1) : 0;
    const chg30d = totalValue > 0 ? +(weightedChg30d / totalValue).toFixed(1) : 0;
    const chgMax = totalAtl > 0 ? +((totalValue - totalAtl) / totalAtl * 100).toFixed(1) : 0;
    const up = chg7d >= 0;

    // Build set-level sparkline from top 5 cards
    const top5 = top5BySet[set.id] ?? [];
    let spark: number[] = [];

    if (top5.length > 0) {
      // Find the max sparkline length
      const sparklines = top5.map((c) => historyMap[c.id] ?? [c.ps.tcg_market]);
      const maxLen = Math.max(...sparklines.map((s) => s.length));

      if (maxLen > 1) {
        spark = Array(maxLen).fill(0);
        for (const sl of sparklines) {
          // Pad shorter sparklines by repeating first value
          const padded = Array(maxLen - sl.length).fill(sl[0] ?? 0).concat(sl);
          for (let j = 0; j < maxLen; j++) {
            spark[j] += padded[j];
          }
        }
        // Normalize to a 0-20 range for display
        const mn = Math.min(...spark);
        const mx = Math.max(...spark);
        const rng = mx - mn || 1;
        spark = spark.map((v) => +((v - mn) / rng * 20).toFixed(1));
      }
    }

    if (spark.length < 2) {
      spark = [10, 10]; // flat line fallback
    }

    // Top cards shaped for UI
    const topCards = top5.map((c) => {
      const cardSpark = historyMap[c.id] ?? [c.ps.tcg_market, c.ps.tcg_market];
      // Normalize card sparkline to 0-20 range
      const cmn = Math.min(...cardSpark);
      const cmx = Math.max(...cardSpark);
      const crng = cmx - cmn || 1;
      const normSpark = cardSpark.map((v) => +((v - cmn) / crng * 20).toFixed(1));

      return {
        e: RARITY_EMOJI[c.rarity] ?? "\uD83C\uDFB4",
        n: c.name ?? "Unknown",
        rb: `rb-${(c.rarity ?? "r").toLowerCase()}`,
        rl: RARITY_LABELS[c.rarity] ?? c.rarity ?? "RARE",
        tcg: +c.ps.tcg_market.toFixed(2),
        avg: +c.ps.market_avg.toFixed(2),
        d1: c.ps.chg_1d ?? 0,
        d7: c.ps.chg_7d ?? 0,
        d30: c.ps.chg_30d ?? 0,
        sp: normSpark.length >= 2 ? normSpark : [10, 10],
      };
    });

    // Sets with enough data get full treatment
    if (cards.length >= 1) {
      sets.push({
        slug: set.slug,
        code: set.code ?? set.slug.toUpperCase(),
        name: set.name,
        year: set.year ?? 2024,
        color,
        colorD: hexToRgba(color, 0.14),
        colorBd: hexToRgba(color, 0.3),
        price,
        chg7d,
        chg1d,
        chg30d,
        chgMax,
        cards: cards.length,
        volume: formatVolume(totalVolume),
        ath: formatPrice(totalAth),
        atl: formatPrice(totalAtl),
        up,
        spark,
        perf: {
          h1: formatChg(0),
          h24: formatChg(chg1d),
          d7: formatChg(chg7d),
          m1: formatChg(chg30d),
          y1: formatChg(chgMax),
          max: formatChg(chgMax),
        },
        perfUp: [true, chg1d >= 0, chg7d >= 0, chg30d >= 0, chgMax >= 0, chgMax >= 0],
        topCards,
      });
    } else if (cards.length > 0) {
      extraSets.push({
        slug: set.slug,
        code: set.code ?? set.slug.toUpperCase(),
        name: set.name,
        year: set.year ?? 2024,
        color,
        price,
        chg7d,
        up,
      });
    }
  }

  // Sort featured sets by total value descending
  sets.sort((a, b) => b.price - a.price);

  return NextResponse.json(
    { sets, extraSets },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
