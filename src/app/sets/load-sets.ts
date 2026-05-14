import { createServiceClient } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// loadSets() — groups cards by cards.printed_set_code so EB04, OP14, OP15 etc
// surface as canonical print runs rather than mirroring the distribution
// products in the `sets` table. Returns SetData[] consumed by /sets and /sets/[slug].
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
  SAR: "SAR",
  SP: "SPECIAL RARE",
  SEC: "SECRET RARE",
  TR: "TREAS. RARE",
  AA: "ALT ART",
  SR: "SUPER RARE",
  L: "LEADER",
  R: "RARE",
  UC: "UNCOMMON",
  C: "COMMON",
};

const RARITY_EMOJI: Record<string, string> = {
  MR: "☠",
  GMR: "👑",
  SAR: "✨",
  SP: "🔥",
  SEC: "🔴",
  TR: "🏴",
  AA: "🎴",
  SR: "🌊",
  L: "⚔",
  R: "💎",
  UC: "🔹",
  C: "⚪",
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

function classifyType(code: string): "op" | "eb" | "prb" | "st" | "promo" {
  if (code === "P" || code === "N") return "promo";
  if (code.startsWith("PRB")) return "prb";
  if (code.startsWith("OP")) return "op";
  if (code.startsWith("EB")) return "eb";
  if (code.startsWith("ST")) return "st";
  return "promo";
}

function normalizeCode(code: string): string {
  // Roll N (judge promos, ~6 cards) into P (promo bin) per Phase 1 decision.
  return code === "N" ? "P" : code;
}

const DEFAULT_COLOR = "#4F8EF7";
const TYPE_COLOR: Record<string, string> = {
  op: "#E8A020",
  eb: "#9B72FF",
  prb: "#00D68F",
  st: "#4F8EF7",
  promo: "#F472B6",
};

export type LoadedSets = {
  sets: Array<Record<string, unknown>>;
  extraSets: Array<Record<string, unknown>>;
};

export async function loadSets(): Promise<LoadedSets> {
  const supabase = createServiceClient();

  // 1. All sets meta (for name / year / color lookup keyed by code)
  const { data: allSets, error: setsErr } = await supabase
    .from("sets")
    .select("id, slug, code, name, year, color, card_count")
    .order("code");

  if (setsErr) throw new Error(setsErr.message);

  type SetMeta = {
    id: string;
    slug: string;
    code: string | null;
    name: string;
    year: number | null;
    color: string | null;
    card_count: number | null;
  };

  const setByCode = new Map<string, SetMeta>();
  for (const s of (allSets ?? []) as unknown as SetMeta[]) {
    if (s.code) setByCode.set(s.code, s);
  }

  // 2. All cards. Group by printed_set_code in JS.
  const allCards: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data: batch, error: cardsErr } = await supabase
      .from("cards")
      .select(`
        id,
        set_id,
        printed_set_code,
        name,
        card_number,
        card_image_id,
        rarity,
        variant_label,
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

  type CardCore = {
    id: string;
    name: string;
    card_number: string | null;
    card_image_id: string | null;
    rarity: string;
    variant_label: string | null;
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
  };

  const cardsByCode: Record<string, CardCore[]> = {};
  const totalRowsByCode: Record<string, number> = {};

  for (const card of allCards) {
    const rawCode = (card.printed_set_code as string | null) ?? null;
    if (!rawCode) continue;
    const code = normalizeCode(rawCode);
    totalRowsByCode[code] = (totalRowsByCode[code] ?? 0) + 1;

    const ps = card.price_stats as Record<string, number> | null;
    if (!ps || !ps.tcg_market) continue;

    if (!cardsByCode[code]) cardsByCode[code] = [];
    cardsByCode[code].push({
      id: card.id as string,
      name: card.name as string,
      card_number: (card.card_number as string | null) ?? null,
      card_image_id: (card.card_image_id as string | null) ?? null,
      rarity: (card.rarity as string) ?? "",
      variant_label: (card.variant_label as string | null) ?? null,
      image_url: (card.image_url as string | null) ?? null,
      image_url_small: (card.image_url_small as string | null) ?? null,
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

  // Surface every code with cards plus every sets-table row even if empty.
  const allCodes = new Set<string>([
    ...Object.keys(cardsByCode),
    ...Object.keys(totalRowsByCode),
    ...Array.from(setByCode.keys()),
  ]);

  // 3. Top 10 cards per code
  const CHASE_RANK: Record<string, number> = {
    MR: 0, GMR: 0, SAR: 1, SP: 2, AA: 3, TR: 4, SEC: 5, SR: 6, L: 7, R: 8,
  };
  const rankOf = (r: string) => CHASE_RANK[r] ?? 99;
  const top10ByCode: Record<string, CardCore[]> = {};
  const allTopIds: string[] = [];

  for (const [code, cards] of Object.entries(cardsByCode)) {
    const byNum = new Map<string, CardCore>();
    for (const c of cards) {
      const key = c.card_number ?? `id:${c.id}`;
      const cur = byNum.get(key);
      if (!cur) { byNum.set(key, c); continue; }
      const a = rankOf(cur.rarity);
      const b = rankOf(c.rarity);
      if (b < a) byNum.set(key, c);
      else if (b === a && c.ps.tcg_market > cur.ps.tcg_market) byNum.set(key, c);
    }
    const deduped = Array.from(byNum.values())
      .sort((a, b) => b.ps.tcg_market - a.ps.tcg_market)
      .slice(0, 10);
    top10ByCode[code] = deduped;
    allTopIds.push(...deduped.map((c) => c.id));
  }

  // 4. Price history for top cards → sparkline data
  const historyMap: Record<string, number[]> = {};
  if (allTopIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < allTopIds.length; i += chunkSize) {
      const chunk = allTopIds.slice(i, i + chunkSize);
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

  // 5. Compose SetData rows
  const sets: Array<Record<string, unknown>> = [];
  const extraSets: Array<Record<string, unknown>> = [];

  for (const code of Array.from(allCodes)) {
    const cards = cardsByCode[code] ?? [];
    const meta = setByCode.get(code);
    const type = classifyType(code);
    const color = meta?.color || TYPE_COLOR[type] || DEFAULT_COLOR;

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
    const chgMax = totalAtl > 0 ? +(((totalValue - totalAtl) / totalAtl) * 100).toFixed(1) : 0;
    const up = chg7d >= 0;

    const top = top10ByCode[code] ?? [];
    let spark: number[] = [];
    if (top.length > 0) {
      const sparklines = top.map((c) => historyMap[c.id] ?? [c.ps.tcg_market]);
      const maxLen = Math.max(...sparklines.map((s) => s.length));
      if (maxLen > 1) {
        spark = Array(maxLen).fill(0);
        for (const sl of sparklines) {
          const padded = Array(maxLen - sl.length).fill(sl[0] ?? 0).concat(sl);
          for (let j = 0; j < maxLen; j++) spark[j] += padded[j];
        }
        const mn = Math.min(...spark);
        const mx = Math.max(...spark);
        const rng = mx - mn || 1;
        spark = spark.map((v) => +((((v - mn) / rng) * 20)).toFixed(1));
      }
    }
    if (spark.length < 2) spark = [10, 10];

    const topCards = top.map((c) => {
      const cardSpark = historyMap[c.id] ?? [c.ps.tcg_market, c.ps.tcg_market];
      const cmn = Math.min(...cardSpark);
      const cmx = Math.max(...cardSpark);
      const crng = cmx - cmn || 1;
      const normSpark = cardSpark.map((v) => +((((v - cmn) / crng) * 20)).toFixed(1));
      return {
        id: c.id,
        card_image_id: c.card_image_id ?? c.card_number ?? c.id,
        img: c.image_url_small ?? c.image_url,
        e: RARITY_EMOJI[c.rarity] ?? "🎴",
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

    const totalRows = totalRowsByCode[code] ?? cards.length;
    const slug = meta?.slug ?? code.toLowerCase();

    if (cards.length > 0 || totalRows > 0 || meta) {
      sets.push({
        slug,
        code,
        name: meta?.name ?? code,
        year: meta?.year ?? null,
        type,
        color,
        colorD: hexToRgba(color, 0.14),
        colorBd: hexToRgba(color, 0.3),
        price,
        chg7d,
        chg1d,
        chg30d,
        chgMax,
        cards: cards.length,
        cardsTotal: totalRows,
        volume: totalVolume > 0 ? formatVolume(totalVolume) : "— no data",
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
        comingSoon: cards.length === 0,
      });
    }
  }

  sets.sort((a, b) => {
    const pv = (b.price as number) - (a.price as number);
    if (pv !== 0) return pv;
    return String(a.code).localeCompare(String(b.code));
  });

  return { sets, extraSets };
}
