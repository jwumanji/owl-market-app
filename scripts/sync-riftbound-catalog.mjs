// Riftbound catalog sync via Riftcodex.
//
// Default mode is a dry run and writes riftbound-catalog-sync-report.md.
// Use --apply to write source records, sets, and cards.
// Image URL writes are disabled by default; use --include-images only after
// OWL-15 confirms production asset usage approval.

import crypto from "node:crypto";
import fs from "node:fs";

import {
  RIFTBOUND_GAME_SLUG,
  RIFTCODEX_PROVIDER,
  cardExternalIdRows,
  externalCardId,
  normalizeRiftcodexCard,
  normalizeRiftcodexSet,
  rawSourceRecord,
  setExternalIdRows,
  validateNormalizedCard,
  validateNormalizedSet,
} from "./tcg/riftcodex-normalize.mjs";

const RIFTCODEX_BASE = "https://api.riftcodex.com";
const REPORT_PATH = readArg("--report") ?? "riftbound-catalog-sync-report.md";
const APPLY = process.argv.includes("--apply");
const INCLUDE_IMAGES = process.argv.includes("--include-images");
const PAGE_SIZE = Number.parseInt(readArg("--page-size") ?? "100", 10);
const MIN_DELAY_MS = Number.parseInt(readArg("--delay-ms") ?? "250", 10);
const MAX_RETRIES = Number.parseInt(readArg("--max-retries") ?? "4", 10);
const SETS_FILTER = readArg("--sets")
  ?.split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

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
const HAS_DB = Boolean(SUPABASE_URL && SUPABASE_KEY);

if (APPLY && !HAS_DB) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function sbFetchMaybeSingle(path) {
  const rows = await sbFetchAll(path, 1);
  return rows[0] ?? null;
}

async function sbUpsert(table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
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

async function sbInsert(table, rows, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`Supabase insert ${table} failed: ${res.status} ${await res.text()}`);
    }
  }
}

