// Plan and optionally apply price_history cleanup.
//
// Default mode is a dry run. Use --apply to delete planned rows.
// By default, only duplicate card/day rows are deleted. Add:
//   --fix-severe-latest     delete stale latest rows that severely disagree with price_stats
//   --fix-isolated-outliers delete interior rows that spike away from both neighbors

import fs from "node:fs";

const REPORT_PATH = "price-history-cleanup-plan.md";
const APPLY = process.argv.includes("--apply");
const FIX_SEVERE_LATEST = process.argv.includes("--fix-severe-latest");
const FIX_ISOLATED_OUTLIERS = process.argv.includes("--fix-isolated-outliers");
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_HISTORY_MS = 2 * 60 * 60 * 1000;
const SEVERE_REL_DELTA = Number(readArg("--severe-rel") ?? 0.5);
const SEVERE_ABS_DELTA = Number(readArg("--severe-abs") ?? 5);
const OUTLIER_RATIO = Number(readArg("--outlier-ratio") ?? 20);
const OUTLIER_ABS = Number(readArg("--outlier-abs") ?? 25);

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

async function deleteHistoryRows(ids) {
  const chunkSize = 75;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/price_history?id=in.(${chunk.join(",")})`, {
      method: "DELETE",
      headers: restHeaders({ Prefer: "return=minimal" }),
    });
    if (!res.ok) {
      throw new Error(`Supabase delete failed: ${res.status} ${await res.text()}`);
    }
  }
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function priceStatsFor(card) {
  const stats = card.price_stats;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats ?? null;
}

function rowPrice(row) {
  return numeric(row.tcg_market) ?? numeric(row.market_avg);
}

function currentPrice(card) {
  const stats = priceStatsFor(card);
  return numeric(stats?.tcg_market) ?? numeric(stats?.market_avg);
}

function utcDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historyDayKey(row) {
  const day = utcDay(row.recorded_at);
  return day ? `${row.card_id}|${day}` : null;
}

function priceDistance(a, b) {
  const left = numeric(a);
  const right = numeric(b);
  if (left === null || right === null || left <= 0 || right <= 0) return Number.POSITIVE_INFINITY;
  const ratio = Math.max(left, right) / Math.min(left, right);
  return Math.log(ratio) * 100 + Math.abs(left - right);
}

function severeMismatch(price, reference) {
  const p = numeric(price);
  const r = numeric(reference);
  if (p === null || r === null || p <= 0 || r <= 0) return false;
  const abs = Math.abs(p - r);
  const rel = abs / Math.max(p, r, 1);
  return abs >= SEVERE_ABS_DELTA && rel >= SEVERE_REL_DELTA;
}

function isLargeMove(a, b, ratioThreshold = OUTLIER_RATIO, absThreshold = OUTLIER_ABS) {
  const left = numeric(a);
  const right = numeric(b);
  if (left === null || right === null || left <= 0 || right <= 0) return false;
  const ratio = Math.max(left, right) / Math.min(left, right);
  return ratio >= ratioThreshold && Math.abs(left - right) >= absThreshold;
}

function chooseDuplicateKeeper(rows, card) {
  const reference = currentPrice(card);
  return rows
    .slice()
    .sort((a, b) => {
      if (reference !== null) {
        const distance = priceDistance(rowPrice(a), reference) - priceDistance(rowPrice(b), reference);
        if (distance !== 0) return distance;
      }
      return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
    })[0];
}

function addReason(map, id, reason) {
  const reasons = map.get(id) ?? new Set();
  reasons.add(reason);
  map.set(id, reasons);
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

function money(value) {
  const n = numeric(value);
  return n === null ? "" : `$${n.toFixed(2)}`;
}

function pct(numerator, denominator) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function sample(rows, count = 75) {
  return rows.slice(0, count);
}

function cardLabel(card, setById) {
  if (!card) return ["", "", "", ""];
  return [
    setById.get(card.set_id)?.code ?? "",
    card.card_number ?? "",
    card.name ?? "",
    card.variant_label ?? "",
  ];
}

async function main() {
  console.log("Loading Supabase cards and price_history...");
  const [sets, cards, historyRows] = await Promise.all([
    sbFetchAll("sets?select=id,code,slug,name"),
    sbFetchAll("cards?select=id,set_id,card_number,name,variant_label,price_stats(tcg_market,market_avg,updated_at)"),
    sbFetchAll("price_history?select=id,card_id,tcg_market,market_avg,recorded_at&order=recorded_at.asc,id.asc"),
  ]);

  const setById = new Map(sets.map((set) => [set.id, set]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const deleteReasons = new Map();

  const duplicateGroups = new Map();
  const byCard = new Map();
  for (const row of historyRows) {
    const cardRows = byCard.get(row.card_id) ?? [];
    cardRows.push(row);
    byCard.set(row.card_id, cardRows);

    const key = historyDayKey(row);
    if (!key) continue;
    const group = duplicateGroups.get(key) ?? [];
    group.push(row);
    duplicateGroups.set(key, group);
  }

  let duplicateGroupsCount = 0;
  let conflictingDuplicateGroupsCount = 0;
  for (const group of duplicateGroups.values()) {
    if (group.length <= 1) continue;
    duplicateGroupsCount++;
    const prices = new Set(group.map((row) => `${numeric(row.tcg_market) ?? ""}|${numeric(row.market_avg) ?? ""}`));
    if (prices.size > 1) conflictingDuplicateGroupsCount++;
    const keep = chooseDuplicateKeeper(group, cardById.get(group[0].card_id));
    for (const row of group) {
      if (row.id !== keep.id) addReason(deleteReasons, row.id, "duplicate_card_day");
    }
  }

  let severeLatestCount = 0;
  if (FIX_SEVERE_LATEST) {
    for (const [cardId, rows] of byCard.entries()) {
      const card = cardById.get(cardId);
      const reference = currentPrice(card);
      const statsAt = priceStatsFor(card)?.updated_at ? new Date(priceStatsFor(card).updated_at).getTime() : null;
      if (reference === null || !statsAt) continue;

      const remaining = rows
        .filter((row) => !deleteReasons.has(row.id))
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

      while (remaining.length > 1) {
        const latest = remaining[remaining.length - 1];
        const latestAt = new Date(latest.recorded_at).getTime();
        if (!Number.isFinite(latestAt) || statsAt - latestAt < STALE_HISTORY_MS) break;
        if (!severeMismatch(rowPrice(latest), reference)) break;
        addReason(deleteReasons, latest.id, "stale_severe_latest_mismatch");
        severeLatestCount++;
        remaining.pop();
      }
    }
  }

  let isolatedOutlierCount = 0;
  if (FIX_ISOLATED_OUTLIERS) {
    for (const [cardId, rows] of byCard.entries()) {
      const card = cardById.get(cardId);
      const reference = currentPrice(card);
      const remaining = rows
        .filter((row) => !deleteReasons.has(row.id))
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

      for (let i = 1; i < remaining.length - 1; i++) {
        const prev = rowPrice(remaining[i - 1]);
        const current = rowPrice(remaining[i]);
        const next = rowPrice(remaining[i + 1]);
        const farFromBothNeighbors = isLargeMove(current, prev) && isLargeMove(current, next);
        const neighborsAgree = !isLargeMove(prev, next, 3, 10);
        const farFromCurrentStats = reference !== null && isLargeMove(current, reference);
        if (farFromBothNeighbors && (neighborsAgree || farFromCurrentStats)) {
          addReason(deleteReasons, remaining[i].id, "isolated_price_outlier");
          isolatedOutlierCount++;
        }
      }
    }
  }

  const idsToDelete = Array.from(deleteReasons.keys());
  const rowsToDelete = historyRows.filter((row) => deleteReasons.has(row.id));
  const reasonCounts = {};
  for (const reasons of deleteReasons.values()) {
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  const report = [];
  report.push("# Price History Cleanup Plan");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  report.push(`Fix severe latest: ${FIX_SEVERE_LATEST}`);
  report.push(`Fix isolated outliers: ${FIX_ISOLATED_OUTLIERS}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["Cards read", cards.length],
      ["History rows read", historyRows.length],
      ["Duplicate card/day groups", duplicateGroupsCount],
      ["Conflicting duplicate card/day groups", conflictingDuplicateGroupsCount],
      ["Rows planned for duplicate cleanup", reasonCounts.duplicate_card_day ?? 0],
      ["Rows planned for severe latest cleanup", reasonCounts.stale_severe_latest_mismatch ?? 0],
      ["Rows planned for isolated outlier cleanup", reasonCounts.isolated_price_outlier ?? 0],
      ["Unique rows planned for deletion", idsToDelete.length],
      ["Rows expected to remain", historyRows.length - idsToDelete.length],
      ["Percent of history removed", pct(idsToDelete.length, historyRows.length)],
    ]
  ));
  report.push("");
  report.push("## Planned Deletion Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "Name", "Variant", "Recorded At", "Price", "Reasons"],
    sample(rowsToDelete).map((row) => [
      ...cardLabel(cardById.get(row.card_id), setById),
      row.recorded_at,
      money(rowPrice(row)),
      Array.from(deleteReasons.get(row.id) ?? []).join(", "),
    ])
  ));
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`History rows read: ${historyRows.length}`);
  console.log(`Rows planned for deletion: ${idsToDelete.length}`);
  console.log(`Duplicate cleanup rows: ${reasonCounts.duplicate_card_day ?? 0}`);
  console.log(`Severe latest cleanup rows: ${reasonCounts.stale_severe_latest_mismatch ?? 0}`);
  console.log(`Isolated outlier cleanup rows: ${reasonCounts.isolated_price_outlier ?? 0}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to delete the planned rows.");
    return;
  }

  if (idsToDelete.length > 0) {
    console.log("Deleting planned price_history rows...");
    await deleteHistoryRows(idsToDelete);
  }
  console.log("Cleanup apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
