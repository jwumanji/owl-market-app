// Private, idempotent Disney Lorcana staging import.
//
// Default mode is a read-only dry run. --apply persists canonical catalog rows,
// replayable raw source records, exact external IDs, and reconciliation
// candidates. It never publishes prices and never writes card image_url.

import crypto from "node:crypto";
import fs from "node:fs";

import {
  LORCANAJSON_ALL_CARDS_URL,
  LORCANA_DB_SLUG,
  LORCANA_JUSTTCG_GAME_SLUG,
  justTcgLorcanaCardExternalId,
  justTcgLorcanaSourceUpdatedAt,
  lorcanaDefinitionSourceId,
  lorcanaSetSlug,
  lorcanaTaxonomyCode,
  lorcanaVariantCode,
  matchLorcanaJustTcgCards,
  matchLorcanaJustTcgSet,
  normalizeLorcanaJsonCard,
} from "../src/lib/games/lorcana.ts";

const APPLY = process.argv.includes("--apply");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const EXPECT_PUBLIC_CATALOG = process.argv.includes("--expect-public-catalog");
const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const MAX_RETRIES = 6;
const LORCANA_PAYLOAD_SCHEMA = "lorcana.card.v1";
const LORCANA_ADAPTER = "lorcanajson_v1_lorcana_staged";
const JUSTTCG_ADAPTER = "justtcg_v1_lorcana_staged";
const CHUNK_SIZE = 100;

function readArg(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function loadEnvFile(path) {
  if (!path || !fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 0) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(readArg("--env-file") ?? ".env.local");

const JUSTTCG_KEY = process.env.JUSTTCG_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!JUSTTCG_KEY) throw new Error("JUSTTCG_API_KEY is required");
if ((APPLY || VERIFY_ONLY) && (!SUPABASE_URL || !SUPABASE_KEY)) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function stableHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function sourceTimestamp(value) {
  if (!value) return null;
  const withZone = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
  const parsed = new Date(withZone);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
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
  return value === undefined ? null : value;
}

function changedFields(existing, expected, fields) {
  if (!existing) return ["missing"];
  return fields.filter(
    (field) =>
      JSON.stringify(stableComparable(existing[field])) !==
      JSON.stringify(stableComparable(expected[field]))
  );
}

async function jsonResponse(url, init = {}, attempt = 0) {
  const response = await fetch(url, init);
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number.parseFloat(response.headers.get("retry-after") ?? "");
    const delay = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : Math.min(30_000, 1000 * 2 ** attempt);
    await wait(Math.max(1000, delay));
    return jsonResponse(url, init, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

async function justTcgAll(path) {
  const rows = [];
  let offset = 0;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await jsonResponse(
      `${JUSTTCG_BASE}${path}${separator}limit=100&offset=${offset}`,
      { headers: { "x-api-key": JUSTTCG_KEY } }
    );
    rows.push(...(body.data ?? []));
    if (!(body.meta?.hasMore ?? body.pagination?.hasMore)) break;
    offset += 100;
  }
  return rows;
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
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: restHeaders({ Range: `${from}-${from + pageSize - 1}` }),
    });
    if (!response.ok) {
      throw new Error(`Supabase GET ${path}: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function sbUpsert(table, rows, onConflict, options = {}) {
  const returned = [];
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: "POST",
        headers: restHeaders({
          "Content-Type": "application/json",
          Prefer: `resolution=merge-duplicates,return=${options.returnRows ? "representation" : "minimal"}`,
        }),
        body: JSON.stringify(chunk),
      }
    );
    if (!response.ok) {
      throw new Error(`Supabase upsert ${table}: ${response.status} ${await response.text()}`);
    }
    if (options.returnRows) returned.push(...(await response.json()));
  }
  return returned;
}

async function sbInsert(table, rows, options = {}) {
  const returned = [];
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: restHeaders({
        "Content-Type": "application/json",
        Prefer: `return=${options.returnRows ? "representation" : "minimal"}`,
      }),
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      throw new Error(`Supabase insert ${table}: ${response.status} ${await response.text()}`);
    }
    if (options.returnRows) returned.push(...(await response.json()));
  }
  return returned;
}

async function sbPatch(table, query, patch) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Supabase patch ${table}: ${response.status} ${await response.text()}`);
  }
}

async function fetchSources() {
  console.log("Fetching LorcanaJSON catalog and JustTCG sets...");
  const [document, sets] = await Promise.all([
    jsonResponse(LORCANAJSON_ALL_CARDS_URL),
    justTcgAll(`/sets?game=${encodeURIComponent(LORCANA_JUSTTCG_GAME_SLUG)}`),
  ]);
  if (!document?.metadata || !document?.sets || !Array.isArray(document.cards)) {
    throw new Error("Unexpected LorcanaJSON document shape");
  }

  const perSet = [];
  for (const set of sets) {
    console.log(`Fetching JustTCG set ${set.name}...`);
    const cards = await justTcgAll(
      `/cards?game=${encodeURIComponent(LORCANA_JUSTTCG_GAME_SLUG)}&set=${encodeURIComponent(
        set.id
      )}&include_price_history=false`
    );
    perSet.push({ set, cards });
  }
  return { document, justTcgSets: sets, perSet, justTcgCards: perSet.flatMap((row) => row.cards) };
}

