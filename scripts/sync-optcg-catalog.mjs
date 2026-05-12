// optcgapi catalog cleanup.
//
// This script treats optcgapi as the source of truth for catalog fields:
// set membership, card number, name, rarity classification, type/stat fields,
// and optcg image URL. It preserves enrichment fields such as tcg_product_id,
// image_url_small, prices, and history.
//
// Default mode is a dry run. Use --apply to write deterministic upserts.

import fs from "node:fs";

const OPT_BASE = "https://optcgapi.com/api";
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";
const REPORT_PATH = "optcg-catalog-cleanup-report.md";
const APPLY = process.argv.includes("--apply");

const BANDAI_BASE_OVERRIDES = new Map([
  ["OP05-001", { rarity: "L", variantLabel: null }],
  ["OP05-002", { rarity: "L", variantLabel: null }],
  ["OP05-022", { rarity: "L", variantLabel: null }],
  ["OP05-060", { rarity: "L", variantLabel: null }],
  ["OP05-098", { rarity: "L", variantLabel: null }],
  ["OP06-001", { rarity: "L", variantLabel: null }],
  ["OP06-020", { rarity: "L", variantLabel: null }],
  ["OP06-021", { rarity: "L", variantLabel: null }],
  ["OP06-022", { rarity: "L", variantLabel: null }],
  ["OP06-042", { rarity: "L", variantLabel: null }],
  ["OP06-047", { rarity: "R", variantLabel: null }],
  ["OP06-080", { rarity: "L", variantLabel: null }],
  ["OP07-001", { rarity: "L", variantLabel: null }],
  ["OP07-019", { rarity: "L", variantLabel: null }],
  ["OP07-038", { rarity: "L", variantLabel: null }],
  ["OP07-059", { rarity: "L", variantLabel: null }],
  ["OP07-076", { rarity: "C", variantLabel: null }],
  ["OP07-079", { rarity: "L", variantLabel: null }],
  ["OP07-097", { rarity: "L", variantLabel: null }],
  ["OP08-001", { rarity: "L", variantLabel: null }],
  ["OP08-002", { rarity: "L", variantLabel: null }],
  ["OP08-021", { rarity: "L", variantLabel: null }],
  ["OP08-057", { rarity: "L", variantLabel: null }],
  ["OP08-058", { rarity: "L", variantLabel: null }],
  ["OP08-098", { rarity: "L", variantLabel: null }],
]);

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const SETS_FILTER = readArg("--sets")
  ?.split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

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

async function sbUpsert(table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: "POST",
        headers: restHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify(chunk),
      }
    );
    if (!res.ok) {
      throw new Error(`Supabase upsert ${table} failed: ${res.status} ${await res.text()}`);
    }
  }
}

