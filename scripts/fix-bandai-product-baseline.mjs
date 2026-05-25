// Repair DB rows that fail the OP01-OP09 Bandai product baseline audit.
//
// Default mode is a dry run. Use --apply to write fixes.
//
// Apply behavior:
// - Base field fixes are applied with --apply.
// - Set-owner fixes are applied only with --apply --include-set-moves.
//   The script preserves the current starter-deck row as a synthetic
//   "<card_image_id>-<set>-reprint" row before moving the official base ID.
// - Missing base-row inserts are applied only with --apply --include-inserts.

import fs from "node:fs";
import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const REPORT_PATH = "bandai-product-baseline-fix-report.md";
const BANDAI_BASE = "https://en.onepiece-cardgame.com";
const CARDLIST_URL = `${BANDAI_BASE}/cardlist/`;
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";
const APPLY = process.argv.includes("--apply");
const INCLUDE_SET_MOVES = process.argv.includes("--include-set-moves");
const INCLUDE_INSERTS = process.argv.includes("--include-inserts");

const BASE_RARITIES = ["L", "C", "UC", "R", "SR", "SEC"];

const EXPECTED = [
  { code: "OP01", name: "Romance Dawn" },
  { code: "OP02", name: "Paramount War" },
  { code: "OP03", name: "Pillars of Strength" },
  { code: "OP04", name: "Kingdoms of Intrigue" },
  { code: "OP05", name: "Awakening of the New Era" },
  { code: "OP06", name: "Wings of the Captain" },
  { code: "OP07", name: "500 Years in the Future" },
  { code: "OP08", name: "Two Legends" },
  { code: "OP09", name: "The New Emperor / Emperors in the New World" },
];

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

async function patchCard(id, gameId, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(id)}&game_id=eq.${encodeURIComponent(gameId)}`, {
    method: "PATCH",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Supabase card patch failed: ${res.status} ${await res.text()}`);
  }
}