function uniqueValues(cards, select) {
  const counts = new Map();
  for (const card of cards) {
    const value = select(card);
    if (value) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count === 1).map(([value]) => value));
}

function buildPlan(source) {
  const language = source.document.metadata.language;
  const cards = source.document.cards.map((card) => normalizeLorcanaJsonCard(card, language));
  const rawBySourceId = new Map(source.document.cards.map((card) => [String(card.id), card]));
  const cardCounts = new Map();
  for (const card of cards) cardCounts.set(card.setCode, (cardCounts.get(card.setCode) ?? 0) + 1);
  const sets = Object.entries(source.document.sets).map(([code, set]) => ({
    code,
    source: set,
    slug: lorcanaSetSlug(code),
    name: set.name,
    typeCode: String(set.type ?? "").toLowerCase() === "quest" || code.startsWith("Q")
      ? "QUEST"
      : "EXPANSION",
    releaseDate: dateOnly(set.releaseDate),
    cardCount: cardCounts.get(code) ?? 0,
  }));

  const duplicateCardIds = cards
    .map((card) => card.sourceExternalId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  const duplicateSetCodes = sets
    .map((set) => set.code)
    .filter((code, index, all) => all.indexOf(code) !== index);
  const supportedRarities = new Set([
    "COMMON",
    "UNCOMMON",
    "RARE",
    "SUPER_RARE",
    "LEGENDARY",
    "ENCHANTED",
    "EPIC",
    "ICONIC",
    "SPECIAL",
  ]);
  const unsupportedRarities = [
    ...new Set(cards.map((card) => lorcanaTaxonomyCode(card.rarity)).filter((code) => !supportedRarities.has(code))),
  ];
  const missingRequired = cards.filter(
    (card) => !card.sourceExternalId || !card.setCode || !card.fullIdentifier || !card.fullName
  );
  if (duplicateCardIds.length || duplicateSetCodes.length || unsupportedRarities.length || missingRequired.length) {
    throw new Error(
      `Catalog validation failed: duplicateCards=${duplicateCardIds.length}, duplicateSets=${duplicateSetCodes.length}, unsupportedRarities=${unsupportedRarities.join(",")}, missingRequired=${missingRequired.length}`
    );
  }

  const joins = matchLorcanaJustTcgCards(source.justTcgCards, cards);
  const uniqueTcgplayer = uniqueValues(cards, (card) => card.externalIds.tcgplayer);
  const uniqueCardmarket = uniqueValues(cards, (card) => card.externalIds.cardmarket);
  const uniqueCardtrader = uniqueValues(cards, (card) => card.externalIds.cardtrader);
  return {
    ...source,
    cards,
    sets,
    rawBySourceId,
    joins,
    uniqueTcgplayer,
    uniqueCardmarket,
    uniqueCardtrader,
  };
}

async function ensureStagingRows() {
  const existingGames = await sbFetchAll(`games?select=id,metadata&slug=eq.${LORCANA_DB_SLUG}`);
  const gameMetadata = {
    ...(existingGames[0]?.metadata ?? {}),
    route_slug: "lorcana",
    catalog_provider: "lorcanajson",
    catalog_status: "staged",
    pricing_provider: "justtcg",
    pricing_status: "staged_raw_only",
    asset_status: "awaiting_commercial_use_clearance",
    asset_writes_enabled: false,
    publication_status: "disabled",
  };
  await sbUpsert(
    "games",
    [{
      slug: LORCANA_DB_SLUG,
      name: "Disney Lorcana",
      is_active: true,
      is_public: false,
      metadata: gameMetadata,
    }],
    "slug"
  );
  const game = (await sbFetchAll(`games?select=id,slug,name,is_public,metadata&slug=eq.${LORCANA_DB_SLUG}`))[0];
  if (!game?.id) throw new Error("Failed to seed Lorcana game row");

  await sbUpsert(
    "data_providers",
    [{
      code: "lorcanajson",
      name: "LorcanaJSON",
      normalized_api_version: "2.x",
      is_active: true,
      metadata: { unofficial: true, catalog_path: "current/en" },
    }],
    "code"
  );

  const existingEditions = await sbFetchAll(
    `game_editions?select=id,code,is_default&game_id=eq.${game.id}`
  );
  for (const edition of existingEditions) {
    if (edition.is_default && edition.code !== "en-global") {
      await sbPatch("game_editions", `id=eq.${edition.id}`, { is_default: false });
    }
  }
  await sbUpsert(
    "game_editions",
    [{
      game_id: game.id,
      code: "en-global",
      name: "English / Global",
      language_code: "en",
      region_code: null,
      is_default: true,
      metadata: { source: "lorcanajson", catalog_path: "current/en" },
    }],
    "game_id,code"
  );

  const rarities = [
    ["COMMON", "Common"], ["UNCOMMON", "Uncommon"], ["RARE", "Rare"],
    ["SUPER_RARE", "Super Rare"], ["LEGENDARY", "Legendary"],
    ["ENCHANTED", "Enchanted"], ["EPIC", "Epic"], ["ICONIC", "Iconic"],
    ["SPECIAL", "Special"],
  ].map(([code, name], index) => ({
    game_id: game.id, code, name, sort_order: (index + 1) * 10, metadata: { source: "lorcanajson" },
  }));
  const variants = [
    ["STANDARD", "Standard"], ["PROMO", "Promo"],
    ["ALTERNATE_ART", "Alternate Art"], ["OVER_NUMBERED", "Overnumbered"],
  ].map(([code, name], index) => ({
    game_id: game.id, code, name, sort_order: (index + 1) * 10,
    metadata: { source: "lorcanajson", finish_dimension: "preserved_separately" },
  }));
  const setTypes = [
    ["EXPANSION", "Expansion", "expansion"],
    ["QUEST", "Illumineer's Quest", "quest"],
  ].map(([code, name, sourceType], index) => ({
    game_id: game.id, code, name, sort_order: (index + 1) * 10,
    metadata: { source: "lorcanajson", lorcanajson_type: sourceType },
  }));
  await sbUpsert("game_rarities", rarities, "game_id,code");
  await sbUpsert("game_variants", variants, "game_id,code");
  await sbUpsert("game_set_types", setTypes, "game_id,code");

  const authorities = [
    ["ravensburger_lorcana", "card_identity", "monitor", 1, true, { official: true, automation: "manual_diff" }],
    ["ravensburger_lorcana", "card_text", "monitor", 1, true, { official: true, automation: "manual_diff" }],
    ["lorcanajson", "card_identity", "canonical", 10, true, { unofficial: true, language: "en" }],
    ["lorcanajson", "card_text", "canonical", 10, true, { unofficial: true, language: "en" }],
    ["ravensburger_lorcana", "card_asset", "monitor", 1, false, { writes_enabled: false, reason: "commercial_use_clearance_required" }],
    ["lorcanajson", "card_asset", "fallback", 20, false, { writes_enabled: false, reason: "source_urls_are_not_an_asset_license" }],
    ["tcgplayer", "commercial_identity", "commercial", 1, true, { join: "exact_product_id" }],
    ["justtcg", "market_price", "commercial", 1, true, { api_version: "v1", publication_enabled: false }],
    ["lorcast", "reconciliation", "monitor", 10, true, { registration_required: false }],
    ["tcgcsv", "reconciliation", "monitor", 20, true, { registration_required: false, category_id: 71 }],
  ].map(([provider, entity_scope, authority_role, authority_rank, is_active, metadata]) => ({
    game_id: game.id, provider, entity_scope, authority_role, authority_rank, is_active, metadata,
  }));
  await sbUpsert(
    "catalog_source_authorities",
    authorities,
    "game_id,provider,entity_scope"
  );
  await sbUpsert(
    "price_provider_mappings",
    [{
      game_id: game.id,
      provider: "justtcg",
      source_game_slug: LORCANA_JUSTTCG_GAME_SLUG,
      source_set_slug: "",
      product_key_rules: {
        join: "exact_tcgplayer_product_id",
        canonical_key: "lorcanajson.cards[].externalLinks.tcgPlayerId",
        provider_key: "justtcg.cards[].tcgplayerId",
        require_unique_on_both_sides: true,
        unmatched_policy: "quarantine",
        finish_policy: "preserve_provider_printing",
      },
      pricing_capabilities: {
        catalog_raw: true, variant_payloads: true, raw_market_prices: true,
        market_price: false, price_history: false, publish_prices: false,
      },
      is_active: true,
      metadata: { status: "staged", api_version: "v1", publication_enabled: false },
    }],
    "game_id,provider,source_game_slug,source_set_slug"
  );
  return game;
}

async function createIngestRun(gameId, providerCode, values) {
  const provider = (await sbFetchAll(`data_providers?select=id,code&code=eq.${providerCode}`))[0];
  if (!provider?.id) throw new Error(`Missing data provider ${providerCode}`);
  const [run] = await sbInsert(
    "source_ingest_runs",
    [{ game_id: gameId, provider_id: provider.id, status: "running", ...values }],
    { returnRows: true, chunkSize: 1 }
  );
  return run;
}

function rawRecord({ gameId, provider, runId, recordType, externalId, parentExternalId = null, sourceUpdatedAt = null, payload, adapterVersion }) {
  const now = new Date().toISOString();
  return {
    game_id: gameId,
    provider,
    record_type: recordType,
    external_id: externalId,
    parent_external_id: parentExternalId,
    source_updated_at: sourceUpdatedAt,
    fetched_at: now,
    payload_hash: stableHash(payload),
    payload,
    ingest_run_id: runId,
    payload_schema_version: 1,
    adapter_version: adapterVersion,
    is_tombstone: false,
    last_seen_at: now,
    updated_at: now,
  };
}

function gamePayload(card) {
  return {
    schema: LORCANA_PAYLOAD_SCHEMA,
    identity: {
      source_id: card.sourceExternalId,
      base_source_id: card.promo.baseSourceId,
      printing_key: card.printingKey,
      full_identifier: card.fullIdentifier,
      collector_number: card.collectorNumber,
      set_code: card.setCode,
      version: card.version,
      is_promo: card.isPromo,
      promo: card.promo,
    },
    card: {
      type: card.type,
      rarity: card.rarity,
      color_raw: card.colorRaw,
      colors: card.colors,
      foil_types: card.foilTypes,
      artists: card.artists,
    },
    gameplay: card.gameplay,
    legalities: card.legalities,
    allowed_in_tournaments_from_date: card.allowedInTournamentsFromDate,
    commercial: {
      external_ids: card.externalIds,
      external_urls: card.externalUrls,
    },
    media: {
      source_urls: card.imageUrls,
      image_url_deferred: Boolean(card.imageUrls.full),
      asset_writes_enabled: false,
    },
    source: { provider: "lorcanajson", language: card.sourceLanguage },
  };
}

async function applyCatalog(plan, game) {
  const gameId = game.id;
  const [edition] = await sbFetchAll(
    `game_editions?select=id&game_id=eq.${gameId}&code=eq.en-global`
  );
  const [rarities, variants, setTypes, dbSets, dbCards] = await Promise.all([
    sbFetchAll(`game_rarities?select=id,code&game_id=eq.${gameId}`),
    sbFetchAll(`game_variants?select=id,code&game_id=eq.${gameId}`),
    sbFetchAll(`game_set_types?select=id,code&game_id=eq.${gameId}`),
    sbFetchAll(`sets?select=id,slug,code,name,series,year,release_date,card_count,set_type_id&game_id=eq.${gameId}`),
    sbFetchAll(`cards?select=id,card_image_id,card_number,name,name_base,variant_label,set_id,rarity,rarity_id,variant_id,card_type,color,power,life,cost,attribute,types,effect,artist,image_url,tcg_product_id,game_payload&game_id=eq.${gameId}`),
  ]);
  if (!edition?.id) throw new Error("Lorcana English edition is missing");
  const rarityId = new Map(rarities.map((row) => [row.code, row.id]));
  const variantId = new Map(variants.map((row) => [row.code, row.id]));
  const setTypeId = new Map(setTypes.map((row) => [row.code, row.id]));

  const expectedSets = plan.sets.map((set) => ({
    game_id: gameId,
    slug: set.slug,
    code: set.code,
    name: set.name,
    series: "Disney Lorcana",
    year: set.releaseDate ? Number(set.releaseDate.slice(0, 4)) : null,
    release_date: set.releaseDate,
    card_count: set.cardCount,
    color: null,
    tcg_set_id: null,
    set_type_id: setTypeId.get(set.typeCode) ?? null,
  }));
  if (expectedSets.some((set) => !set.slug || !set.set_type_id)) {
    throw new Error("Set normalization is missing slug or taxonomy IDs");
  }
  const dbSetBySlug = new Map(dbSets.map((set) => [set.slug, set]));
  const setFields = ["code", "name", "series", "year", "release_date", "card_count", "set_type_id"];
  const setInserts = expectedSets.filter((row) => !dbSetBySlug.has(row.slug));
  const setUpdates = expectedSets.filter((row) => changedFields(dbSetBySlug.get(row.slug), row, setFields).length);
  await sbInsert("sets", setInserts);
  for (const row of setUpdates) {
    const existing = dbSetBySlug.get(row.slug);
    if (existing) await sbPatch("sets", `id=eq.${existing.id}`, row);
  }

  const insertedSets = await sbFetchAll(
    `sets?select=id,slug,code,name,release_date&game_id=eq.${gameId}`
  );
  const setByCode = new Map(insertedSets.map((set) => [set.code, set]));
  const releaseRows = plan.sets.map((set) => ({
    game_id: gameId,
    game_edition_id: edition.id,
    set_id: setByCode.get(set.code)?.id,
    release_code: "primary",
    release_date: set.releaseDate,
    metadata: {
      source: "lorcanajson",
      prerelease_date: dateOnly(set.source.prereleaseDate),
      allowed_in_tournaments_from_date: set.source.allowedInTournamentsFromDate ?? null,
      allowed_in_formats: set.source.allowedInFormats ?? {},
    },
  }));
  await sbUpsert("set_releases", releaseRows, "game_edition_id,set_id,release_code");
  const releases = await sbFetchAll(
    `set_releases?select=id,set_id&game_id=eq.${gameId}&game_edition_id=eq.${edition.id}`
  );
  const releaseBySetId = new Map(releases.map((release) => [release.set_id, release.id]));

  const expectedCards = plan.cards.map((card) => {
    const raw = plan.rawBySourceId.get(card.sourceExternalId);
    const rarityCode = lorcanaTaxonomyCode(card.rarity);
    const variantCode = lorcanaVariantCode(raw);
    return {
      game_id: gameId,
      card_image_id: `lorcana:${card.sourceLanguage}:${card.sourceExternalId}`,
      card_number: card.fullIdentifier,
      name: card.fullName,
      name_base: card.name,
      variant_label: card.isPromo ? card.promo.grouping ?? "Promo" : variantCode === "ALTERNATE_ART" ? "Alternate Art" : null,
      set_id: setByCode.get(card.setCode)?.id ?? null,
      rarity: card.rarity,
      rarity_id: rarityId.get(rarityCode) ?? null,
      variant_id: variantId.get(variantCode) ?? null,
      card_type: card.type,
      color: card.colors.length ? card.colors : null,
      power: card.gameplay.strength,
      counter: null,
      life: card.gameplay.willpower,
      cost: card.gameplay.cost,
      attribute: card.gameplay.story,
      types: card.gameplay.subtypes.length ? card.gameplay.subtypes : null,
      effect: card.gameplay.fullText,
      trigger: null,
      artist: card.artists.join(", ") || null,
      image_url: null,
      tcg_product_id: card.externalIds.tcgplayer && plan.uniqueTcgplayer.has(card.externalIds.tcgplayer)
        ? card.externalIds.tcgplayer
        : null,
      region: "en",
      game_payload: gamePayload(card),
    };
  });
  const invalidCards = expectedCards.filter(
    (card) => !card.set_id || !card.rarity_id || !card.variant_id
  );
  if (invalidCards.length) throw new Error(`${invalidCards.length} cards are missing database taxonomy IDs`);
  const dbCardByImageId = new Map(dbCards.map((card) => [card.card_image_id, card]));
  const cardFields = [
    "card_number", "name", "name_base", "variant_label", "set_id", "rarity",
    "rarity_id", "variant_id", "card_type", "color", "power", "life", "cost",
    "attribute", "types", "effect", "artist", "image_url", "tcg_product_id", "game_payload",
  ];
  const cardInserts = expectedCards.filter((row) => !dbCardByImageId.has(row.card_image_id));
  const cardUpdates = expectedCards.filter((row) => {
    const existing = dbCardByImageId.get(row.card_image_id);
    return existing && changedFields(existing, row, cardFields).length;
  });
  await sbInsert("cards", cardInserts);
  for (const row of cardUpdates) {
    const existing = dbCardByImageId.get(row.card_image_id);
    if (existing) await sbPatch("cards", `id=eq.${existing.id}`, row);
  }

  const persistedCards = await sbFetchAll(
    `cards?select=id,card_image_id&game_id=eq.${gameId}`
  );
  const persistedCardBySourceId = new Map(
    persistedCards.map((card) => [card.card_image_id.split(":").at(-1), card])
  );
  const externalRows = [];
  for (const card of plan.cards) {
    const persisted = persistedCardBySourceId.get(card.sourceExternalId);
    if (!persisted) continue;
    externalRows.push({
      game_id: gameId, card_id: persisted.id, provider: "lorcanajson",
      external_id: card.sourceExternalId, external_type: "source_id",
      metadata: { printing_key: card.printingKey, set_code: card.setCode },
    });
    for (const [provider, value, uniqueSet] of [
      ["tcgplayer", card.externalIds.tcgplayer, plan.uniqueTcgplayer],
      ["cardmarket", card.externalIds.cardmarket, plan.uniqueCardmarket],
      ["cardtrader", card.externalIds.cardtrader, plan.uniqueCardtrader],
    ]) {
      if (value && uniqueSet.has(value)) {
        externalRows.push({
          game_id: gameId, card_id: persisted.id, provider, external_id: value,
          external_type: "product_id", metadata: { source: "lorcanajson" },
        });
      }
    }
  }
  for (const match of plan.joins.matches) {
    const persisted = persistedCardBySourceId.get(match.canonicalCard.sourceExternalId);
    const externalId = justTcgLorcanaCardExternalId(match.justTcgCard);
    if (persisted && externalId) {
      externalRows.push({
        game_id: gameId, card_id: persisted.id, provider: "justtcg",
        external_id: externalId, external_type: match.justTcgCard.uuid ? "card_uuid" : "card_id",
        metadata: { source_game_slug: LORCANA_JUSTTCG_GAME_SLUG },
      });
    }
  }
  await sbUpsert("card_external_ids", externalRows, "game_id,provider,external_id");
  await sbUpsert(
    "set_external_ids",
    plan.sets.map((set) => ({
      game_id: gameId,
      set_id: setByCode.get(set.code).id,
      provider: "lorcanajson",
      external_id: set.code,
      external_type: "set_code",
      metadata: { name: set.name },
    })),
    "game_id,provider,external_id"
  );

  const definitionCandidates = new Map();
  for (const card of plan.cards) {
    const raw = plan.rawBySourceId.get(card.sourceExternalId);
    const definitionId = lorcanaDefinitionSourceId(raw);
    const existing = definitionCandidates.get(definitionId);
    if (!existing || card.sourceExternalId === definitionId) definitionCandidates.set(definitionId, card);
  }
  const definitionRows = [...definitionCandidates].map(([definitionId, card]) => ({
    game_id: gameId,
    canonical_key: `lorcanajson:${card.sourceLanguage}:${definitionId}`,
    name: card.fullName,
    rules_text: card.gameplay.fullText,
    payload_schema_version: 1,
    game_payload: gamePayload(card),
    metadata: { source: "lorcanajson", source_id: definitionId },
  }));
  await sbUpsert("card_definitions", definitionRows, "game_id,canonical_key");
  const definitions = await sbFetchAll(
    `card_definitions?select=id,canonical_key&game_id=eq.${gameId}`
  );
  const definitionByKey = new Map(definitions.map((row) => [row.canonical_key, row.id]));
  const printingRows = plan.cards.map((card) => {
    const raw = plan.rawBySourceId.get(card.sourceExternalId);
    const setId = setByCode.get(card.setCode).id;
    return {
      game_id: gameId,
      card_definition_id: definitionByKey.get(
        `lorcanajson:${card.sourceLanguage}:${lorcanaDefinitionSourceId(raw)}`
      ),
      set_release_id: releaseBySetId.get(setId),
      set_id: setId,
      game_edition_id: edition.id,
      legacy_card_id: persistedCardBySourceId.get(card.sourceExternalId).id,
      collector_number: card.fullIdentifier,
      printed_name: card.fullName,
      printed_language_code: "en",
      release_region_code: null,
      rarity_id: rarityId.get(lorcanaTaxonomyCode(card.rarity)),
      legacy_variant_label: card.isPromo ? card.promo.grouping ?? "Promo" : null,
      image_url: null,
      payload_schema_version: 1,
      source_payload: raw,
      metadata: {
        source: "lorcanajson",
        source_id: card.sourceExternalId,
        image_urls: card.imageUrls,
        asset_writes_enabled: false,
      },
    };
  });
  await sbUpsert("card_printings", printingRows, "legacy_card_id");
  return {
    setsInserted: setInserts.length,
    setsUpdated: setUpdates.length,
    cardsInserted: cardInserts.length,
    cardsUpdated: cardUpdates.length,
    cardExternalIds: externalRows.length,
    definitions: definitionRows.length,
    printings: printingRows.length,
  };
}

async function applyRawRecords(plan, gameId, runs) {
  const generatedOn = sourceTimestamp(plan.document.metadata.generatedOn);
  const lorcanaRecords = [
    rawRecord({
      gameId, provider: "lorcanajson", runId: runs.lorcanajson.id,
      recordType: "catalog_metadata", externalId: "current/en",
      sourceUpdatedAt: generatedOn, payload: plan.document.metadata,
      adapterVersion: LORCANA_ADAPTER,
    }),
    ...plan.sets.map((set) => rawRecord({
      gameId, provider: "lorcanajson", runId: runs.lorcanajson.id,
      recordType: "set", externalId: set.code, sourceUpdatedAt: generatedOn,
      payload: set.source, adapterVersion: LORCANA_ADAPTER,
    })),
    ...plan.document.cards.map((card) => rawRecord({
      gameId, provider: "lorcanajson", runId: runs.lorcanajson.id,
      recordType: "card", externalId: String(card.id), parentExternalId: card.setCode,
      sourceUpdatedAt: generatedOn, payload: card, adapterVersion: LORCANA_ADAPTER,
    })),
  ];
  const justRecords = [];
  for (const { set, cards } of plan.perSet) {
    justRecords.push(rawRecord({
      gameId, provider: "justtcg", runId: runs.justtcg.id,
      recordType: "set", externalId: set.id, sourceUpdatedAt: set.release_date,
      payload: set, adapterVersion: JUSTTCG_ADAPTER,
    }));
    for (const card of cards) {
      const cardExternalId = justTcgLorcanaCardExternalId(card);
      if (!cardExternalId) continue;
      const sourceUpdatedAt = justTcgLorcanaSourceUpdatedAt(card);
      justRecords.push(rawRecord({
        gameId, provider: "justtcg", runId: runs.justtcg.id,
        recordType: "card", externalId: cardExternalId, parentExternalId: set.id,
        sourceUpdatedAt, payload: card, adapterVersion: JUSTTCG_ADAPTER,
      }));
      for (const variant of card.variants ?? []) {
        const variantId = variant.uuid?.trim() || variant.id?.trim();
        if (!variantId) continue;
        justRecords.push(rawRecord({
          gameId, provider: "justtcg", runId: runs.justtcg.id,
          recordType: "price_variant", externalId: `${cardExternalId}:${variantId}`,
          parentExternalId: cardExternalId,
          sourceUpdatedAt: Number.isFinite(variant.lastUpdated)
            ? new Date(variant.lastUpdated * 1000).toISOString()
            : sourceUpdatedAt,
          payload: variant, adapterVersion: JUSTTCG_ADAPTER,
        }));
      }
    }
  }
  await sbUpsert(
    "tcg_source_records",
    lorcanaRecords,
    "game_id,provider,record_type,external_id",
    { chunkSize: 75 }
  );
  await sbUpsert(
    "tcg_source_records",
    justRecords,
    "game_id,provider,record_type,external_id",
    { chunkSize: 75 }
  );
  return { lorcanajson: lorcanaRecords.length, justtcg: justRecords.length };
}

function buildReconciliationCandidates(plan, gameId) {
  const now = new Date().toISOString();
  const candidates = [];
  const canonicalSets = plan.sets.map((set) => ({ code: set.code, name: set.name }));
  const exactProviderSetIds = new Set();
  for (const set of plan.justTcgSets) {
    const matched = matchLorcanaJustTcgSet(set, canonicalSets);
    if (matched) {
      exactProviderSetIds.add(set.id);
      continue;
    }
    candidates.push({
      game_id: gameId, provider: "justtcg", entity_type: "set",
      external_id: set.id, status: "provider_ahead",
      reason: "provider_set_name_missing_from_canonical_catalog",
      source_set_external_id: set.id, source_updated_at: set.release_date,
      last_seen_at: now, payload: set, metadata: { canonical_match_policy: "exact_normalized_name" },
    });
  }
  for (const set of plan.sets) {
    const providerMatch = plan.justTcgSets.some(
      (providerSet) => matchLorcanaJustTcgSet(providerSet, [set])
    );
    if (!providerMatch) {
      candidates.push({
        game_id: gameId, provider: "justtcg", entity_type: "set",
        external_id: `catalog:${set.code}`, status: "catalog_only",
        reason: "canonical_set_missing_from_provider_exact_name_index",
        source_set_external_id: null, source_updated_at: sourceTimestamp(plan.document.metadata.generatedOn),
        last_seen_at: now, payload: set.source, metadata: { canonical_set_code: set.code },
      });
    }
  }
  const conflicts = new Set(plan.joins.conflictingProductIds);
  for (const card of plan.joins.unmatched) {
    const externalId = justTcgLorcanaCardExternalId(card);
    if (!externalId) continue;
    const productId = card.tcgplayerId?.trim() || null;
    const sealed = /\b(booster box|booster display|case|starter deck|playmat|bundle)\b/i.test(card.name);
    const status = sealed ? "sealed_product" : conflicts.has(productId) ? "identity_conflict" : "provider_ahead";
    const reason = sealed
      ? "provider_record_is_not_a_single_card"
      : conflicts.has(productId)
        ? "non_unique_canonical_tcgplayer_product_id"
        : productId
          ? "tcgplayer_product_id_absent_from_canonical_catalog"
          : "missing_tcgplayer_product_id";
    candidates.push({
      game_id: gameId, provider: "justtcg", entity_type: sealed ? "sealed_product" : "card",
      external_id: externalId, status, reason,
      source_set_external_id: card.set, tcgplayer_product_id: productId,
      source_updated_at: justTcgLorcanaSourceUpdatedAt(card),
      last_seen_at: now, payload: card, metadata: { source_game_slug: LORCANA_JUSTTCG_GAME_SLUG },
    });
  }
  return { candidates, exactProviderSetIds };
}

async function applyReconciliation(plan, gameId) {
  const { candidates, exactProviderSetIds } = buildReconciliationCandidates(plan, gameId);
  const normalizedCandidates = candidates.map((candidate) => ({
    game_id: gameId,
    provider: "justtcg",
    entity_type: null,
    external_id: null,
    status: null,
    reason: null,
    canonical_card_id: null,
    canonical_set_id: null,
    source_set_external_id: null,
    tcgplayer_product_id: null,
    source_updated_at: null,
    last_seen_at: new Date().toISOString(),
    payload: {},
    metadata: {},
    ...candidate,
  }));
  await sbUpsert(
    "catalog_reconciliation_candidates",
    normalizedCandidates,
    "game_id,provider,entity_type,external_id",
    { chunkSize: 75 }
  );
  const resolvedExternalIds = new Set([
    ...plan.joins.matches.map((match) => justTcgLorcanaCardExternalId(match.justTcgCard)),
    ...exactProviderSetIds,
  ]);
  const existing = await sbFetchAll(
    `catalog_reconciliation_candidates?select=id,external_id,status&game_id=eq.${gameId}&provider=eq.justtcg`
  );
  let resolved = 0;
  for (const row of existing) {
    if (row.status !== "resolved" && resolvedExternalIds.has(row.external_id)) {
      await sbPatch("catalog_reconciliation_candidates", `id=eq.${row.id}`, {
        status: "resolved", resolved_at: new Date().toISOString(),
        reason: "unique_exact_source_identity_now_available",
      });
      resolved += 1;
    }
  }
  return { queued: normalizedCandidates.length, resolved };
}

async function finishRun(run, status, counts, errorSummary = null) {
  if (!run?.id) return;
  await sbPatch("source_ingest_runs", `id=eq.${run.id}`, {
    status,
    counts,
    error_summary: errorSummary,
    finished_at: new Date().toISOString(),
  });
}

async function verifyImport(gameId) {
  const [sets, cards, definitions, printings, raw, queue, priceRows, runs, game] = await Promise.all([
    sbFetchAll(`sets?select=id&game_id=eq.${gameId}`),
    sbFetchAll(`cards?select=id,image_url&game_id=eq.${gameId}`),
    sbFetchAll(`card_definitions?select=id&game_id=eq.${gameId}`),
    sbFetchAll(`card_printings?select=id&game_id=eq.${gameId}`),
    sbFetchAll(`tcg_source_records?select=id,provider,record_type&game_id=eq.${gameId}`),
    sbFetchAll(`catalog_reconciliation_candidates?select=id,status,entity_type&game_id=eq.${gameId}&provider=eq.justtcg`),
    sbFetchAll(`price_stats?select=card_id&game_id=eq.${gameId}`),
    sbFetchAll(`source_ingest_runs?select=id,status,job_key,finished_at,counts&game_id=eq.${gameId}`),
    sbFetchAll(`games?select=is_public,metadata&slug=eq.${LORCANA_DB_SLUG}`),
  ]);
  return {
    sets: sets.length,
    cards: cards.length,
    definitions: definitions.length,
    printings: printings.length,
    cardsWithCopiedImageUrl: cards.filter((card) => card.image_url).length,
    publishedPriceRows: priceRows.length,
    rawRecords: raw.length,
    rawByProvider: Object.fromEntries(
      ["lorcanajson", "justtcg"].map((provider) => [
        provider, raw.filter((row) => row.provider === provider).length,
      ])
    ),
    reconciliationCandidates: queue.length,
    reconciliationByStatus: Object.fromEntries(
      [...new Set(queue.map((row) => row.status))].sort().map((status) => [
        status, queue.filter((row) => row.status === status).length,
      ])
    ),
    ingestRunsByStatus: Object.fromEntries(
      [...new Set(runs.map((run) => run.status))].sort().map((status) => [
        status, runs.filter((run) => run.status === status).length,
      ])
    ),
    publicCatalogEnabled: game[0]?.is_public ?? null,
    pricePublicationEnabled: game[0]?.metadata?.publication_status !== "disabled",
    imageWritesEnabled: game[0]?.metadata?.asset_writes_enabled === true,
  };
}

async function main() {
  if (VERIFY_ONLY) {
    const game = (await sbFetchAll(`games?select=id&slug=eq.${LORCANA_DB_SLUG}`))[0];
    if (!game?.id) throw new Error("Lorcana game row is missing");
    const verification = await verifyImport(game.id);
    console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), verification }, null, 2));
    if (
      verification.publicCatalogEnabled !== EXPECT_PUBLIC_CATALOG ||
      verification.pricePublicationEnabled !== false ||
      verification.imageWritesEnabled !== false ||
      verification.cardsWithCopiedImageUrl !== 0 ||
      verification.publishedPriceRows !== 0
    ) {
      throw new Error("Verification-only safety gate failed");
    }
    return;
  }
  const source = await fetchSources();
  const plan = buildPlan(source);
  const preview = {
    mode: APPLY ? "apply" : "dry_run",
    lorcanajson: {
      formatVersion: plan.document.metadata.formatVersion,
      generatedOn: plan.document.metadata.generatedOn,
      sets: plan.sets.length,
      cards: plan.cards.length,
    },
    justtcg: {
      sets: plan.justTcgSets.length,
      cards: plan.justTcgCards.length,
      variants: plan.justTcgCards.reduce((sum, card) => sum + (card.variants?.length ?? 0), 0),
    },
    reconciliation: {
      exactMatches: plan.joins.matches.length,
      unmatched: plan.joins.unmatched.length,
      conflicts: plan.joins.conflictingProductIds,
    },
    gates: { publicCatalog: false, publishPrices: false, imageWrites: false },
  };
  console.log(JSON.stringify(preview, null, 2));
  if (!APPLY) {
    console.log("Dry run complete. Re-run with --apply to persist the private staging import.");
    return;
  }

  const game = await ensureStagingRows();
  const runs = {
    lorcanajson: await createIngestRun(game.id, "lorcanajson", {
      source_catalog_key: "current/en", adapter_version: LORCANA_ADAPTER,
      provider_api_version: plan.document.metadata.formatVersion,
      job_key: "lorcana_catalog_full",
      cursor: { generated_on: plan.document.metadata.generatedOn },
    }),
    justtcg: await createIngestRun(game.id, "justtcg", {
      source_catalog_key: LORCANA_JUSTTCG_GAME_SLUG, adapter_version: JUSTTCG_ADAPTER,
      provider_api_version: "v1", job_key: "lorcana_commercial_reconciliation_full",
      cursor: { sets: plan.justTcgSets.length },
    }),
  };

  try {
    console.log("Persisting replayable raw source records...");
    const rawCounts = await applyRawRecords(plan, game.id, runs);
    console.log("Persisting private catalog identities...");
    const catalogCounts = await applyCatalog(plan, game);
    console.log("Persisting reconciliation candidates...");
    const reconciliationCounts = await applyReconciliation(plan, game.id);
    await finishRun(runs.lorcanajson, "completed", {
      sets: plan.sets.length, cards: plan.cards.length, raw_records: rawCounts.lorcanajson,
    });
    await finishRun(runs.justtcg, "completed", {
      sets: plan.justTcgSets.length, cards: plan.justTcgCards.length,
      exact_matches: plan.joins.matches.length, unmatched: plan.joins.unmatched.length,
      raw_records: rawCounts.justtcg,
    });
    const verification = await verifyImport(game.id);
    console.log(JSON.stringify({ applied: true, rawCounts, catalogCounts, reconciliationCounts, verification }, null, 2));
    if (
      verification.publicCatalogEnabled !== false ||
      verification.pricePublicationEnabled !== false ||
      verification.imageWritesEnabled !== false ||
      verification.cardsWithCopiedImageUrl !== 0 ||
      verification.publishedPriceRows !== 0
    ) {
      throw new Error("Post-import safety gate verification failed");
    }
  } catch (error) {
    await Promise.all([
      finishRun(runs.lorcanajson, "failed", {}, String(error)),
      finishRun(runs.justtcg, "failed", {}, String(error)),
    ]);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