async function optJson(path, attempt = 0) {
  const res = await fetch(`${OPT_BASE}${path}`);
  if (!res.ok && attempt < 4) {
    await sleep(1000 * (attempt + 1));
    return optJson(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`optcgapi ${path} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nullIfNullStr(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^null$/i.test(text) || /^n\/?a$/i.test(text)) return null;
  return text;
}

function normText(value) {
  return nullIfNullStr(value)?.replace(/\s+/g, " ") ?? null;
}

function toInt(value) {
  const text = nullIfNullStr(value);
  if (!text) return null;
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function compactCode(value) {
  const text = nullIfNullStr(value);
  return text ? text.replace(/-/g, "").toUpperCase() : null;
}

function endpointCodeFromSet(set) {
  const compact = compactCode(set.set_id ?? set.structure_deck_id);
  if (compact === "OP14EB04") return "OP14";
  if (compact === "OP15EB04") return "OP15";
  return compact;
}

function prefixFromCardNumber(cardNumber) {
  const text = nullIfNullStr(cardNumber);
  if (!text) return null;
  const withDigits = text.match(/^([A-Z]+\d+)-/i);
  if (withDigits) return withDigits[1].toUpperCase();
  const promo = text.match(/^([A-Z]+)-/i);
  return promo ? promo[1].toUpperCase() : null;
}

function variantTags(name) {
  const text = normText(name) ?? "";
  const tags = [];
  const re = /\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const tag = match[1].trim();
    if (!/^\d+$/.test(tag)) tags.push(tag);
  }
  return tags;
}

function expectedVariantLabel(name) {
  const tags = variantTags(name);
  const joined = tags.join(" ").toLowerCase();
  if (!joined) return null;
  if (joined.includes("manga")) return "Manga";
  if (joined.includes("red super alternate art")) return "Red Super Alternate Art";
  if (joined.includes("super alternate art")) return "Super Alternate Art";
  if (joined.includes("sp") && joined.includes("gold")) return "SP Gold";
  if (joined.includes("sp") && joined.includes("silver")) return "SP Silver";
  if (/\bspr\b/.test(joined)) return "SP";
  if (/\bsp\b/.test(joined)) return "SP";
  if (/\btr\b/.test(joined)) return "TR";
  if (joined.includes("wanted poster")) return "Wanted Poster";
  if (joined.includes("gold-stamped signature")) return "Gold-Stamped Signature";
  if (joined.includes("alternate art")) return "Parallel";
  if (joined.includes("parallel")) return "Parallel";
  if (joined.includes("best selection")) return "Alt Art";
  if (joined.includes("anniversary")) return "Anniversary";
  if (joined.includes("pre-release")) return "Pre-Release";
  if (joined.includes("film red")) return "Alt Art";
  if (joined.includes("one piece day")) return "Alt Art";
  if (joined.includes("jolly roger foil")) return "Jolly Roger Foil";
  if (joined.includes("reprint")) return "Reprint";
  return null;
}

function bandaiBaseOverride(card) {
  const imageId = nullIfNullStr(card.card_image_id);
  const cardNumber = nullIfNullStr(card.card_set_id);
  if (!imageId || imageId !== cardNumber) return null;
  return BANDAI_BASE_OVERRIDES.get(imageId) ?? null;
}

function expectedRarity(card) {
  const override = bandaiBaseOverride(card);
  if (override?.rarity) return override.rarity;

  const base = nullIfNullStr(card.rarity);
  const hay = `${card.card_name ?? ""} ${expectedVariantLabel(card.card_name) ?? ""}`;
  if (/\bmanga\b/i.test(hay)) return "MR";
  if (/\(TR\)/i.test(hay)) return "TR";
  if (/\(red super alternate art\)/i.test(hay) || /\(super alternate art\)/i.test(hay)) {
    return "SAR";
  }
  if (/\(sp\)/i.test(hay) || /\(spr\)/i.test(hay) || /\(wanted poster\)/i.test(hay)) {
    return "SP";
  }
  if (/\(alternate art\)/i.test(hay)) return "AA";
  return base;
}

function nameBase(name) {
  return (normText(name) ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksGarbledPromo(card) {
  if (!card.set_id || typeof card.set_id !== "string") return true;
  if (/\s/.test(card.set_id)) return true;
  return !/^[A-Z]+\d*$/.test(card.set_id);
}

const SEGMENT_RULES = [
  [/Anniversary Set\)/i, "Anniversary Set"],
  [/Premium Card Collection/i, "Premium Card Collection"],
  [/Championship 20\d\d/i, "Championship Prize"],
  [/(Online|Offline) Regional/i, "Regional Prize"],
  [/Treasure Cup/i, "Championship Prize"],
  [/Pirates League/i, "Championship Prize"],
  [/Store Championship/i, "Store Championship"],
  [/Store \d-on-\d Battle/i, "Store Event"],
  [/Sealed Battle/i, "Sealed Battle Kit"],
  [/Tournament Pack/i, "Tournament Pack"],
  [/Event Pack/i, "Event Pack"],
  [/Winner Pack/i, "Winner Pack"],
  [/Judge Pack|\(Judge\)/i, "Judge Pack"],
  [/Pre-Release/i, "Pre-Release"],
  [/Promotion Pack/i, "Promotion Pack"],
  [/Pirates Party/i, "Pirates Party"],
  [/Welcome Pack/i, "Welcome Pack"],
  [/Gift Collection/i, "Gift Collection"],
  [/Sound Loader/i, "Sound Loader"],
  [/Illustration Box/i, "Illustration Box"],
  [/Official Playmat/i, "Official Playmat"],
  [/Special Goods Set/i, "Special Goods Set"],
  [/Beginners Deck Party/i, "Beginners Deck Party"],
  [/CS \d/i, "CS Pack"],
  [/Convention Promo|Anime Expo|Gen Con/i, "Convention Promo"],
  [/PSA Magazine/i, "Magazine Promo"],
  [/2nd Anniversary Tournament|Pre-Release Tournament/i, "Tournament Prize"],
  [/Release Event/i, "Release Event"],
  [/New Year Event/i, "Special Event"],
  [/One Piece Film Red|Live Action|FILM RED/i, "Movie Tie-in"],
  [/Dodgers x|BVB x|x ONE PIECE|x One Piece/i, "Crossover Promo"],
  [/Demo Deck/i, "Demo Deck"],
  [/Serial Number|Jumbo/i, "Special Edition"],
  [/Alternate Art/i, "Alt Art Promo"],
  [/Learn Together Deck Set/i, "Learn Together"],
  [/Treasure Booster/i, "Treasure Booster"],
];

function classifySegment(cardName) {
  const parens = cardName?.match(/\(([^)]+)\)/g) ?? [];
  if (parens.length === 0) return "Other";
  const haystack = parens.join(" ");
  for (const [re, label] of SEGMENT_RULES) {
    if (re.test(haystack)) return label;
  }
  return "Other";
}

function segmentSlug(segment) {
  return segment.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function promoSyntheticId(card) {
  const cardNumber = nullIfNullStr(card.card_set_id);
  if (!cardNumber) return null;
  return `${cardNumber}-${segmentSlug(classifySegment(card.card_name))}`;
}

function arrayText(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.filter(Boolean).map(String).join(" ");
}

function expectedRow(rawCard, source, setByCode) {
  const cardNumber = nullIfNullStr(rawCard.card_set_id);
  const sourceImageId =
    nullIfNullStr(rawCard.card_image_id) ??
    (source.kind === "promo" ? promoSyntheticId(rawCard) : null);
  const setCode =
    source.kind === "promo"
      ? prefixFromCardNumber(cardNumber) ?? "P"
      : source.endpointCode;
  const set = setByCode.get(setCode);
  if (!sourceImageId || !set) return null;

  const color = nullIfNullStr(rawCard.card_color);
  const types = nullIfNullStr(rawCard.sub_types);
  const imageUrl =
    nullIfNullStr(rawCard.card_image) ??
    (source.kind === "promo" && cardNumber ? `${OPT_IMAGE_BASE}/${cardNumber}.jpg` : null);
  const trigger = nullIfNullStr(rawCard.trigger ?? rawCard.card_trigger);
  const override = bandaiBaseOverride(rawCard);

  return {
    card_image_id: sourceImageId,
    card_number: cardNumber,
    name: normText(rawCard.card_name),
    name_base: nameBase(rawCard.card_name),
    variant_label: override ? override.variantLabel : expectedVariantLabel(rawCard.card_name),
    set_id: set.id,
    rarity: override?.rarity ?? expectedRarity(rawCard),
    card_type: nullIfNullStr(rawCard.card_type),
    color: color ? [color] : null,
    power: toInt(rawCard.card_power),
    counter: toInt(rawCard.counter_amount),
    life: toInt(rawCard.life),
    cost: toInt(rawCard.card_cost),
    attribute: nullIfNullStr(rawCard.attribute),
    types: types ? [types] : null,
    effect: normText(rawCard.card_text),
    trigger,
    image_url: imageUrl,
  };
}

function comparable(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(" ");
  if (value === undefined) return null;
  return value;
}

function diffRow(existing, expected) {
  if (!existing) return ["missing"];
  const fields = [
    "card_number",
    "name",
    "name_base",
    "variant_label",
    "set_id",
    "rarity",
    "card_type",
    "color",
    "power",
    "counter",
    "life",
    "cost",
    "attribute",
    "types",
    "effect",
    "trigger",
    "image_url",
  ];
  const changed = [];
  for (const field of fields) {
    const a = comparable(existing[field]);
    const b = comparable(expected[field]);
    if (b === null || b === undefined) continue;
    if (a !== b) changed.push(field);
  }
  return changed;
}

function rowKey(row) {
  return [
    row.card_number,
    row.name,
    row.variant_label,
    row.set_id,
    row.rarity,
    row.card_type,
    arrayText(row.color),
    row.power,
    row.counter,
    row.life,
    row.cost,
    row.attribute,
    arrayText(row.types),
    row.effect,
    row.trigger,
    row.image_url,
  ].map((value) => JSON.stringify(value ?? null)).join("|");
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

function sample(rows, count = 100) {
  return rows.slice(0, count);
}

async function main() {
  console.log("Loading Supabase sets/cards...");
  const [dbSets, dbCards] = await Promise.all([
    sbFetchAll("sets?select=id,slug,code,name,card_count,series"),
    sbFetchAll("cards?select=id,card_image_id,card_number,name,name_base,variant_label,set_id,rarity,card_type,color,power,counter,life,cost,attribute,types,effect,trigger,image_url,tcg_product_id,image_url_small"),
  ]);

  const setByCode = new Map();
  for (const set of dbSets) {
    if (!set.code) continue;
    const code = String(set.code).toUpperCase();
    const previous = setByCode.get(code);
    if (!previous || (Number(set.card_count) || 0) > (Number(previous.card_count) || 0)) {
      setByCode.set(code, set);
    }
  }
  const setById = new Map(dbSets.map((set) => [set.id, set]));
  const dbByImageId = new Map(dbCards.filter((card) => card.card_image_id).map((card) => [card.card_image_id, card]));

  console.log("Fetching optcgapi indexes...");
  const [optSets, optDecks, promos] = await Promise.all([
    optJson("/allSets/"),
    optJson("/allDecks/"),
    optJson("/allPromos/"),
  ]);

  const sources = [];
  for (const set of optSets) {
    sources.push({
      kind: "set",
      apiId: set.set_id,
      endpoint: `/sets/${set.set_id}/`,
      endpointCode: endpointCodeFromSet(set),
      name: set.set_name,
    });
  }
  for (const deck of optDecks) {
    sources.push({
      kind: "deck",
      apiId: deck.structure_deck_id,
      endpoint: `/decks/${deck.structure_deck_id}/`,
      endpointCode: endpointCodeFromSet(deck),
      name: deck.structure_deck_name,
    });
  }
  sources.push({
    kind: "promo",
    apiId: "P",
    endpoint: "/allPromos/",
    endpointCode: "P",
    name: "One Piece Promotion Cards",
    preloadedCards: promos.filter((card) => !looksGarbledPromo(card)),
  });

  const desiredById = new Map();
  const duplicateSourceConflicts = [];
  const sourceRows = [];
  const skipped = [];
  const perSource = [];

  console.log(`Fetching ${sources.length} optcgapi card collections...`);
  for (const source of sources) {
    if (SETS_FILTER && source.kind !== "promo" && !SETS_FILTER.includes(source.endpointCode)) {
      continue;
    }

    let cards = source.preloadedCards ?? [];
    let fetchError = null;
    if (!source.preloadedCards) {
      try {
        cards = await optJson(source.endpoint);
      } catch (error) {
        fetchError = error instanceof Error ? error.message : String(error);
      }
    }

    let candidates = 0;
    for (const rawCard of cards) {
      const expected = expectedRow(rawCard, source, setByCode);
      if (!expected) {
        skipped.push([source.kind, source.apiId, rawCard.card_image_id ?? "", rawCard.card_set_id ?? "", rawCard.card_name ?? "", "unroutable"]);
        continue;
      }
      if (
        source.kind === "promo" &&
        !dbByImageId.has(expected.card_image_id) &&
        expected.card_number &&
        dbByImageId.has(expected.card_number)
      ) {
        skipped.push([
          source.kind,
          source.apiId,
          expected.card_image_id,
          expected.card_number,
          expected.name,
          "promo_fallback_exists",
        ]);
        continue;
      }
      candidates++;
      const existing = desiredById.get(expected.card_image_id);
      if (existing && rowKey(existing.row) !== rowKey(expected)) {
        duplicateSourceConflicts.push({
          cardImageId: expected.card_image_id,
          previous: existing,
          next: { source, row: expected },
        });
        continue;
      }
      desiredById.set(expected.card_image_id, { source, row: expected });
      sourceRows.push({ source, row: expected });
    }

    perSource.push({
      source,
      fetched: cards.length,
      candidates,
      fetchError,
    });
  }

  const safeRows = [];
  const inserts = [];
  const updates = [];
  const noOps = [];
  const fieldCounts = {};

  for (const { source, row } of desiredById.values()) {
    const conflict = duplicateSourceConflicts.some((item) => item.cardImageId === row.card_image_id);
    if (conflict) continue;

    const existing = dbByImageId.get(row.card_image_id);
    const changed = diffRow(existing, row);
    if (changed.length === 0) {
      noOps.push({ source, row, changed });
      continue;
    }

    safeRows.push(row);
    if (!existing) inserts.push({ source, row, changed });
    else updates.push({ source, row, existing, changed });
    for (const field of changed) {
      fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
    }
  }

  const report = [];
  report.push("# optcgapi Catalog Cleanup Report");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["DB cards read", dbCards.length],
      ["optcgapi source collections", sources.length],
      ["optcgapi source rows fetched", perSource.reduce((sum, row) => sum + row.fetched, 0)],
      ["Routable desired rows", desiredById.size],
      ["Rows to insert", inserts.length],
      ["Rows to update", updates.length],
      ["Rows unchanged", noOps.length],
      ["Rows skipped for duplicate source conflict", duplicateSourceConflicts.length],
      ["Rows skipped unroutable", skipped.length],
    ]
  ));
  report.push("");

  report.push("## Changed Fields");
  report.push("");
  report.push(mdTable(
    ["Field", "Rows"],
    Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).map(([field, count]) => [field, count])
  ));
  report.push("");

  report.push("## Per Source");
  report.push("");
  report.push(mdTable(
    ["Kind", "API ID", "Expected Set", "Name", "Fetched", "Candidates", "Fetch Error"],
    perSource.map((row) => [
      row.source.kind,
      row.source.apiId,
      row.source.kind === "promo" ? "prefix/P" : row.source.endpointCode,
      row.source.name,
      row.fetched,
      row.candidates,
      row.fetchError ?? "",
    ])
  ));
  report.push("");

  report.push("## Insert Samples");
  report.push("");
  report.push(mdTable(
    ["Kind", "Set", "card_image_id", "Card #", "Name", "Rarity", "Variant"],
    sample(inserts).map(({ source, row }) => [
      source.kind,
      setById.get(row.set_id)?.code ?? "",
      row.card_image_id,
      row.card_number,
      row.name,
      row.rarity,
      row.variant_label ?? "",
    ])
  ));
  report.push("");

  report.push("## Update Samples");
  report.push("");
  report.push(mdTable(
    ["Kind", "Set", "card_image_id", "Card #", "Name", "Changed Fields"],
    sample(updates).map(({ source, row, changed }) => [
      source.kind,
      setById.get(row.set_id)?.code ?? "",
      row.card_image_id,
      row.card_number,
      row.name,
      changed.join(", "),
    ])
  ));
  report.push("");

  if (duplicateSourceConflicts.length > 0) {
    report.push("## Duplicate Source Conflicts");
    report.push("");
    report.push(mdTable(
      ["card_image_id", "Previous Source", "Next Source", "Previous Name", "Next Name"],
      sample(duplicateSourceConflicts).map((item) => [
        item.cardImageId,
        `${item.previous.source.kind}:${item.previous.source.apiId}`,
        `${item.next.source.kind}:${item.next.source.apiId}`,
        item.previous.row.name,
        item.next.row.name,
      ])
    ));
    report.push("");
  }

  if (skipped.length > 0) {
    report.push("## Skipped Samples");
    report.push("");
    report.push(mdTable(["Kind", "API ID", "card_image_id", "Card #", "Name", "Reason"], sample(skipped)));
    report.push("");
  }

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Rows to insert: ${inserts.length}`);
  console.log(`Rows to update: ${updates.length}`);
  console.log(`Rows skipped for duplicate source conflict: ${duplicateSourceConflicts.length}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write optcg catalog fields.");
    return;
  }

  console.log("Applying optcg catalog upserts...");
  await sbUpsert("cards", safeRows, "card_image_id");
  console.log("Apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