async function insertCard(gameId, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cards`, {
    method: "POST",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({ ...row, game_id: row.game_id ?? gameId }),
  });
  if (!res.ok) {
    throw new Error(`Supabase card insert failed: ${res.status} ${await res.text()}`);
  }
}

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "owl-market-fix/1.0",
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
      sourceUrl: option.url,
    });
  }
  return cards;
}

function nameBase(name) {
  return String(name ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutDbOnlyFields(row) {
  const {
    id,
    setCode,
    setName,
    price_stats,
    created_at,
    updated_at,
    tcg_product_id,
    ...insertable
  } = row;
  return insertable;
}

function cloneForOfficialBase({ officialCard, targetSetId, clone }) {
  return {
    ...withoutDbOnlyFields(clone),
    card_image_id: officialCard.id,
    card_number: officialCard.cardNumber,
    name: officialCard.name,
    name_base: nameBase(officialCard.name),
    set_id: targetSetId,
    rarity: officialCard.rarity,
    variant_label: null,
    image_url: `${OPT_IMAGE_BASE}/${officialCard.cardNumber}.jpg`,
  };
}

function cloneForReprint({ current, syntheticId }) {
  return {
    ...withoutDbOnlyFields(current),
    card_image_id: syntheticId,
    variant_label: current.variant_label ?? "Reprint",
  };
}

function chooseClone(rows, expectedRarity) {
  const scored = rows.map((row) => {
    let score = 0;
    const rowRarity = rarity(row.rarity);
    const variant = String(row.variant_label ?? "").toLowerCase();
    if (rowRarity === expectedRarity) score += 10;
    if (!row.variant_label) score += 8;
    if (variant.includes("championship") || variant.includes("promotion")) score -= 2;
    if (["AA", "MR", "SAR", "SP", "PROMO", "PR"].includes(rowRarity)) score -= 5;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.row ?? rows[0] ?? null;
}

function evidence(row) {
  if (!row) return "-";
  const parts = [
    row.setCode,
    row.card_image_id || "(no image id)",
    row.card_number || "(no card #)",
    rarity(row.rarity || "UNKNOWN"),
  ];
  if (row.variant_label) parts.push(row.variant_label);
  return parts.join(" / ");
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

const expectedCodeSet = new Set(EXPECTED.map((row) => row.code));

const GAME = await loadGameScope({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, gameSlug: GAME_SLUG });
console.log(`Loading Supabase sets/cards for game scope: ${GAME.slug}...`);
const [sets, cards] = await Promise.all([
  sbFetchAll(withGameFilter("sets?select=id,code,name", GAME.id)),
  sbFetchAll(
    withGameFilter("cards?select=id,game_id,set_id,card_image_id,card_number,name,name_base,rarity,variant_label,card_type,color,power,counter,life,cost,attribute,types,effect,trigger,image_url,image_url_small,promo_segment", GAME.id)
  ),
]);

const setById = new Map(sets.map((set) => [set.id, set]));
const setByCode = new Map(sets.map((set) => [String(set.code ?? "").toUpperCase(), set]));
const dbByImageId = new Map();
const dbBySetAndCardNumber = new Map();

for (const card of cards) {
  const set = setById.get(card.set_id);
  const row = { ...card, setCode: String(set?.code ?? "").toUpperCase(), setName: set?.name ?? "" };
  if (card.card_image_id) {
    if (!dbByImageId.has(card.card_image_id)) dbByImageId.set(card.card_image_id, []);
    dbByImageId.get(card.card_image_id).push(row);
  }
  if (card.card_number) {
    const key = `${row.setCode}:${card.card_number}`;
    if (!dbBySetAndCardNumber.has(key)) dbBySetAndCardNumber.set(key, []);
    dbBySetAndCardNumber.get(key).push(row);
  }
}

console.log("Fetching Bandai OP01-OP09 official base rows...");
const indexHtml = await fetchText(CARDLIST_URL);
const optionByCode = new Map(
  parseOptions(indexHtml)
    .filter((option) => expectedCodeSet.has(option.displayCode))
    .map((option) => [option.displayCode, option])
);

const baseFieldFixes = [];
const setMoveFixes = [];
const insertFixes = [];
const manualFixes = [];

for (const expected of EXPECTED) {
  const option = optionByCode.get(expected.code);
  const targetSet = setByCode.get(expected.code);
  if (!option || !targetSet) {
    manualFixes.push({
      set: expected.code,
      card: null,
      issue: !option ? "Bandai series option not found" : "DB target set not found",
      evidence: "-",
    });
    continue;
  }

  console.log(`Fetching Bandai ${expected.code}...`);
  const officialCards = parseBandaiCards(await fetchText(option.url), option).filter(
    (card) => card.id === card.cardNumber && BASE_RARITIES.includes(card.rarity)
  );

  for (const officialCard of officialCards) {
    const exactRows = dbByImageId.get(officialCard.id) ?? [];
    const exactRowsInTarget = exactRows.filter((row) => row.setCode === expected.code);
    const exactBaseRowsInTarget = exactRowsInTarget.filter((row) => row.card_image_id === row.card_number);
    const correctBase = exactBaseRowsInTarget.find(
      (row) => rarity(row.rarity) === officialCard.rarity && row.variant_label == null
    );
    if (correctBase) continue;

    const wrongBase = exactBaseRowsInTarget[0];
    if (wrongBase) {
      baseFieldFixes.push({
        set: expected.code,
        card: officialCard,
        row: wrongBase,
        updates: {
          rarity: officialCard.rarity,
          variant_label: null,
        },
      });
      continue;
    }

    if (exactRows.length === 1 && exactRows[0].setCode !== expected.code) {
      const current = exactRows[0];
      const syntheticId = `${current.card_image_id}-${current.setCode.toLowerCase()}-reprint`;
      setMoveFixes.push({
        set: expected.code,
        card: officialCard,
        current,
        targetSet,
        syntheticId,
        syntheticExists: dbByImageId.has(syntheticId),
      });
      continue;
    }

    const sameNumberRows = dbBySetAndCardNumber.get(`${expected.code}:${officialCard.cardNumber}`) ?? [];
    const clone = chooseClone(sameNumberRows, officialCard.rarity);
    if (clone) {
      insertFixes.push({
        set: expected.code,
        card: officialCard,
        targetSet,
        clone,
        row: cloneForOfficialBase({ officialCard, targetSetId: targetSet.id, clone }),
      });
      continue;
    }

    manualFixes.push({
      set: expected.code,
      card: officialCard,
      issue: "No exact DB row and no same-number row to clone",
      evidence: exactRows.map(evidence).join("; ") || "-",
    });
  }

  await sleep(150);
}

const applied = {
  baseFieldFixes: 0,
  reprintInserts: 0,
  setMoves: 0,
  baseInserts: 0,
};

if (APPLY) {
  console.log("Applying base field fixes...");
  for (const fix of baseFieldFixes) {
    await patchCard(fix.row.id, GAME.id, fix.updates);
    applied.baseFieldFixes++;
  }

  if (INCLUDE_SET_MOVES) {
    console.log("Applying set-owner fixes...");
    for (const fix of setMoveFixes) {
      if (!fix.syntheticExists) {
        await insertCard(GAME.id, cloneForReprint({ current: fix.current, syntheticId: fix.syntheticId }));
        applied.reprintInserts++;
      }
      await patchCard(fix.current.id, GAME.id, {
        set_id: fix.targetSet.id,
        rarity: fix.card.rarity,
        variant_label: null,
      });
      applied.setMoves++;
    }
  }

  if (INCLUDE_INSERTS) {
    console.log("Applying missing base-row inserts...");
    for (const fix of insertFixes) {
      await insertCard(GAME.id, fix.row);
      applied.baseInserts++;
    }
  }
}

const report = [];
report.push("# Bandai Product Baseline Fix Report");
report.push("");
report.push(`Generated: ${new Date().toISOString()}`);
report.push(`Game: ${GAME.name ?? GAME.slug} (${GAME.slug})`);
report.push(`Mode: ${APPLY ? "apply" : "dry-run"}`);
report.push("");
report.push("## Summary");
report.push("");
report.push(
  mdTable(
    ["Metric", "Count"],
    [
      ["Base field fixes found", baseFieldFixes.length],
      ["Set-owner fixes found", setMoveFixes.length],
      ["Missing base-row inserts found", insertFixes.length],
      ["Manual fixes needed", manualFixes.length],
      ["Base field fixes applied", applied.baseFieldFixes],
      ["Synthetic reprint rows inserted", applied.reprintInserts],
      ["Set-owner fixes applied", applied.setMoves],
      ["Base rows inserted", applied.baseInserts],
    ]
  )
);
report.push("");
report.push("## Apply Flags");
report.push("");
report.push("- `--apply`: writes base rarity/variant-label fixes.");
report.push("- `--apply --include-set-moves`: also preserves synthetic reprints and moves official base IDs back to their booster sets.");
report.push("- `--apply --include-inserts`: also creates missing official base rows by cloning same-number metadata.");
report.push("");
report.push("## Base Field Fixes");
report.push("");
report.push(
  baseFieldFixes.length === 0
    ? "No base field fixes found."
    : mdTable(
        ["Set", "card_image_id", "Name", "DB Rarity", "Bandai Rarity", "DB Variant"],
        baseFieldFixes.map((fix) => [
          fix.set,
          fix.card.id,
          fix.card.name,
          fix.row.rarity,
          fix.card.rarity,
          fix.row.variant_label ?? "",
        ])
      )
);
report.push("");
report.push("## Set-Owner Fixes");
report.push("");
report.push(
  setMoveFixes.length === 0
    ? "No set-owner fixes found."
    : mdTable(
        ["Target Set", "card_image_id", "Name", "Current DB Set", "Synthetic Reprint ID", "Synthetic Exists"],
        setMoveFixes.map((fix) => [
          fix.set,
          fix.card.id,
          fix.card.name,
          fix.current.setCode,
          fix.syntheticId,
          fix.syntheticExists ? "yes" : "no",
        ])
      )
);
report.push("");
report.push("## Missing Base-Row Inserts");
report.push("");
report.push(
  insertFixes.length === 0
    ? "No missing base-row inserts found."
    : mdTable(
        ["Set", "card_image_id", "Name", "Bandai Rarity", "Cloned From"],
        insertFixes.map((fix) => [fix.set, fix.card.id, fix.card.name, fix.card.rarity, evidence(fix.clone)])
      )
);
report.push("");
report.push("## Manual Fixes");
report.push("");
report.push(
  manualFixes.length === 0
    ? "No manual fixes needed."
    : mdTable(
        ["Set", "card_image_id", "Name", "Issue", "Evidence"],
        manualFixes.map((fix) => [
          fix.set,
          fix.card?.id ?? "",
          fix.card?.name ?? "",
          fix.issue,
          fix.evidence,
        ])
      )
);

fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

console.log(`Wrote ${REPORT_PATH}`);
console.log(`Base field fixes found=${baseFieldFixes.length}`);
console.log(`Set-owner fixes found=${setMoveFixes.length}`);
console.log(`Missing base-row inserts found=${insertFixes.length}`);
console.log(`Manual fixes needed=${manualFixes.length}`);
if (!APPLY) {
  console.log("Dry run only. Re-run with --apply to write base field fixes.");
}
