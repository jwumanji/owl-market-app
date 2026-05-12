import { createServiceClient } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// loadSets() — shared loader used by both /api/sets and the /sets page (SSR).
// Returns aggregated set data + extras, or throws on DB error.
// ---------------------------------------------------------------------------

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

const DEFAULT_COLOR = "#4F8EF7";

const ALLOWED_CODES = new Set([
  "OP01","OP02","OP03","OP04","OP05","OP06","OP07","OP08","OP09","OP10",
  "OP11","OP12","OP13","OP14","OP15","PRB01","PRB02","EB01","EB02","EB03",
]);

const SET_NAME_SUFFIX_BY_CODE: Record<string, string> = {
  OP14: "-EB04",
  OP15: "-EB04",
};

const SET_DISPLAY_CODE_BY_CODE: Record<string, string> = {
  OP14: "OP14-EB04",
  OP15: "OP15-EB04",
};

function displaySetName(code: string, name: string | null | undefined): string {
  const baseName = name ?? code;
  const suffix = SET_NAME_SUFFIX_BY_CODE[code.toUpperCase()];
  if (!suffix || baseName.toUpperCase().endsWith(suffix)) return baseName;
  return `${baseName} ${suffix}`;
}

export type LoadedSets = {
  sets: Array<Record<string, unknown>>;
  extraSets: Array<Record<string, unknown>>;
};

export async function loadSets(): Promise<LoadedSets> {
  const supabase = createServiceClient();

  const { data: allSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, year, color, card_count")
    .order("code");

  if (setsErr) throw new Error(setsErr.message);
  if (!allSets || allSets.length === 0) return { sets: [], extraSets: [] };

  const filteredSets = allSets.filter((s) => ALLOWED_CODES.has((s.code ?? "").toUpperCase()));

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
        card_number,
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
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (cardsErr) throw new Error(cardsErr.message);
    if (!batch || batch.length === 0) break;
    allCards.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const cardsBySet: Record<string, Array<{
    id: string;
    name: string;
    card_number: string | null;
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

  // Total row count per set (includes unpriced rows). Used to surface
  // coverage like "N/M priced" so a sync gap can't silently shrink the
  // headline value without anyone noticing.
  const totalRowsBySet: Record<string, number> = {};

  for (const card of allCards) {
    const setId = card.set_id as string;
    if (setId) totalRowsBySet[setId] = (totalRowsBySet[setId] ?? 0) + 1;
    const ps = card.price_stats as Record<string, number> | null;
    if (!setId || !ps || !ps.tcg_market) continue;

    if (!cardsBySet[setId]) cardsBySet[setId] = [];
    cardsBySet[setId].push({
      id: card.id as string,
      name: card.name as string,
      card_number: (card.card_number as string | null) ?? null,
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

  const CHASE_RANK: Record<string, number> = {
    MR: 0, GMR: 0, SAR: 1, SP: 2, AA: 3, TR: 4, SEC: 5, SR: 6, L: 7, R: 8,
  };
  const rankOf = (r: string) => CHASE_RANK[r] ?? 99;
  const top5BySet: Record<string, typeof cardsBySet[string]> = {};
  const allTop5Ids: string[] = [];

  for (const [setId, cards] of Object.entries(cardsBySet)) {
    const byNum = new Map<string, typeof cards[number]>();
    for (const c of cards) {
      const key = c.card_number ?? `id:${c.id}`;
      const cur = byNum.get(key);
      if (!cur) {
        byNum.set(key, c);
        continue;
      }
      const a = rankOf(cur.rarity);
      const b = rankOf(c.rarity);
      if (b < a) byNum.set(key, c);
      else if (b === a && c.ps.tcg_market > cur.ps.tcg_market) byNum.set(key, c);
    }
    const deduped = Array.from(byNum.values())
      .sort((a, b) => b.ps.tcg_market - a.ps.tcg_market)
      .slice(0, 10);
    top5BySet[setId] = deduped;
    allTop5Ids.push(...deduped.map((c) => c.id));
  }

  const historyMap: Record<string, number[]> = {};

  if (allTop5Ids.length > 0) {
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

  const sets: Array<Record<string, unknown>> = [];
  const extraSets: Array<Record<string, unknown>> = [];

  for (const set of filteredSets) {
    const cards = cardsBySet[set.id] ?? [];
    const color = set.color || DEFAULT_COLOR;
    const code = set.code ?? set.slug.toUpperCase();
    const displayCode = SET_DISPLAY_CODE_BY_CODE[code.toUpperCase()] ?? code;
    const displayName = displaySetName(code, set.name);
    const shouldShowInIndex = cards.length >= 1;

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

    const top5 = top5BySet[set.id] ?? [];
    let spark: number[] = [];

    if (top5.length > 0) {
      const sparklines = top5.map((c) => historyMap[c.id] ?? [c.ps.tcg_market]);
      const maxLen = Math.max(...sparklines.map((s) => s.length));

      if (maxLen > 1) {
        spark = Array(maxLen).fill(0);
        for (const sl of sparklines) {
          const padded = Array(maxLen - sl.length).fill(sl[0] ?? 0).concat(sl);
          for (let j = 0; j < maxLen; j++) {
            spark[j] += padded[j];
          }
        }
        const mn = Math.min(...spark);
        const mx = Math.max(...spark);
        const rng = mx - mn || 1;
        spark = spark.map((v) => +((v - mn) / rng * 20).toFixed(1));
      }
    }

    if (spark.length < 2) {
      spark = [10, 10];
    }

    const topCards = top5.map((c) => {
      const cardSpark = historyMap[c.id] ?? [c.ps.tcg_market, c.ps.tcg_market];
      const cmn = Math.min(...cardSpark);
      const cmx = Math.max(...cardSpark);
      const crng = cmx - cmn || 1;
      const normSpark = cardSpark.map((v) => +((v - cmn) / crng * 20).toFixed(1));

      return {
        id: c.id,
        img: c.image_url_small ?? c.image_url,
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

    if (shouldShowInIndex) {
      sets.push({
        slug: set.slug,
        code,
        displayCode,
        name: displayName,
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
        cardsTotal: totalRowsBySet[set.id] ?? cards.length,
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
    } else {
      extraSets.push({
        slug: set.slug,
        code,
        displayCode,
        name: displayName,
        year: set.year ?? 2024,
        color,
        price,
        chg7d,
        up,
      });
    }
  }

  sets.sort((a, b) => (b.price as number) - (a.price as number));

  return { sets, extraSets };
}