async function sbPatchById(table, id, patch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase patch ${table}/${id} failed: ${res.status} ${await res.text()}`);
  }
}

async function riftcodexJson(path, attempt = 0) {
  const url = `${RIFTCODEX_BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * (attempt + 1);
    await sleep(delay);
    return riftcodexJson(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Riftcodex ${path} failed: ${res.status} ${await res.text()}`);
  }
  return {
    body: await res.json(),
    headers: {
      contentType: res.headers.get("content-type"),
      cfCacheStatus: res.headers.get("cf-cache-status"),
      railwayRequestId: res.headers.get("x-railway-request-id"),
      retryAfter: res.headers.get("retry-after"),
    },
  };
}

function stableHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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

function stableComparable(value) {
  if (Array.isArray(value)) return value.map(stableComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableComparable(nested)])
    );
  }
  return value;
}

function comparable(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(stableComparable(value));
  }
  if (value === undefined) return null;
  return value;
}

function diffRow(existing, expected, fields) {
  if (!existing) return ["missing"];
  const changed = [];
  for (const field of fields) {
    const next = comparable(expected[field]);
    if (next === null || next === undefined) continue;
    if (comparable(existing[field]) !== next) changed.push(field);
  }
  return changed;
}

function duplicateKeys(rows, keyFn) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return Array.from(duplicates).sort();
}

function sample(rows, count = 25) {
  return rows.slice(0, count);
}

async function fetchSourceCatalog() {
  console.log("Fetching Riftcodex sets...");
  const setsResponse = await riftcodexJson(`/sets?size=${PAGE_SIZE}`);
  if (!Array.isArray(setsResponse.body?.items)) {
    throw new Error("Riftcodex sets response did not include items[]");
  }

  const rawSets = setsResponse.body.items.filter((set) => {
    const code = String(set?.set_id ?? "").toUpperCase();
    return !SETS_FILTER || SETS_FILTER.includes(code);
  });

  const rawCards = [];
  const perSet = [];
  for (const set of rawSets) {
    const setCode = String(set.set_id).toLowerCase();
    let page = 1;
    let fetched = 0;
    let expectedPages = 1;
    while (page <= expectedPages) {
      const path = `/cards?size=${PAGE_SIZE}&page=${page}&set_id=${encodeURIComponent(setCode)}&sort=collector_number`;
      const cardResponse = await riftcodexJson(path);
      const body = cardResponse.body;
      if (!Array.isArray(body?.items)) {
        throw new Error(`Riftcodex cards response for ${setCode} page ${page} did not include items[]`);
      }
      expectedPages = Number.parseInt(body.pages ?? "1", 10);
      fetched += body.items.length;
      rawCards.push(...body.items);
      page++;
      if (MIN_DELAY_MS > 0) await sleep(MIN_DELAY_MS);
    }
    perSet.push({
      setCode: String(set.set_id).toUpperCase(),
      name: set.name,
      expectedCards: set.card_count,
      fetched,
      pages: expectedPages,
    });
  }

  const rarityResponse = await riftcodexJson("/index/rarities");
  return { rawSets, rawCards, perSet, setsHeaders: setsResponse.headers, rarityBody: rarityResponse.body };
}

function buildRawRecords(rawSets, rawCards, rarityBody, gameId = null) {
  const records = [];
  for (const rawSet of rawSets) {
    records.push(rawSourceRecord({
      gameId,
      recordType: "set",
      externalId: String(rawSet.set_id).toUpperCase(),
      sourceUpdatedAt: rawSet.published_on ?? null,
      payload: rawSet,
      hash: stableHash(rawSet),
    }));
  }
  for (const rawCard of rawCards) {
    records.push(rawSourceRecord({
      gameId,
      recordType: "card",
      externalId: externalCardId(rawCard),
      parentExternalId: String(rawCard?.set?.set_id ?? "").toUpperCase() || null,
      sourceUpdatedAt: rawCard?.metadata?.updated_on ?? null,
      payload: rawCard,
      hash: stableHash(rawCard),
    }));
  }
  records.push(rawSourceRecord({
    gameId,
    recordType: "rarity_index",
    externalId: "rarities",
    payload: rarityBody,
    hash: stableHash(rarityBody),
  }));
  return records;
}

async function loadDbSnapshot() {
  if (!HAS_DB) {
    return {
      game: null,
      dbSets: [],
      dbCards: [],
      dbRarities: [],
      dbVariants: [],
      dbSetTypes: [],
      warnings: ["Supabase env is missing; database comparison is disabled."],
    };
  }

  console.log("Loading Supabase Riftbound game scope...");
  const game = await sbFetchMaybeSingle(
    `games?select=id,slug,name,is_active,is_public,metadata&slug=eq.${encodeURIComponent(RIFTBOUND_GAME_SLUG)}`
  );
  if (!game) {
    return {
      game: null,
      dbSets: [],
      dbCards: [],
      dbRarities: [],
      dbVariants: [],
      dbSetTypes: [],
      warnings: ["Riftbound game row is missing. Run the v35 support migration before --apply."],
    };
  }

  console.log("Loading Supabase Riftbound sets/cards/taxonomies...");
  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;
  const [dbSets, dbCards, dbRarities, dbVariants, dbSetTypes] = await Promise.all([
    sbFetchAll(`sets?select=id,game_id,slug,code,name,series,year,release_date,card_count,tcg_set_id,set_type_id&${gameFilter}`),
    sbFetchAll(`cards?select=id,game_id,card_image_id,card_number,name,name_base,variant_label,set_id,rarity,rarity_id,variant_id,card_type,color,power,cost,attribute,types,effect,artist,image_url,tcg_product_id,game_payload&${gameFilter}`),
    sbFetchAll(`game_rarities?select=id,code,name&${gameFilter}`),
    sbFetchAll(`game_variants?select=id,code,name&${gameFilter}`),
    sbFetchAll(`game_set_types?select=id,code,name&${gameFilter}`),
  ]);
  return { game, dbSets, dbCards, dbRarities, dbVariants, dbSetTypes, warnings: [] };
}

function idMapByCode(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.code) map.set(String(row.code).toUpperCase(), row.id);
    if (row.name) map.set(String(row.name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, ""), row.id);
  }
  return map;
}

function filterAmbiguousExternalRows(rows, ownerLabel) {
  const byProviderExternal = new Map();
  const missing = [];
  for (const row of rows) {
    if (!row?.game_id || !row?.provider || !row?.external_id || !row?.[`${ownerLabel}_id`]) {
      missing.push(row);
      continue;
    }
    const key = `${row.game_id}|${row.provider}|${row.external_id}`;
    if (!byProviderExternal.has(key)) byProviderExternal.set(key, []);
    byProviderExternal.get(key).push(row);
  }

  const valid = [];
  const skipped = [...missing.map((row) => ({
    owner: ownerLabel,
    provider: row?.provider ?? "",
    external_id: row?.external_id ?? "",
    reason: "missing database owner id",
  }))];

  for (const [key, grouped] of byProviderExternal.entries()) {
    if (grouped.length === 1) {
      valid.push(grouped[0]);
      continue;
    }
    for (const row of grouped) {
      skipped.push({
        owner: ownerLabel,
        provider: row.provider,
        external_id: row.external_id,
        reason: `duplicate provider external id (${key})`,
      });
    }
  }

  return { valid, skipped };
}

function buildExternalIdPlan({ game, normalizedSets, normalizedCards, dbSets, dbCards }) {
  const gameId = game?.id ?? null;
  const dbSetBySlug = new Map(dbSets.map((set) => [set.slug, set]));
  const dbCardByImageId = new Map(dbCards.map((card) => [card.card_image_id, card]));

  const setCandidates = normalizedSets.flatMap((set) => setExternalIdRows(set, {
    gameId,
    setId: dbSetBySlug.get(set.slug)?.id ?? null,
  }));
  const cardCandidates = normalizedCards.flatMap((card) => cardExternalIdRows(card, {
    gameId,
    cardId: dbCardByImageId.get(card.dbRow.card_image_id)?.id ?? null,
  }));

  const sets = filterAmbiguousExternalRows(setCandidates, "set");
  const cards = filterAmbiguousExternalRows(cardCandidates, "card");
  return {
    setRows: sets.valid,
    cardRows: cards.valid,
    skippedRows: [...sets.skipped, ...cards.skipped],
  };
}

function buildPlan({
  rawSets,
  rawCards,
  game = null,
  dbSets,
  dbCards,
  dbRarities = [],
  dbVariants = [],
  dbSetTypes = [],
  setIdByExternalId = new Map(),
}) {
  const gameId = game?.id ?? null;
  const rarityIdByCode = idMapByCode(dbRarities);
  const variantIdByCode = idMapByCode(dbVariants);
  const setTypeIdByCode = idMapByCode(dbSetTypes);

  const normalizedSets = rawSets.map((set) => normalizeRiftcodexSet(set, {
    gameId,
    setTypeIdByCode,
  }));
  const normalizedCards = rawCards.map((card) => normalizeRiftcodexCard(card, {
    gameId,
    includeImages: INCLUDE_IMAGES,
    setIdByExternalId,
    rarityIdByCode,
    variantIdByCode,
  }));

  const invalidSets = normalizedSets.flatMap((set) => {
    const errors = validateNormalizedSet(set);
    return errors.length ? [{ key: set.externalSetId ?? "", errors: errors.join(", ") }] : [];
  });
  const invalidCards = normalizedCards.flatMap((card) => {
    const errors = validateNormalizedCard(card);
    return errors.length ? [{ key: card.externalCardId ?? "", errors: errors.join(", ") }] : [];
  });

  const setDuplicates = duplicateKeys(normalizedSets, (set) => set.slug);
  const cardDuplicates = duplicateKeys(normalizedCards, (card) => card.dbRow.card_image_id);

  const dbSetBySlug = new Map(dbSets.map((set) => [set.slug, set]));
  const dbCardByImageId = new Map(dbCards.map((card) => [card.card_image_id, card]));
  const setFields = ["game_id", "code", "name", "series", "year", "release_date", "card_count", "tcg_set_id", "set_type_id"];
  const cardFields = [
    "game_id",
    "card_number",
    "name",
    "name_base",
    "variant_label",
    "set_id",
    "rarity",
    "rarity_id",
    "variant_id",
    "card_type",
    "color",
    "power",
    "cost",
    "attribute",
    "types",
    "effect",
    "artist",
    "image_url",
    "tcg_product_id",
    "game_payload",
  ];

  const setChanges = normalizedSets.map((set) => ({
    normalized: set,
    existing: dbSetBySlug.get(set.slug) ?? null,
    changed: diffRow(dbSetBySlug.get(set.slug), set.dbRow, setFields),
  }));
  const cardChanges = normalizedCards.map((card) => ({
    normalized: card,
    existing: dbCardByImageId.get(card.dbRow.card_image_id) ?? null,
    changed: diffRow(dbCardByImageId.get(card.dbRow.card_image_id), card.dbRow, cardFields),
  }));

  return {
    game,
    normalizedSets,
    normalizedCards,
    invalidSets,
    invalidCards,
    setDuplicates,
    cardDuplicates,
    setChanges,
    cardChanges,
    externalIds: buildExternalIdPlan({ game, normalizedSets, normalizedCards, dbSets, dbCards }),
  };
}

function writeReport({ mode, source, rawRecords, plan, applied = false }) {
  const setInserts = plan.setChanges.filter((row) => row.changed.includes("missing"));
  const setUpdates = plan.setChanges.filter((row) => row.changed.length > 0 && !row.changed.includes("missing"));
  const cardInserts = plan.cardChanges.filter((row) => row.changed.includes("missing"));
  const cardUpdates = plan.cardChanges.filter((row) => row.changed.length > 0 && !row.changed.includes("missing"));
  const warnings = source.warnings ?? [];

  const report = [];
  report.push("# Riftbound Catalog Sync Report");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Mode: ${mode}`);
  report.push(`Applied: ${applied ? "yes" : "no"}`);
  report.push(`Provider: ${RIFTCODEX_PROVIDER}`);
  report.push(`Game: ${RIFTBOUND_GAME_SLUG}`);
  report.push(`Supabase game row: ${plan.game ? `${plan.game.name} (${plan.game.id})` : "missing"}`);
  report.push(`Image writes: ${INCLUDE_IMAGES ? "enabled" : "disabled"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["Source sets fetched", source.rawSets.length],
      ["Source cards fetched", source.rawCards.length],
      ["Raw source records", rawRecords.length],
      ["Set inserts", setInserts.length],
      ["Set updates", setUpdates.length],
      ["Set unchanged", plan.setChanges.length - setInserts.length - setUpdates.length],
      ["Card inserts", cardInserts.length],
      ["Card updates", cardUpdates.length],
      ["Card unchanged", plan.cardChanges.length - cardInserts.length - cardUpdates.length],
      ["Set external ID rows", plan.externalIds.setRows.length],
      ["Card external ID rows", plan.externalIds.cardRows.length],
      ["Skipped external ID rows", plan.externalIds.skippedRows.length],
      ["Invalid sets", plan.invalidSets.length],
      ["Invalid cards", plan.invalidCards.length],
      ["Duplicate set keys", plan.setDuplicates.length],
      ["Duplicate card keys", plan.cardDuplicates.length],
    ]
  ));
  report.push("");

  if (warnings.length) {
    report.push("## Warnings");
    report.push("");
    for (const warning of warnings) report.push(`- ${warning}`);
    report.push("");
  }

  report.push("## Per Set");
  report.push("");
  report.push(mdTable(
    ["Set", "Name", "Expected Cards", "Fetched", "Pages"],
    source.perSet.map((row) => [row.setCode, row.name, row.expectedCards, row.fetched, row.pages])
  ));
  report.push("");
  report.push("## Card Insert Samples");
  report.push("");
  report.push(mdTable(
    ["Card Key", "Card #", "Name", "Rarity", "Variant", "Set"],
    sample(cardInserts).map(({ normalized }) => [
      normalized.dbRow.card_image_id,
      normalized.dbRow.card_number,
      normalized.dbRow.name,
      normalized.dbRow.rarity,
      normalized.dbRow.variant_label ?? "",
      normalized.externalSetId,
    ])
  ));
  report.push("");
  report.push("## Card Update Samples");
  report.push("");
  report.push(mdTable(
    ["Card Key", "Card #", "Name", "Changed Fields"],
    sample(cardUpdates).map(({ normalized, changed }) => [
      normalized.dbRow.card_image_id,
      normalized.dbRow.card_number,
      normalized.dbRow.name,
      changed.join(", "),
    ])
  ));
  report.push("");

  if (plan.invalidSets.length || plan.invalidCards.length || plan.setDuplicates.length || plan.cardDuplicates.length) {
    report.push("## Blocking Issues");
    report.push("");
    report.push(mdTable(
      ["Type", "Key", "Details"],
      [
        ...plan.invalidSets.map((row) => ["invalid_set", row.key, row.errors]),
        ...plan.invalidCards.map((row) => ["invalid_card", row.key, row.errors]),
        ...plan.setDuplicates.map((key) => ["duplicate_set", key, "duplicate normalized set slug"]),
        ...plan.cardDuplicates.map((key) => ["duplicate_card", key, "duplicate normalized card key"]),
      ]
    ));
    report.push("");
  }

  if (plan.externalIds.skippedRows.length) {
    report.push("## Skipped External IDs");
    report.push("");
    report.push(mdTable(
      ["Owner", "Provider", "External ID", "Reason"],
      sample(plan.externalIds.skippedRows, 50).map((row) => [
        row.owner,
        row.provider,
        row.external_id,
        row.reason,
      ])
    ));
    report.push("");
  }

  report.push("## Source Headers");
  report.push("");
  report.push(mdTable(
    ["Header", "Value"],
    Object.entries(source.setsHeaders).map(([key, value]) => [key, value ?? ""])
  ));
  report.push("");

  if (!INCLUDE_IMAGES) {
    report.push("## Image Gate");
    report.push("");
    report.push("Image URLs were read from Riftcodex but not written to card rows. Re-run with `--include-images` only after OWL-15 approves production asset usage.");
    report.push("");
  }

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
}

function assertPlanCanApply(plan, options = {}) {
  const blockers = [
    ...plan.invalidSets,
    ...plan.invalidCards,
    ...plan.setDuplicates.map((key) => ({ key, errors: "duplicate set key" })),
    ...plan.cardDuplicates.map((key) => ({ key, errors: "duplicate card key" })),
  ];
  if (options.requireGame && !plan.game?.id) {
    blockers.push({ key: RIFTBOUND_GAME_SLUG, errors: "missing games row" });
  }
  if (options.requireSetTypeIds) {
    for (const set of plan.normalizedSets) {
      if (!set.dbRow.game_id) blockers.push({ key: set.externalSetId ?? "", errors: "missing game_id" });
      if (!set.dbRow.set_type_id) blockers.push({ key: set.externalSetId ?? "", errors: `missing set_type_id for ${set.setTypeCode}` });
    }
  }
  if (options.requireCardTaxonomyIds) {
    for (const card of plan.normalizedCards) {
      if (!card.dbRow.game_id) blockers.push({ key: card.externalCardId ?? "", errors: "missing game_id" });
      if (!card.dbRow.rarity_id) blockers.push({ key: card.externalCardId ?? "", errors: `missing rarity_id for ${card.rarityCode}` });
      if (!card.dbRow.variant_id) blockers.push({ key: card.externalCardId ?? "", errors: `missing variant_id for ${card.variantCode}` });
      if (options.requireCardSetIds && !card.dbRow.set_id) {
        blockers.push({ key: card.externalCardId ?? "", errors: `missing set_id for ${card.externalSetId}` });
      }
    }
  }
  if (blockers.length > 0) {
    throw new Error(`Refusing to apply with ${blockers.length} validation blockers`);
  }
}

async function applyCatalogRowChanges(table, changes) {
  const inserts = changes
    .filter((row) => row.changed.includes("missing"))
    .map((row) => row.normalized.dbRow);
  const updates = changes.filter((row) => (
    row.changed.length > 0 &&
    !row.changed.includes("missing") &&
    row.existing?.id
  ));

  await sbInsert(table, inserts);
  for (const row of updates) {
    await sbPatchById(table, row.existing.id, row.normalized.dbRow);
  }

  return { inserts: inserts.length, updates: updates.length };
}

async function main() {
  const source = await fetchSourceCatalog();
  const initialDb = await loadDbSnapshot();
  const sourceWithInitialDb = { ...source, warnings: initialDb.warnings };
  const rawRecords = buildRawRecords(source.rawSets, source.rawCards, source.rarityBody, initialDb.game?.id ?? null);
  const initialPlan = buildPlan({ ...source, ...initialDb });
  writeReport({ mode: APPLY ? "apply-preview" : "dry-run", source: sourceWithInitialDb, rawRecords, plan: initialPlan });

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply after the v35 Riftbound support migration is applied.");
    return;
  }

  assertPlanCanApply(initialPlan, {
    requireGame: true,
    requireSetTypeIds: true,
    requireCardTaxonomyIds: true,
  });
  console.log("Applying raw source records...");
  await sbUpsert("tcg_source_records", rawRecords, "game_id,provider,record_type,external_id");

  console.log("Applying Riftbound set changes...");
  await applyCatalogRowChanges("sets", initialPlan.setChanges);

  const dbAfterSets = await loadDbSnapshot();
  const setIdByExternalId = new Map();
  for (const normalizedSet of initialPlan.normalizedSets) {
    const dbSet = dbAfterSets.dbSets.find((set) => set.slug === normalizedSet.slug);
    if (dbSet?.id) setIdByExternalId.set(normalizedSet.externalSetId, dbSet.id);
  }

  const applyPlan = buildPlan({ ...source, ...dbAfterSets, setIdByExternalId });
  assertPlanCanApply(applyPlan, {
    requireGame: true,
    requireSetTypeIds: true,
    requireCardTaxonomyIds: true,
    requireCardSetIds: true,
  });

  console.log("Applying Riftbound card changes...");
  await applyCatalogRowChanges("cards", applyPlan.cardChanges);

  const dbAfterCards = await loadDbSnapshot();
  const finalPlan = buildPlan({ ...source, ...dbAfterCards, setIdByExternalId });
  console.log("Applying Riftbound set external IDs...");
  await sbUpsert("set_external_ids", finalPlan.externalIds.setRows, "game_id,provider,external_id");

  console.log("Applying Riftbound card external IDs...");
  await sbUpsert("card_external_ids", finalPlan.externalIds.cardRows, "game_id,provider,external_id");

  writeReport({ mode: "apply", source: { ...source, warnings: dbAfterCards.warnings }, rawRecords, plan: finalPlan, applied: true });
  console.log("Apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
