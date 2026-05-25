// Audit rarity totals:
// - global card counts and market sums by canonical rarity
// - per-set rarity count matrix, ordered from Manga down
// - raw DB rarity values that do not match the app's canonical buckets

import fs from "node:fs";
import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const REPORT_PATH = "rarity-integrity-report.md";

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const GAME_SLUG = scriptGameSlug();

const RARITY_ORDER = [
  "MR",
  "GMR",
  "SAR",
  "SP",
  "AA",
  "TR",
  "SEC",
  "SR",
  "L",
  "R",
  "UC",
  "C",
  "DON",
  "PROMO",
  "UNKNOWN",
];

const RARITY_LABELS = {
  MR: "Manga Rare",
  GMR: "Golden MR",
  SAR: "Super Alt Art",
  SP: "Special Rare",
  AA: "Alt Art",
  TR: "Treasure Rare",
  SEC: "Secret Rare",
  SR: "Super Rare",
  L: "Leader",
  R: "Rare",
  UC: "Uncommon",
  C: "Common",
  DON: "DON",
  PROMO: "Promo",
  UNKNOWN: "Unknown",
};

const CANONICAL_RAW = new Set([
  "MR",
  "GMR",
  "SAR",
  "SP",
  "AA",
  "TR",
  "SEC",
  "SR",
  "L",
  "R",
  "UC",
  "C",
  "PR",
  "DON",
]);

const ALLOWED_CODES = new Set([
  "OP01",
  "OP02",
  "OP03",
  "OP04",
  "OP05",
  "OP06",
  "OP07",
  "OP08",
  "OP09",
  "OP10",
  "OP11",
  "OP12",
  "OP13",
  "OP14",
  "OP15",
  "PRB01",
  "PRB02",
  "EB01",
  "EB02",
  "EB03",
  "EB04",
]);

