// Audit current price_stats freshness and price_history chart coverage.
//
// This script is read-only against Supabase. It writes a local markdown report
// so price sync and chart gaps can be reviewed before changing any sync jobs.

import fs from "node:fs";
import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const REPORT_PATH = "price-history-audit-report.md";
const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_HOURS = Number(readArg("--fresh-hours") ?? 36);
const RECENT_DAYS = Number(readArg("--days") ?? 30);
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const SEVERE_ABS_DELTA = 5;
const SEVERE_REL_DELTA = 0.5;
const SAME_DAY_SPREAD_ABS = 5;
const SAME_DAY_SPREAD_RATIO = 5;
const LARGE_MOVE_ABS = 5;
const LARGE_MOVE_RATIO = 5;
const FOCUS_RARITIES = ["SR", "L", "R", "SEC", "TR", "UC", "C"];

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GAME_SLUG = scriptGameSlug();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function restHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function sbFetchAll(path, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: restHeaders({ Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!res.ok) {
      throw new Error(`Supabase ${path} failed: ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function sbTryFetchAll(path, pageSize = 1000) {
  try {
    return { rows: await sbFetchAll(path, pageSize), error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function priceStatsFor(card) {
  const stats = card.price_stats;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats ?? null;
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const n = numeric(value);
  return n === null ? "" : `$${n.toFixed(2)}`;
}

function ratio(value) {
  const n = numeric(value);
  return n === null ? "" : `${n.toFixed(1)}x`;
}

function pct(numerator, denominator) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function utcDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function ageHours(value, nowMs = Date.now()) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return (nowMs - ms) / (60 * 60 * 1000);
}

function dayDiff(a, b) {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((bMs - aMs) / DAY_MS);
}

function mdTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return out.join("\n");
}

function sample(rows, count = 25) {
  return rows.slice(0, count);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return "";
}

function priceValue(row) {
  return numeric(row?.tcg_market) ?? numeric(row?.market_avg);
}

function currentPriceValue(stats) {
  return numeric(stats?.tcg_market) ?? numeric(stats?.market_avg);
}

function pricePairKey(row) {
  const market = numeric(row?.tcg_market);
  const avg = numeric(row?.market_avg);
  return `${market === null ? "" : market.toFixed(4)}|${avg === null ? "" : avg.toFixed(4)}`;
}

function cardLabel(card, setById) {
  if (!card) return ["", "", "", ""];
  const setCode = setById.get(card.set_id)?.code ?? "";
  return [setCode, card.card_number ?? "", card.name ?? "", card.variant_label ?? ""];
}

function dayInfoRows(byDay, currentPricedCount, days) {
  return days.map((day) => {
    const info = byDay.get(day);
    return [
      day,
      info?.rows ?? 0,
      info?.cards.size ?? 0,
      pct(info?.cards.size ?? 0, currentPricedCount),
    ];
  });
}

function groupHistory(historyRows) {
  const byCard = new Map();
  const byDay = new Map();
  const duplicateGroups = new Map();

  for (const row of historyRows) {
    const list = byCard.get(row.card_id) ?? [];
    list.push(row);
    byCard.set(row.card_id, list);

    const day = utcDay(row.recorded_at);
    if (!day) continue;
    const dayInfo = byDay.get(day) ?? { rows: 0, cards: new Set() };
    dayInfo.rows++;
    dayInfo.cards.add(row.card_id);
    byDay.set(day, dayInfo);

    const duplicateKey = `${row.card_id}|${day}`;
    const duplicateInfo = duplicateGroups.get(duplicateKey) ?? { card_id: row.card_id, day, rows: [] };
    duplicateInfo.rows.push(row);
    duplicateGroups.set(duplicateKey, duplicateInfo);
  }

  for (const rows of byCard.values()) {
    rows.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  }

  return {
    byCard,
    byDay,
    duplicates: Array.from(duplicateGroups.values()).filter((group) => group.rows.length > 1),
  };
}

function analyzeCardHistory(card, rows) {
  if (!rows?.length) {
    return {
      rows: 0,
      uniqueDays: 0,
      latest: null,
      latestDay: null,
      maxGapDays: null,
      recentUniqueDays: 0,
    };
  }

  const days = Array.from(new Set(rows.map((row) => utcDay(row.recorded_at)).filter(Boolean))).sort();
  let maxGapDays = 0;
  for (let i = 1; i < days.length; i++) {
    maxGapDays = Math.max(maxGapDays, dayDiff(days[i - 1], days[i]));
  }

  const now = Date.now();
  const recentCutoff = now - RECENT_DAYS * DAY_MS;
  const recentUniqueDays = new Set(
    rows
      .filter((row) => new Date(row.recorded_at).getTime() >= recentCutoff)
      .map((row) => utcDay(row.recorded_at))
      .filter(Boolean)
  ).size;

  const latest = rows[rows.length - 1];
  return {
    rows: rows.length,
    uniqueDays: days.length,
    latest,
    latestDay: utcDay(latest.recorded_at),
    maxGapDays,
    recentUniqueDays,
  };
}

function analyzeDuplicateGroups(duplicates) {
  const groups = duplicates.map((group) => {
    const prices = group.rows
      .map((row) => priceValue(row))
      .filter((value) => value !== null && value > 0);
    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;
    const spreadRatio = min && max ? max / min : null;
    const spreadAbs = min !== null && max !== null ? max - min : null;
    return {
      ...group,
      uniquePricePairs: new Set(group.rows.map(pricePairKey)).size,
      min,
      max,
      spreadRatio,
      spreadAbs,
    };
  });

  return {
    groups,
    exact: groups.filter((group) => group.uniquePricePairs <= 1),
    conflicting: groups.filter((group) => group.uniquePricePairs > 1),
    severeSpread: groups
      .filter((group) => {
        return (
          numeric(group.spreadRatio) !== null &&
          numeric(group.spreadAbs) !== null &&
          group.spreadRatio >= SAME_DAY_SPREAD_RATIO &&
          group.spreadAbs >= SAME_DAY_SPREAD_ABS
        );
      })
      .sort((a, b) => (b.spreadRatio ?? 0) - (a.spreadRatio ?? 0)),
  };
}

function latestDailyRows(rows) {
  const byDay = new Map();
  for (const row of rows ?? []) {
    const day = utcDay(row.recorded_at);
    if (!day) continue;
    const existing = byDay.get(day);
    if (!existing || new Date(row.recorded_at).getTime() >= new Date(existing.recorded_at).getTime()) {
      byDay.set(day, row);
    }
  }
  return Array.from(byDay.values()).sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
}

function analyzeLargeMoves(perCard, byCard) {
  const moves = [];
  for (const row of perCard) {
    const dailyRows = latestDailyRows(byCard.get(row.card.id));
    for (let i = 1; i < dailyRows.length; i++) {
      const prev = priceValue(dailyRows[i - 1]);
      const next = priceValue(dailyRows[i]);
      if (prev === null || next === null || prev <= 0 || next <= 0) continue;
      const high = Math.max(prev, next);
      const low = Math.min(prev, next);
      const moveRatio = high / low;
      const moveAbs = Math.abs(next - prev);
      if (moveRatio >= LARGE_MOVE_RATIO && moveAbs >= LARGE_MOVE_ABS) {
        moves.push({
          ...row,
          fromAt: dailyRows[i - 1].recorded_at,
          toAt: dailyRows[i].recorded_at,
          fromPrice: prev,
          toPrice: next,
          moveRatio,
          moveAbs,
        });
      }
    }
  }
  return moves.sort((a, b) => b.moveRatio - a.moveRatio);
}

async function main() {
  const now = new Date();
  const nowMs = now.getTime();
  const freshMs = FRESH_HOURS * 60 * 60 * 1000;

  const game = await loadGameScope({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, gameSlug: GAME_SLUG });
  console.log(`Loading Supabase sets, cards, and price history for game scope: ${game.slug}...`);
  const [sets, cards, historyRows, syncState] = await Promise.all([
    sbFetchAll(withGameFilter("sets?select=id,code,slug,name", game.id)),
    sbFetchAll(
      withGameFilter("cards?select=id,set_id,card_image_id,card_number,name,name_base,variant_label,rarity,tcg_product_id,price_stats!price_stats_card_game_fk(tcg_market,market_avg,tcg_low,tcg_mid,tcg_high,chg_1d,chg_7d,chg_30d,updated_at)", game.id)
    ),
    sbFetchAll(withGameFilter("price_history?select=id,card_id,tcg_market,market_avg,recorded_at&order=recorded_at.asc,id.asc", game.id)),
    sbTryFetchAll("sync_state?select=key,state,locked_at,updated_at,created_at&order=updated_at.desc"),
  ]);

  const setById = new Map(sets.map((set) => [set.id, set]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const promoSetId = sets.find((set) => set.slug === "promo")?.id ?? null;
  const currentPriced = cards.filter((card) => {
    const stats = priceStatsFor(card);
    return numeric(stats?.tcg_market) !== null || numeric(stats?.market_avg) !== null;
  });
  const currentPricedIds = new Set(currentPriced.map((card) => card.id));

  const currentStatsFresh = currentPriced.filter((card) => {
    const stats = priceStatsFor(card);
    const updatedAt = stats?.updated_at;
    return updatedAt && nowMs - new Date(updatedAt).getTime() <= freshMs;
  });

  const { byCard, byDay, duplicates } = groupHistory(historyRows);
  const duplicateStats = analyzeDuplicateGroups(duplicates);

  const historyCardIds = new Set(historyRows.map((row) => row.card_id));
  const pricedWithHistory = currentPriced.filter((card) => historyCardIds.has(card.id));
  const pricedWithoutHistory = currentPriced.filter((card) => !historyCardIds.has(card.id));

  const perCard = currentPriced.map((card) => ({
    card,
    stats: priceStatsFor(card),
    history: analyzeCardHistory(card, byCard.get(card.id)),
  }));

  const pricedWithAtLeastTwoPoints = perCard.filter((row) => row.history.uniqueDays >= 2);
  const freshHistory = perCard.filter((row) => {
    const latestAt = row.history.latest?.recorded_at;
    return latestAt && nowMs - new Date(latestAt).getTime() <= freshMs;
  });
  const staleOrMissingHistory = perCard.filter((row) => {
    const latestAt = row.history.latest?.recorded_at;
    return !latestAt || nowMs - new Date(latestAt).getTime() > freshMs;
  });

  const statsNewerThanHistory = perCard.filter((row) => {
    const statsAt = row.stats?.updated_at ? new Date(row.stats.updated_at).getTime() : null;
    const histAt = row.history.latest?.recorded_at ? new Date(row.history.latest.recorded_at).getTime() : null;
    return statsAt && (!histAt || statsAt - histAt > 2 * 60 * 60 * 1000);
  });

  const latestMismatch = perCard
    .filter((row) => row.history.latest)
    .map((row) => {
      const statsMarket = numeric(row.stats?.tcg_market);
      const statsAvg = numeric(row.stats?.market_avg);
      const historyMarket = numeric(row.history.latest?.tcg_market);
      const historyAvg = numeric(row.history.latest?.market_avg);
      const marketDelta = statsMarket !== null && historyMarket !== null ? Math.abs(statsMarket - historyMarket) : 0;
      const avgDelta = statsAvg !== null && historyAvg !== null ? Math.abs(statsAvg - historyAvg) : 0;
      const base = Math.max(statsMarket ?? 0, historyMarket ?? 0, statsAvg ?? 0, historyAvg ?? 0, 1);
      return { ...row, marketDelta, avgDelta, relDelta: Math.max(marketDelta, avgDelta) / base };
    })
    .filter((row) => Math.max(row.marketDelta, row.avgDelta) > 0.01 && row.relDelta > 0.01)
    .sort((a, b) => b.relDelta - a.relDelta);
  const severeLatestMismatch = latestMismatch.filter((row) => {
    return Math.max(row.marketDelta, row.avgDelta) >= SEVERE_ABS_DELTA && row.relDelta >= SEVERE_REL_DELTA;
  });

  const currentStatsSpread = perCard
    .map((row) => {
      const market = numeric(row.stats?.tcg_market);
      const avg = numeric(row.stats?.market_avg);
      const min = market !== null && avg !== null ? Math.min(market, avg) : null;
      const max = market !== null && avg !== null ? Math.max(market, avg) : null;
      return {
        ...row,
        spreadRatio: min && max ? max / min : null,
        spreadAbs: min !== null && max !== null ? max - min : null,
      };
    })
    .filter((row) => {
      return (
        numeric(row.spreadRatio) !== null &&
        numeric(row.spreadAbs) !== null &&
        row.spreadRatio >= 3 &&
        row.spreadAbs >= 10
      );
    })
    .sort((a, b) => (b.spreadRatio ?? 0) - (a.spreadRatio ?? 0));

  const currentPriceCoverage = FOCUS_RARITIES.map((rarity) => {
    const rarityCards = cards.filter((card) => {
      return String(card.rarity ?? "").toUpperCase() === rarity && card.set_id !== promoSetId;
    });
    let priced = 0;
    let unpriced = 0;
    let zero = 0;
    let lt1 = 0;
    let lt5 = 0;
    for (const card of rarityCards) {
      const price = currentPriceValue(priceStatsFor(card));
      if (price === null) {
        unpriced++;
      } else if (price === 0) {
        zero++;
      } else {
        priced++;
        if (price < 1) lt1++;
        else if (price < 5) lt5++;
      }
    }
    return { rarity, total: rarityCards.length, priced, unpriced, zero, lt1, lt5 };
  });

  const invalidHistoryRows = historyRows.filter((row) => {
    const market = numeric(row.tcg_market);
    const avg = numeric(row.market_avg);
    const hasValidTimestamp = Boolean(utcDay(row.recorded_at));
    return !hasValidTimestamp || (market === null && avg === null) || (market !== null && market <= 0) || (avg !== null && avg <= 0);
  });

  const futureHistoryRows = historyRows.filter((row) => {
    const recordedMs = new Date(row.recorded_at).getTime();
    return Number.isFinite(recordedMs) && recordedMs > nowMs + FUTURE_SKEW_MS;
  });

  const largeMoves = analyzeLargeMoves(perCard, byCard);

  const gapCards = perCard
    .filter((row) => (row.history.maxGapDays ?? 0) > 2)
    .sort((a, b) => (b.history.maxGapDays ?? 0) - (a.history.maxGapDays ?? 0));

  const recentCutoffDay = utcDay(new Date(nowMs - (RECENT_DAYS - 1) * DAY_MS).toISOString());
  const recentDays = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const day = utcDay(new Date(nowMs - i * DAY_MS).toISOString());
    if (!day || day < recentCutoffDay) continue;
    recentDays.push(day);
  }
  const dayRows = dayInfoRows(byDay, currentPriced.length, recentDays);

  const historyDates = historyRows.map((row) => row.recorded_at).filter(Boolean).sort();
  const firstHistoryAt = historyDates[0] ?? null;
  const latestHistoryAt = historyDates[historyDates.length - 1] ?? null;
  const firstHistoryDay = utcDay(firstHistoryAt);
  const latestHistoryDay = utcDay(latestHistoryAt);
  const allHistoryDays = Array.from(byDay.keys()).sort();
  const fullDayRows = dayInfoRows(byDay, currentPriced.length, allHistoryDays);
  const historyDaySpan = firstHistoryDay && latestHistoryDay ? dayDiff(firstHistoryDay, latestHistoryDay) + 1 : 0;
  const daysWithHistory = allHistoryDays.length;
  const rowsOlderThanRecentWindow = historyRows.filter((row) => {
    const recordedMs = new Date(row.recorded_at).getTime();
    return Number.isFinite(recordedMs) && recordedMs < nowMs - RECENT_DAYS * DAY_MS;
  });

  const statsDates = currentPriced
    .map((card) => priceStatsFor(card)?.updated_at)
    .filter(Boolean)
    .sort();
  const oldestStatsAt = statsDates[0] ?? null;
  const latestStatsAt = statsDates[statsDates.length - 1] ?? null;
  const oldestStatsMs = oldestStatsAt ? new Date(oldestStatsAt).getTime() : null;
  const rowsBeforeOldestStats = oldestStatsMs
    ? historyRows.filter((row) => {
        const recordedMs = new Date(row.recorded_at).getTime();
        return Number.isFinite(recordedMs) && recordedMs < oldestStatsMs;
      })
    : [];

  const bySetRows = Array.from(
    currentPriced.reduce((map, card) => {
      const set = setById.get(card.set_id);
      const code = set?.code ?? "";
      const row = map.get(code) ?? {
        code,
        currentPriced: 0,
        withHistory: 0,
        freshHistory: 0,
        twoPointHistory: 0,
      };
      const h = analyzeCardHistory(card, byCard.get(card.id));
      row.currentPriced++;
      if (h.rows > 0) row.withHistory++;
      if (h.latest?.recorded_at && nowMs - new Date(h.latest.recorded_at).getTime() <= freshMs) row.freshHistory++;
      if (h.uniqueDays >= 2) row.twoPointHistory++;
      map.set(code, row);
      return map;
    }, new Map()).values()
  ).sort((a, b) => a.code.localeCompare(b.code));

  const duplicateSamples = duplicates
    .map((group) => ({
      ...group,
      card: cardById.get(group.card_id),
    }))
    .filter((group) => group.card)
    .sort((a, b) => b.rows.length - a.rows.length);

  const report = [];
  report.push("# Price History Audit Report");
  report.push("");
  report.push(`Generated: ${now.toISOString()}`);
  report.push(`Game: ${game.name ?? game.slug} (${game.slug})`);
  report.push(`Freshness threshold: ${FRESH_HOURS} hours`);
  report.push(`Recent coverage window: ${RECENT_DAYS} days`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["Cards read", cards.length],
      ["Cards with current price_stats", currentPriced.length],
      ["Current priced cards with fresh price_stats", `${currentStatsFresh.length} (${pct(currentStatsFresh.length, currentPriced.length)})`],
      ["price_history rows", historyRows.length],
      ["Cards represented in price_history", historyCardIds.size],
      ["Current priced cards with any history", `${pricedWithHistory.length} (${pct(pricedWithHistory.length, currentPriced.length)})`],
      ["Current priced cards with no history", `${pricedWithoutHistory.length} (${pct(pricedWithoutHistory.length, currentPriced.length)})`],
      ["Current priced cards with 2+ unique history days", `${pricedWithAtLeastTwoPoints.length} (${pct(pricedWithAtLeastTwoPoints.length, currentPriced.length)})`],
      ["Current priced cards with fresh history", `${freshHistory.length} (${pct(freshHistory.length, currentPriced.length)})`],
      ["Current priced cards with stale/missing history", `${staleOrMissingHistory.length} (${pct(staleOrMissingHistory.length, currentPriced.length)})`],
      ["Cards where price_stats is newer than latest history", statsNewerThanHistory.length],
      ["Cards where latest history differs from price_stats", latestMismatch.length],
      ["Severe latest-history mismatches", severeLatestMismatch.length],
      ["Duplicate card/day history groups", duplicates.length],
      ["Duplicate card/day groups with conflicting prices", duplicateStats.conflicting.length],
      ["Duplicate card/day groups with severe same-day spread", duplicateStats.severeSpread.length],
      ["History rows with invalid price/timestamp", invalidHistoryRows.length],
      ["Future-dated history rows", futureHistoryRows.length],
      ["Large adjacent-day price moves", largeMoves.length],
      ["First history timestamp", firstHistoryAt ?? ""],
      ["Latest history timestamp", latestHistoryAt ?? ""],
      ["Oldest price_stats updated_at", oldestStatsAt ?? ""],
      ["Latest price_stats updated_at", latestStatsAt ?? ""],
    ]
  ));
  report.push("");

  report.push("## Integrity Findings");
  report.push("");
  report.push(mdTable(
    ["Check", "Result"],
    [
      ["Duplicate card/day groups", `${duplicates.length} groups; ${duplicateStats.conflicting.length} have conflicting price pairs`],
      ["Severe same-day price spread", `${duplicateStats.severeSpread.length} groups at >=${SAME_DAY_SPREAD_RATIO}x and >=$${SAME_DAY_SPREAD_ABS}`],
      ["Latest history mismatches", `${latestMismatch.length} cards; ${severeLatestMismatch.length} severe at >=${Math.round(SEVERE_REL_DELTA * 100)}% and >=$${SEVERE_ABS_DELTA}`],
      ["Current tcg_market vs market_avg spread", `${currentStatsSpread.length} cards at >=3x and >=$10`],
      ["Large adjacent-day moves", `${largeMoves.length} moves at >=${LARGE_MOVE_RATIO}x and >=$${LARGE_MOVE_ABS}`],
      ["Invalid or non-positive history values", invalidHistoryRows.length],
      ["Future-dated history values", futureHistoryRows.length],
    ]
  ));
  report.push("");

  report.push("## Current Price Coverage");
  report.push("");
  report.push(mdTable(
    ["Rarity", "Total", "Priced", "Unpriced", "Zero", "<$1", "$1-$5"],
    currentPriceCoverage.map((row) => [
      row.rarity,
      row.total,
      `${row.priced} (${pct(row.priced, row.total)})`,
      row.unpriced,
      row.zero,
      row.lt1,
      row.lt5,
    ])
  ));
  report.push("");

  report.push("## Backdating Findings");
  report.push("");
  report.push(mdTable(
    ["Check", "Result"],
    [
      ["History date span", firstHistoryDay && latestHistoryDay ? `${firstHistoryDay} to ${latestHistoryDay} (${historyDaySpan} calendar days)` : ""],
      ["Days with any history", `${daysWithHistory} (${pct(daysWithHistory, historyDaySpan)})`],
      ["Rows older than recent window", `${rowsOlderThanRecentWindow.length} older than ${RECENT_DAYS} days`],
      ["Rows before oldest current price_stats timestamp", rowsBeforeOldestStats.length],
      ["Can audit insertion/backfill time directly", "No; price_history has recorded_at but no created_at/source column"],
    ]
  ));
  report.push("");

  report.push("## Sync State");
  report.push("");
  if (syncState.error) {
    report.push(`Could not read sync_state: ${syncState.error}`);
  } else if (syncState.rows.length === 0) {
    report.push("No sync_state rows found.");
  } else {
    report.push(mdTable(
      ["Key", "locked_at", "updated_at", "State"],
      syncState.rows.map((row) => [
        row.key ?? "",
        row.locked_at ?? "",
        row.updated_at ?? "",
        JSON.stringify(row.state ?? {}),
      ])
    ));
  }
  report.push("");

  report.push("## Daily History Coverage");
  report.push("");
  report.push(mdTable(["UTC day", "History rows", "Distinct cards", "% current priced cards"], dayRows));
  report.push("");

  report.push("## Full History Daily Coverage");
  report.push("");
  report.push(mdTable(["UTC day", "History rows", "Distinct cards", "% current priced cards"], fullDayRows));
  report.push("");

  report.push("## Set Coverage");
  report.push("");
  report.push(mdTable(
    ["Set", "Current priced", "Any history", "Fresh history", "2+ history days"],
    bySetRows.map((row) => [
      row.code,
      row.currentPriced,
      `${row.withHistory} (${pct(row.withHistory, row.currentPriced)})`,
      `${row.freshHistory} (${pct(row.freshHistory, row.currentPriced)})`,
      `${row.twoPointHistory} (${pct(row.twoPointHistory, row.currentPriced)})`,
    ])
  ));
  report.push("");

  report.push("## Severe Same-Day Price Spread Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "UTC day", "Rows that day", "Min", "Max", "Spread"],
    sample(duplicateStats.severeSpread, 50).map((group) => {
      const card = cardById.get(group.card_id);
      return [
        ...cardLabel(card, setById),
        group.day,
        group.rows.length,
        money(group.min),
        money(group.max),
        ratio(group.spreadRatio),
      ];
    })
  ));
  report.push("");

  report.push("## Severe Latest History Mismatch Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "stats tcg", "history tcg", "stats avg", "history avg", "latest history", "rel delta"],
    sample(severeLatestMismatch, 50).map((row) => [
      ...cardLabel(row.card, setById),
      money(row.stats?.tcg_market),
      money(row.history.latest?.tcg_market),
      money(row.stats?.market_avg),
      money(row.history.latest?.market_avg),
      row.history.latest?.recorded_at ?? "",
      pct(Math.max(row.marketDelta, row.avgDelta), Math.max(numeric(row.stats?.tcg_market) ?? 0, numeric(row.history.latest?.tcg_market) ?? 0, numeric(row.stats?.market_avg) ?? 0, numeric(row.history.latest?.market_avg) ?? 0, 1)),
    ])
  ));
  report.push("");

  report.push("## Large Adjacent-Day Move Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "From", "To", "From price", "To price", "Move"],
    sample(largeMoves, 50).map((row) => [
      ...cardLabel(row.card, setById),
      row.fromAt,
      row.toAt,
      money(row.fromPrice),
      money(row.toPrice),
      ratio(row.moveRatio),
    ])
  ));
  report.push("");

  report.push("## Current Price Spread Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "tcg_market", "market_avg", "Spread"],
    sample(currentStatsSpread, 50).map((row) => [
      ...cardLabel(row.card, setById),
      money(row.stats?.tcg_market),
      money(row.stats?.market_avg),
      ratio(row.spreadRatio),
    ])
  ));
  report.push("");

  report.push("## Stale Or Missing History Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "price_stats updated_at", "latest history", "tcg_market", "market_avg"],
    sample(staleOrMissingHistory, 50).map((row) => [
      ...cardLabel(row.card, setById),
      row.stats?.updated_at ?? "",
      row.history.latest?.recorded_at ?? "",
      money(row.stats?.tcg_market),
      money(row.stats?.market_avg),
    ])
  ));
  report.push("");

  report.push("## price_stats Newer Than History Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "price_stats updated_at", "latest history"],
    sample(statsNewerThanHistory, 50).map((row) => [
      ...cardLabel(row.card, setById),
      row.stats?.updated_at ?? "",
      row.history.latest?.recorded_at ?? "",
    ])
  ));
  report.push("");

  report.push("## Latest History Mismatch Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "stats tcg", "history tcg", "stats avg", "history avg", "latest history"],
    sample(latestMismatch, 50).map((row) => [
      ...cardLabel(row.card, setById),
      money(row.stats?.tcg_market),
      money(row.history.latest?.tcg_market),
      money(row.stats?.market_avg),
      money(row.history.latest?.market_avg),
      row.history.latest?.recorded_at ?? "",
    ])
  ));
  report.push("");

  report.push("## Gap Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "History rows", "Unique days", "Max gap days", "Latest history"],
    sample(gapCards, 50).map((row) => [
      ...cardLabel(row.card, setById),
      row.history.rows,
      row.history.uniqueDays,
      row.history.maxGapDays ?? "",
      row.history.latest?.recorded_at ?? "",
    ])
  ));
  report.push("");

  report.push("## Duplicate Same-Day Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "UTC day", "Rows that day", "Example prices"],
    sample(duplicateSamples, 50).map((group) => [
      ...cardLabel(group.card, setById),
      group.day,
      group.rows.length,
      group.rows
        .slice(0, 5)
        .map((row) => firstNonEmpty(money(row.tcg_market), money(row.market_avg)))
        .join(", "),
    ])
  ));
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Current priced cards: ${currentPriced.length}`);
  console.log(`Fresh price_stats: ${currentStatsFresh.length} (${pct(currentStatsFresh.length, currentPriced.length)})`);
  console.log(`History rows: ${historyRows.length}`);
  console.log(`Current priced cards with any history: ${pricedWithHistory.length} (${pct(pricedWithHistory.length, currentPriced.length)})`);
  console.log(`Current priced cards with fresh history: ${freshHistory.length} (${pct(freshHistory.length, currentPriced.length)})`);
  console.log(`Current priced cards with 2+ unique history days: ${pricedWithAtLeastTwoPoints.length} (${pct(pricedWithAtLeastTwoPoints.length, currentPriced.length)})`);
  console.log(`Duplicate card/day groups: ${duplicates.length}`);
  console.log(`Latest price_stats updated_at: ${latestStatsAt ?? "n/a"}`);
  console.log(`Latest price_history recorded_at: ${latestHistoryAt ?? "n/a"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
