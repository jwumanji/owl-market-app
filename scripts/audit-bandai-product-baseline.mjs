// Compare DB base-card rarity counts against the supplied Bandai product
// rarity baseline for OP01-OP09.
//
// This is intentionally different from rarity-integrity-report.md:
// it counts only base rows where card_image_id === card_number. Variants,
// promos, Manga, alternate art, SP, anniversary, treasure, DON, and other
// product rows are excluded from the base-product comparison.

import fs from "node:fs";

const REPORT_PATH = "bandai-product-baseline-comparison.md";
const BANDai_BASE = "https://en.onepiece-cardgame.com";
const CARDLIST_URL = `${BANDai_BASE}/cardlist/`;

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

const BASE_RARITIES = ["L", "C", "UC", "R", "SR", "SEC"];

const EXPECTED = [
  { code: "OP01", name: "Romance Dawn", L: 8, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "-" },
  { code: "OP02", name: "Paramount War", L: 8, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "-" },
  { code: "OP03", name: "Pillars of Strength", L: 8, C: 45, UC: 32, R: 26, SR: 10, SEC: 2, other: "4 SP" },
  { code: "OP04", name: "Kingdoms of Intrigue", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "5 SP" },
  { code: "OP05", name: "Awakening of the New Era", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "6 SP + 1 Anniv." },
  { code: "OP06", name: "Wings of the Captain", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "6 SP" },
  { code: "OP07", name: "500 Years in the Future", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "6 SP" },
  { code: "OP08", name: "Two Legends", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "6 SP" },
  { code: "OP09", name: "The New Emperor / Emperors in the New World", L: 6, C: 45, UC: 30, R: 26, SR: 10, SEC: 2, other: "10 SP + 1 Treasure" },
];

function restHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function rarity(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "UNCOMMON") return "UC";
  return raw;
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
    cards.push({
      id,
      cardNumber: decodeHtml(info[1]),
      rarity: rarity(decodeHtml(info[2])),
      rawRarity: decodeHtml(info[2]),
      cardType: decodeHtml(info[3]),
      name: decodeHtml(block.match(/<div\s+class="cardName">([\s\S]*?)<\/div>/i)?.[1] ?? ""),
      officialCode: option.officialCode,
      displayCode: option.displayCode,
      seriesId: option.seriesId,
    });
  }
  return cards;
}