async function fetchAll(path, pageSize = 1000) {
  const out = [];
  let from = 0;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { ...H, Range: `${from}-${from + pageSize - 1}` },
    });
    if (!r.ok) {
      console.error("HTTP", r.status, await r.text());
      process.exit(1);
    }
    const b = await r.json();
    if (!b.length) break;
    out.push(...b);
    if (b.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function rawRarity(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
}

function canonicalRarity(card, set) {
  const raw = rawRarity(card.rarity);
  if (!raw) return "UNKNOWN";
  if (set?.slug === "promo" || raw === "PR") return "PROMO";
  if (raw === "MANGA" || raw === "MANGA RARE") return "MR";
  if (raw === "GOLDEN MR" || raw === "GOLD MANGA RARE") return "GMR";
  if (raw === "SUPER ALT ART" || raw === "SPECIAL ALTERNATIVE" || raw === "SPECIAL ALTERNATE ART") return "SAR";
  if (raw === "SPECIAL RARE" || raw === "SPECIAL") return "SP";
  if (raw === "ALT ART" || raw === "ALTERNATE ART" || raw === "PARALLEL") return "AA";
  if (raw === "TREASURE RARE") return "TR";
  if (raw === "SECRET RARE") return "SEC";
  if (raw === "SUPER RARE") return "SR";
  if (raw === "LEADER") return "L";
  if (raw === "RARE") return "R";
  if (raw === "UNCOMMON") return "UC";
  if (raw === "COMMON") return "C";
  if (raw === "DON!!") return "DON";
  return RARITY_ORDER.includes(raw) ? raw : "UNKNOWN";
}

function emptyCounts() {
  return Object.fromEntries(RARITY_ORDER.map((code) => [code, 0]));
}

function emptyAgg() {
  return {
    cards: 0,
    priced: 0,
    sumTcgMarket: 0,
    sumMarketAvg: 0,
    allowedCards: 0,
    allowedPriced: 0,
    allowedTcgMarket: 0,
    allowedMarketAvg: 0,
  };
}

function priceStats(card) {
  const ps = Array.isArray(card.price_stats) ? card.price_stats[0] : card.price_stats;
  return ps ?? null;
}

function fmtMoney(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdTable(headers, rows) {
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function codeRank(code) {
  const c = (code ?? "").toUpperCase();
  const m = c.match(/^([A-Z]+)(\d+)$/);
  if (!m) return c === "P" ? [4, 0, c] : [5, 0, c];
  const groupRank = { OP: 0, EB: 1, PRB: 2, ST: 3 }[m[1]] ?? 5;
  return [groupRank, Number(m[2]), c];
}

function compareSetCodes(a, b) {
  const ar = codeRank(a.code);
  const br = codeRank(b.code);
  for (let i = 0; i < ar.length; i++) {
    if (ar[i] < br[i]) return -1;
    if (ar[i] > br[i]) return 1;
  }
  return 0;
}

const GAME = await loadGameScope({ supabaseUrl: URL, supabaseKey: KEY, gameSlug: GAME_SLUG });
console.log(`Using game scope: ${GAME.slug}`);

const sets = await fetchAll(withGameFilter("sets?select=id,code,slug,name", GAME.id));
const cards = await fetchAll(
  withGameFilter("cards?select=id,set_id,card_image_id,card_number,name,variant_label,rarity,price_stats(tcg_market,market_avg)", GAME.id)
);

const setById = new Map(sets.map((s) => [s.id, s]));
const allowedSetIds = new Set(
  sets.filter((s) => ALLOWED_CODES.has((s.code ?? "").toUpperCase())).map((s) => s.id)
);

const globalCounts = emptyCounts();
const perSetCounts = new Map(sets.map((s) => [s.id, emptyCounts()]));
const rawCounts = new Map();
const nonstandard = [];
const agg = Object.fromEntries(RARITY_ORDER.map((code) => [code, emptyAgg()]));

for (const card of cards) {
  const set = setById.get(card.set_id);
  const raw = rawRarity(card.rarity) || "(blank)";
  const code = canonicalRarity(card, set);
  const inAllowed = allowedSetIds.has(card.set_id);
  const ps = priceStats(card);

  rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + 1);
  globalCounts[code]++;
  const setCounts = perSetCounts.get(card.set_id);
  if (setCounts) setCounts[code]++;

  agg[code].cards++;
  if (inAllowed) agg[code].allowedCards++;

  if (ps?.tcg_market != null) {
    agg[code].priced++;
    agg[code].sumTcgMarket += Number(ps.tcg_market) || 0;
    agg[code].sumMarketAvg += Number(ps.market_avg) || 0;
    if (inAllowed) {
      agg[code].allowedPriced++;
      agg[code].allowedTcgMarket += Number(ps.tcg_market) || 0;
      agg[code].allowedMarketAvg += Number(ps.market_avg) || 0;
    }
  }

  if (!CANONICAL_RAW.has(raw) && raw !== "(blank)") {
    nonstandard.push({
      set: set?.code ?? card.set_id,
      card_number: card.card_number,
      name: card.name,
      card_image_id: card.card_image_id,
      raw,
      canonical: code,
    });
  }
}

const totalFromGlobal = RARITY_ORDER.reduce((sum, code) => sum + globalCounts[code], 0);
const sortedSets = [...sets].sort(compareSetCodes);
const generated = new Date().toISOString();

const report = [];
report.push("# Rarity Integrity Report");
report.push("");
report.push(`Generated: ${generated}`);
report.push(`Game: ${GAME.name ?? GAME.slug} (${GAME.slug})`);
report.push("");
report.push("## Summary");
report.push("");
report.push(
  mdTable(
    ["Metric", "Value"],
    [
      ["DB sets", sets.length],
      ["DB cards", cards.length],
      ["Sum of canonical rarity buckets", totalFromGlobal],
      ["Sets-index whitelist sets", allowedSetIds.size],
      ["Nonstandard raw rarity rows", nonstandard.length],
    ]
  )
);
report.push("");
report.push("## Canonical Rarity Counts");
report.push("");
report.push(
  mdTable(
    ["Rarity", "Label", "Cards", "Priced", "sum_tcg_market", "sum_market_avg", "Whitelist Cards", "Whitelist Priced", "Whitelist sum_tcg_market", "Whitelist sum_market_avg"],
    RARITY_ORDER.map((code) => [
      code,
      RARITY_LABELS[code] ?? code,
      globalCounts[code],
      agg[code].priced,
      fmtMoney(agg[code].sumTcgMarket),
      fmtMoney(agg[code].sumMarketAvg),
      agg[code].allowedCards,
      agg[code].allowedPriced,
      fmtMoney(agg[code].allowedTcgMarket),
      fmtMoney(agg[code].allowedMarketAvg),
    ])
  )
);
report.push("");
report.push("## Per-Set Rarity Counts");
report.push("");
report.push(
  mdTable(
    ["Set", "Name", ...RARITY_ORDER, "Total"],
    sortedSets.map((set) => {
      const counts = perSetCounts.get(set.id) ?? emptyCounts();
      const total = RARITY_ORDER.reduce((sum, code) => sum + counts[code], 0);
      return [set.code, set.name ?? "", ...RARITY_ORDER.map((code) => counts[code]), total];
    })
  )
);
report.push("");
report.push("## Raw DB Rarity Values");
report.push("");
report.push(
  mdTable(
    ["Raw DB rarity", "Rows"],
    [...rawCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  )
);
report.push("");
report.push("## Nonstandard Raw Rarity Rows");
report.push("");
if (nonstandard.length === 0) {
  report.push("No nonstandard raw rarity rows found.");
} else {
  report.push(
    mdTable(
      ["Set", "Card #", "Name", "card_image_id", "Raw DB rarity", "Canonical bucket"],
      nonstandard.map((row) => [
        row.set,
        row.card_number ?? "",
        row.name ?? "",
        row.card_image_id ?? "",
        row.raw,
        row.canonical,
      ])
    )
  );
}

fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

const pad = (s, n) => String(s).padEnd(n);
console.log(`sets total=${sets.length}  cards total=${cards.length}  report=${REPORT_PATH}`);
console.log("");
console.log(pad("code", 8), pad("label", 18), pad("cards", 8), pad("priced", 8), pad("sum_tcg", 12), pad("sum_avg", 12));
for (const code of RARITY_ORDER) {
  console.log(
    pad(code, 8),
    pad(RARITY_LABELS[code] ?? code, 18),
    pad(globalCounts[code], 8),
    pad(agg[code].priced, 8),
    pad(fmtMoney(agg[code].sumTcgMarket), 12),
    pad(fmtMoney(agg[code].sumMarketAvg), 12)
  );
}
console.log("");
console.log(`nonstandard raw rarity rows=${nonstandard.length}`);
