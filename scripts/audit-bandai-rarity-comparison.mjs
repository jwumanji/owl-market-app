// Compare the current DB rarity buckets against Bandai's public card list.
//
// Source:
//   https://en.onepiece-cardgame.com/cardlist/?series=<id>
//
// Bandai's card list exposes the printed/base rarity in each card modal.
// The app DB intentionally derives collector buckets such as MR, AA, SP,
// SAR, and TR from variant labels, so differences from Bandai raw rarity are
// expected for chase/variant rows.

import fs from "node:fs";
import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const BANDai_BASE = "https://en.onepiece-cardgame.com";
const CARDLIST_URL = `${BANDai_BASE}/cardlist/`;
const REPORT_PATH = "bandai-rarity-comparison-report.md";

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

const BANDai_RAW_ORDER = ["L", "C", "UC", "R", "SR", "SEC", "SP CARD", "DON!!", "P", "OTHER"];
const DB_RARITY_ORDER = [
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

const REPORT_SET_CODES = new Set([
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
  "OP16",
  "EB01",
  "EB02",
  "EB03",
  "EB04",
  "PRB01",
  "PRB02",
  "P",
]);

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

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "owl-market-audit/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok && attempt < 3) {
    await sleep(1000 * (attempt + 1));
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`Bandai fetch failed ${res.status}: ${url}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSetCode(code) {
  const text = String(code ?? "").trim().toUpperCase();
  if (!text) return "";
  if (text === "PROMOTION CARD") return "P";
  return text.replace(/-/g, "");
}

function optionCodeFromLabel(label) {
  const decoded = decodeHtml(label);
  if (/^Promotion card$/i.test(decoded)) return "P";
  const matches = [...decoded.matchAll(/\[([A-Z]{1,4}-?\d{1,2}(?:-EB\d{2})?)\]/gi)];
  if (matches.length === 0) return null;
  return normalizeSetCode(matches[matches.length - 1][1]);
}

function displayCodeFromOfficialCode(code) {
  if (code === "P") return "P";
  const opEb = code.match(/^(OP\d{2})EB\d{2}$/);
  if (opEb) return opEb[1];
  return code;
}

function relatedDbCodes(officialCode) {
  if (officialCode === "P") return ["P"];
  const display = displayCodeFromOfficialCode(officialCode);
  if (officialCode.endsWith("EB04")) return [display, "EB04"];
  return [display];
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function inc(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function canonicalDbRarity(value, setCode) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "UNKNOWN";
  if (setCode === "P" || raw === "PR") return "PROMO";
  if (raw === "DON!!") return "DON";
  if (raw === "UNCOMMON") return "UC";
  return DB_RARITY_ORDER.includes(raw) ? raw : "UNKNOWN";
}

function bandaiRawRarity(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  return BANDai_RAW_ORDER.includes(raw) ? raw : "OTHER";
}

function parseOptions(html) {
  const options = [];
  const selectMatch = html.match(/<select[^>]+name="series"[\s\S]*?<\/select>/i);
  if (!selectMatch) return options;
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let match;
  while ((match = re.exec(selectMatch[0])) !== null) {
    const value = match[1].match(/\bvalue="([^"]+)"/i)?.[1] ?? "";
    const label = match[2];
    const code = optionCodeFromLabel(label);
    if (!value || !code) continue;
    options.push({
      seriesId: value,
      officialCode: code,
      displayCode: displayCodeFromOfficialCode(code),
      label: decodeHtml(label),
      url: `${CARDLIST_URL}?series=${value}`,
    });
  }
  return options;
}

function parseBandaiCards(html, option) {
  const cards = [];
  const re = /<dl\s+class="modalCol"\s+id="([^"]+)"[\s\S]*?<\/dl>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const id = decodeHtml(match[1]);
    const block = match[0];
    const info = block.match(
      /<div\s+class="infoCol">\s*<span>([\s\S]*?)<\/span>\s*\|\s*<span>([\s\S]*?)<\/span>\s*\|\s*<span>([\s\S]*?)<\/span>/i
    );
    if (!id || !info) continue;
    const name = decodeHtml(block.match(/<div\s+class="cardName">([\s\S]*?)<\/div>/i)?.[1] ?? "");
    cards.push({
      id,
      cardNumber: decodeHtml(info[1]),
      rarity: bandaiRawRarity(decodeHtml(info[2])),
      rawRarity: decodeHtml(info[2]),
      cardType: decodeHtml(info[3]),
      name,
      officialCode: option.officialCode,
      displayCode: option.displayCode,
      seriesId: option.seriesId,
    });
  }
  return cards;
}

function compareSetCodes(a, b) {
  const rank = (code) => {
    if (code === "P") return [4, 0, code];
    const m = code.match(/^([A-Z]+)(\d+)$/);
    if (!m) return [5, 0, code];
    const groupRank = { OP: 0, EB: 1, PRB: 2, ST: 3 }[m[1]] ?? 5;
    return [groupRank, Number(m[2]), code];
  };
  const ar = rank(a);
  const br = rank(b);
  for (let i = 0; i < ar.length; i++) {
    if (ar[i] < br[i]) return -1;
    if (ar[i] > br[i]) return 1;
  }
  return 0;
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

const GAME = await loadGameScope({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, gameSlug: GAME_SLUG });
console.log(`Using game scope: ${GAME.slug}`);

const sets = await sbFetchAll(withGameFilter("sets?select=id,code,slug,name", GAME.id));
const cards = await sbFetchAll(withGameFilter("cards?select=id,set_id,card_image_id,card_number,name,rarity,variant_label", GAME.id));
const setById = new Map(sets.map((set) => [set.id, set]));
const dbByImageId = new Map();
const dbBySetCode = new Map();

for (const card of cards) {
  const set = setById.get(card.set_id);
  const setCode = (set?.code ?? "").toUpperCase();
  const row = { ...card, setCode, setName: set?.name ?? "" };
  if (card.card_image_id) {
    if (!dbByImageId.has(card.card_image_id)) dbByImageId.set(card.card_image_id, []);
    dbByImageId.get(card.card_image_id).push(row);
  }
  if (!dbBySetCode.has(setCode)) dbBySetCode.set(setCode, []);
  dbBySetCode.get(setCode).push(row);
}

console.log("Fetching Bandai series index...");
const indexHtml = await fetchText(CARDLIST_URL);
const options = parseOptions(indexHtml)
  .filter((option) => REPORT_SET_CODES.has(option.displayCode) || REPORT_SET_CODES.has(option.officialCode))
  .sort((a, b) => compareSetCodes(a.displayCode, b.displayCode) || a.officialCode.localeCompare(b.officialCode));

console.log(`Bandai series found=${options.length}`);

const bandaiByOfficialCode = new Map();
const allBandaiCards = [];
for (const option of options) {
  console.log(`Fetching Bandai ${option.displayCode} (${option.seriesId})...`);
  const html = await fetchText(option.url);
  const officialCards = parseBandaiCards(html, option);
  bandaiByOfficialCode.set(option.officialCode, { option, cards: officialCards });
  allBandaiCards.push(...officialCards);
  await sleep(150);
}

const officialRows = [];
const dbRows = [];
const mismatchRows = [];
const missingRows = [];
const extraRows = [];

for (const { option, cards: bandaiCards } of bandaiByOfficialCode.values()) {
  const officialCounts = emptyCounts(BANDai_RAW_ORDER);
  const matchedDbCounts = emptyCounts(DB_RARITY_ORDER);
  const officialIds = new Set(bandaiCards.map((card) => card.id));
  let exactMatches = 0;
  let missing = 0;

  for (const bandaiCard of bandaiCards) {
    inc(officialCounts, bandaiCard.rarity);
    const dbMatches = dbByImageId.get(bandaiCard.id) ?? [];
    if (dbMatches.length === 0) {
      missing++;
      missingRows.push([
        option.displayCode,
        bandaiCard.id,
        bandaiCard.cardNumber,
        bandaiCard.name,
        bandaiCard.rawRarity,
        option.url,
      ]);
      continue;
    }

    exactMatches += dbMatches.length;
    for (const dbCard of dbMatches) {
      const dbRarity = canonicalDbRarity(dbCard.rarity, dbCard.setCode);
      inc(matchedDbCounts, dbRarity);
      if (dbRarity !== canonicalDbRarity(bandaiCard.rarity, "")) {
        mismatchRows.push([
          option.displayCode,
          bandaiCard.id,
          bandaiCard.cardNumber,
          bandaiCard.name,
          bandaiCard.rawRarity,
          dbCard.rarity ?? "",
          dbCard.variant_label ?? "",
          dbCard.setCode,
        ]);
      }
    }
  }

  const relatedCodes = relatedDbCodes(option.officialCode);
  const relatedDbRows = relatedCodes.flatMap((code) => dbBySetCode.get(code) ?? []);
  for (const dbCard of relatedDbRows) {
    if (!dbCard.card_image_id || officialIds.has(dbCard.card_image_id)) continue;
    extraRows.push([
      option.displayCode,
      dbCard.setCode,
      dbCard.card_image_id,
      dbCard.card_number ?? "",
      dbCard.name ?? "",
      dbCard.rarity ?? "",
      dbCard.variant_label ?? "",
    ]);
  }

  officialRows.push([
    option.displayCode,
    option.label,
    bandaiCards.length,
    ...BANDai_RAW_ORDER.map((rarity) => officialCounts[rarity]),
    option.url,
  ]);
  dbRows.push([
    option.displayCode,
    exactMatches,
    missing,
    relatedDbRows.length,
    extraRows.filter((row) => row[0] === option.displayCode).length,
    ...DB_RARITY_ORDER.map((rarity) => matchedDbCounts[rarity]),
  ]);
}

const generated = new Date().toISOString();
const report = [];
report.push("# Bandai Rarity Comparison");
report.push("");
report.push(`Generated: ${generated}`);
report.push(`Game: ${GAME.name ?? GAME.slug} (${GAME.slug})`);
report.push("");
report.push("## Scope");
report.push("");
report.push("- Public source: Bandai official English card list.");
report.push(`- Series pages fetched: ${options.length}.`);
report.push(`- Bandai card-list rows parsed: ${allBandaiCards.length}.`);
report.push(`- DB cards checked: ${cards.length}.`);
report.push("");
report.push("Bandai's card list reports printed/base rarity. The app DB intentionally reclassifies variant/chase rows into collector buckets such as MR, AA, SP, SAR, and TR, so some rarity differences are expected.");
report.push("");
report.push("## Bandai Official Rarity Counts");
report.push("");
report.push(mdTable(["Set", "Bandai Label", "Official Rows", ...BANDai_RAW_ORDER, "Source URL"], officialRows));
report.push("");
report.push("## DB Current Rarity Counts For Exact Bandai Rows");
report.push("");
report.push(
  mdTable(
    ["Set", "DB Exact Matches", "Missing Official IDs In DB", "Related DB Rows", "Related DB Extra Rows", ...DB_RARITY_ORDER],
    dbRows
  )
);
report.push("");
report.push("## Exact-Match Rarity Differences");
report.push("");
if (mismatchRows.length === 0) {
  report.push("No exact-match rarity differences found.");
} else {
  report.push(
    mdTable(
      ["Set", "card_image_id", "Card #", "Name", "Bandai Raw Rarity", "DB Rarity", "DB Variant", "DB Set"],
      mismatchRows
    )
  );
}
report.push("");
report.push("## Official IDs Missing In DB");
report.push("");
if (missingRows.length === 0) {
  report.push("No Bandai official card IDs were missing in DB.");
} else {
  report.push(mdTable(["Set", "card_image_id", "Card #", "Name", "Bandai Raw Rarity", "Source URL"], missingRows));
}
report.push("");
report.push("## Related DB Rows Not In Bandai Series");
report.push("");
if (extraRows.length === 0) {
  report.push("No related DB extras found.");
} else {
  report.push(mdTable(["Bandai Set", "DB Set", "card_image_id", "Card #", "Name", "DB Rarity", "DB Variant"], extraRows));
}

fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

console.log(`Wrote ${REPORT_PATH}`);
console.log(`Bandai rows parsed=${allBandaiCards.length}`);
console.log(`Exact-match rarity differences=${mismatchRows.length}`);
console.log(`Official IDs missing in DB=${missingRows.length}`);
console.log(`Related DB extra rows=${extraRows.length}`);