function emptyCounts() {
  return Object.fromEntries(BASE_RARITIES.map((code) => [code, 0]));
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

function summarizeDbRows(rows) {
  if (rows.length === 0) return "-";
  return rows
    .map((row) => {
      const parts = [
        row.setCode,
        row.card_image_id || "(no image id)",
        row.card_number || "(no card #)",
        rarity(row.rarity || "UNKNOWN"),
      ];
      if (row.variant_label) parts.push(row.variant_label);
      return parts.join(" / ");
    })
    .join("; ");
}

const sets = await sbFetchAll("sets?select=id,code,name");
const cards = await sbFetchAll("cards?select=id,set_id,card_image_id,card_number,name,rarity,variant_label");
const setById = new Map(sets.map((set) => [set.id, set]));
const dbByImageId = new Map();
const dbBySetAndCardNumber = new Map();

const baseCountsBySet = new Map();
const nonBaseCountsBySet = new Map();

for (const row of EXPECTED) {
  baseCountsBySet.set(row.code, emptyCounts());
  nonBaseCountsBySet.set(row.code, 0);
}

for (const card of cards) {
  const set = setById.get(card.set_id);
  const setCode = (set?.code ?? "").toUpperCase();
  const row = { ...card, setCode, setName: set?.name ?? "" };

  if (card.card_image_id) {
    if (!dbByImageId.has(card.card_image_id)) dbByImageId.set(card.card_image_id, []);
    dbByImageId.get(card.card_image_id).push(row);
  }
  if (card.card_number) {
    const key = `${setCode}:${card.card_number}`;
    if (!dbBySetAndCardNumber.has(key)) dbBySetAndCardNumber.set(key, []);
    dbBySetAndCardNumber.get(key).push(row);
  }

  if (!baseCountsBySet.has(setCode)) continue;

  const isBase = card.card_image_id && card.card_number && card.card_image_id === card.card_number;
  if (!isBase) {
    nonBaseCountsBySet.set(setCode, (nonBaseCountsBySet.get(setCode) ?? 0) + 1);
    continue;
  }

  const code = rarity(card.rarity);
  const counts = baseCountsBySet.get(setCode);
  if (counts && code in counts) counts[code]++;
}

const comparisonRows = [];
const mismatchRows = [];

for (const expected of EXPECTED) {
  const actual = baseCountsBySet.get(expected.code) ?? emptyCounts();
  const deltas = BASE_RARITIES.map((code) => actual[code] - expected[code]);
  const status = deltas.every((delta) => delta === 0) ? "PASS" : "FAIL";
  comparisonRows.push([
    expected.code,
    expected.name,
    status,
    ...BASE_RARITIES.flatMap((code) => [expected[code], actual[code], actual[code] - expected[code]]),
    expected.other,
    nonBaseCountsBySet.get(expected.code) ?? 0,
  ]);

  if (status !== "PASS") {
    for (const code of BASE_RARITIES) {
      const delta = actual[code] - expected[code];
      if (delta !== 0) mismatchRows.push([expected.code, code, expected[code], actual[code], delta]);
    }
  }
}

console.log("Fetching Bandai official base rows...");
const expectedCodeSet = new Set(EXPECTED.map((row) => row.code));
const indexHtml = await fetchText(CARDLIST_URL);
const options = parseOptions(indexHtml).filter((option) => expectedCodeSet.has(option.displayCode));
const optionByCode = new Map(options.map((option) => [option.displayCode, option]));
const officialBaseCountRows = [];
const missingDetailRows = [];
const missingSeriesRows = [];

for (const expected of EXPECTED) {
  const option = optionByCode.get(expected.code);
  if (!option) {
    missingSeriesRows.push([expected.code, expected.name, "Bandai series option not found"]);
    continue;
  }

  console.log(`Fetching Bandai ${expected.code} (${option.seriesId})...`);
  const html = await fetchText(option.url);
  const officialCards = parseBandaiCards(html, option);
  const officialBaseCards = officialCards.filter(
    (card) => card.id === card.cardNumber && BASE_RARITIES.includes(card.rarity)
  );
  const officialCounts = emptyCounts();
  for (const card of officialBaseCards) officialCounts[card.rarity]++;

  officialBaseCountRows.push([
    expected.code,
    option.label,
    ...BASE_RARITIES.flatMap((code) => [expected[code], officialCounts[code], officialCounts[code] - expected[code]]),
    option.url,
  ]);

  for (const card of officialBaseCards) {
    const exactRows = (dbByImageId.get(card.id) ?? []).filter((row) => row.setCode === expected.code);
    const exactBaseRows = exactRows.filter((row) => row.card_image_id === row.card_number);
    const correctRows = exactBaseRows.filter((row) => rarity(row.rarity) === card.rarity);
    if (correctRows.length > 0) continue;

    const sameNumberRows = dbBySetAndCardNumber.get(`${expected.code}:${card.cardNumber}`) ?? [];
    const globalImageRows = dbByImageId.get(card.id) ?? [];
    let issue = "Missing official base ID in DB set";
    let evidence = "-";

    if (exactBaseRows.length > 0) {
      issue = "Base row present with different DB rarity";
      evidence = summarizeDbRows(exactBaseRows);
    } else if (exactRows.length > 0) {
      issue = "Exact image ID present, but not as a strict base row";
      evidence = summarizeDbRows(exactRows);
    } else if (sameNumberRows.length > 0) {
      issue = "No strict base row; same card number exists under other image IDs";
      evidence = summarizeDbRows(sameNumberRows);
    } else if (globalImageRows.length > 0) {
      issue = "Official base ID exists in a different DB set";
      evidence = summarizeDbRows(globalImageRows);
    }

    missingDetailRows.push([
      expected.code,
      card.id,
      card.cardNumber,
      card.name,
      card.rarity,
      issue,
      evidence,
      option.url,
    ]);
  }

  await sleep(150);
}

const report = [];
report.push("# Bandai Product Baseline Comparison");
report.push("");
report.push(`Generated: ${new Date().toISOString()}`);
report.push("");
report.push("## Scope");
report.push("");
report.push("- Expected baseline: OP01-OP09 product rarity counts supplied in chat.");
report.push("- Actual baseline: DB rows where `card_image_id === card_number`.");
report.push("- Excluded from base comparison: variants, alternate arts, Manga, SP, promos, anniversary, treasure, DON, and other product rows.");
report.push("- Missing/misclassified detail: official Bandai base rows where Bandai `card_image_id === card number`.");
report.push("");
report.push("## Base Rarity Comparison");
report.push("");
report.push(
  mdTable(
    [
      "Set",
      "Name",
      "Status",
      ...BASE_RARITIES.flatMap((code) => [`Expected ${code}`, `DB Base ${code}`, `Delta ${code}`]),
      "Expected Special/Other Note",
      "DB Non-Base Rows",
    ],
    comparisonRows
  )
);
report.push("");
report.push("## Base Count Mismatches");
report.push("");
if (mismatchRows.length === 0) {
  report.push("No base rarity count mismatches found.");
} else {
  report.push(mdTable(["Set", "Rarity", "Expected", "DB Base", "Delta"], mismatchRows));
}
report.push("");
report.push("## Bandai Official Base Counts");
report.push("");
if (officialBaseCountRows.length === 0) {
  report.push("No Bandai official base rows were parsed.");
} else {
  report.push(
    mdTable(
      [
        "Set",
        "Bandai Label",
        ...BASE_RARITIES.flatMap((code) => [`Expected ${code}`, `Bandai Base ${code}`, `Delta ${code}`]),
        "Source URL",
      ],
      officialBaseCountRows
    )
  );
}
report.push("");
report.push("## Missing Or Misclassified Official Base Rows");
report.push("");
if (missingSeriesRows.length > 0) {
  report.push(mdTable(["Set", "Name", "Issue"], missingSeriesRows));
  report.push("");
}
if (missingDetailRows.length === 0) {
  report.push("No official Bandai base rows are missing or misclassified in the strict DB base comparison.");
} else {
  report.push(
    mdTable(
      ["Set", "card_image_id", "Card #", "Name", "Expected Rarity", "Issue", "DB Evidence", "Source URL"],
      missingDetailRows
    )
  );
}

fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

console.log(`Wrote ${REPORT_PATH}`);
for (const row of comparisonRows) {
  console.log(`${row[0]} ${row[2]}`);
}
console.log(`Missing/misclassified official base rows=${missingDetailRows.length}`);
