// Generic set importer. Fetches a single set from optcgapi and upserts
// its cards into the DB. Use for PRB01, OP15, EB04, or any non-deck/non-promo
// set that needs a fresh import or backfill.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-set.mjs PRB01
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-set.mjs OP15
//
// Behavior:
// - Fetches https://optcgapi.com/api/sets/{HYPHENATED_ID}/
// - Upserts the set row in `sets` table on `slug`
// - For each card: upserts on `card_image_id`, backfilling NULL fields
//   only on existing rows (never overwrites existing values).
// - Routes the set FK by the requested set code, NOT by per-card prefix.
//   (Decision: a card with card_image_id "OP02-004_r1" in PRB01 gets
//   set_id=PRB01, distinct from the original OP02-004 row in OP02.)
// - Skips garbled rows.

const SET_CODE = process.argv[2];
if (!SET_CODE) {
  console.error("Usage: node scripts/import-set.mjs <SET_CODE>");
  console.error("  e.g. node scripts/import-set.mjs PRB01");
  process.exit(1);
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running.");
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const OPT_BASE = "https://optcgapi.com/api";
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullIfNullStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === "NULL" || t === "N/A") return null;
  }
  return v;
}

function toInt(v) {
  const x = nullIfNullStr(v);
  if (x === null) return null;
  const n = parseInt(String(x), 10);
  return Number.isNaN(n) ? null : n;
}

function nameBase(name) {
  if (!name) return null;
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// optcgapi ID format: "PRB01" -> "PRB-01", "OP15" -> "OP-15"
function toApiId(setCode) {
  return setCode.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

// Detect garbled rows where API returned shifted columns.
function looksGarbled(c) {
  if (!c.set_id || typeof c.set_id !== "string") return true;
  if (/\s/.test(c.set_id)) return true;
  if (!/^[A-Z]+-?\d*$/.test(c.set_id)) return true;
  // Color sometimes leaks "Character" or "Leader" — sanity check.
  if (c.card_color && /^(Character|Leader|Stage|Event)$/.test(c.card_color)) return true;
  return false;
}

// Sub-types come in three formats across scrape dates:
//   "Heart Pirates Supernovas"     (space-separated, older)
//   "Heart Pirates/Supernovas"     (slash-separated, newer)
//   "Animal/Straw Hat Crew"        (slash-separated)
// Treat the whole string as a single tag — splitting is unreliable because
// some types contain spaces ("Straw Hat Crew") and we'd over-split.
function parseSubTypes(s) {
  const v = nullIfNullStr(s);
  return v ? [v] : null;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbUpsert(table, rows, onConflict) {
  if (rows.length === 0) return true;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    },
  );
  if (!r.ok) {
    console.error(`  upsert ${table} failed: ${r.status} ${await r.text()}`);
    return false;
  }
  return true;
}

async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`  patch ${table} failed: ${r.status} ${await r.text()}`);
    return false;
  }
  return true;
}

async function getSetUuid(setCode) {
  const data = await sbGet(`sets?code=eq.${setCode}&select=id`);
  return data[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Card transform
// ---------------------------------------------------------------------------

function buildInsertRow(c, setUuid) {
  const color = nullIfNullStr(c.card_color);
  return {
    card_image_id: c.card_image_id,
    card_number: c.card_set_id,
    name: c.card_name,
    name_base: nameBase(c.card_name),
    set_id: setUuid,
    rarity: nullIfNullStr(c.rarity),
    card_type: nullIfNullStr(c.card_type),
    power: toInt(c.card_power),
    counter: toInt(c.counter_amount),
    life: toInt(c.life),
    cost: toInt(c.card_cost),
    attribute: nullIfNullStr(c.attribute),
    effect: nullIfNullStr(c.card_text),
    color: color ? [color] : null,
    types: parseSubTypes(c.sub_types),
    image_url: c.card_image ?? `${OPT_IMAGE_BASE}/${c.card_image_id}.jpg`,
  };
}

function buildBackfillPatch(c, existing, setUuid) {
  const patch = {};
  const trySet = (col, value) => {
    if (value === null || value === undefined) return;
    if (existing[col] === null || existing[col] === undefined) patch[col] = value;
  };

  trySet("rarity", nullIfNullStr(c.rarity));
  trySet("card_type", nullIfNullStr(c.card_type));
  trySet("power", toInt(c.card_power));
  trySet("counter", toInt(c.counter_amount));
  trySet("life", toInt(c.life));
  trySet("cost", toInt(c.card_cost));
  trySet("attribute", nullIfNullStr(c.attribute));
  trySet("effect", nullIfNullStr(c.card_text));

  const color = nullIfNullStr(c.card_color);
  if (color && (existing.color === null || (Array.isArray(existing.color) && existing.color.length === 0))) {
    patch.color = [color];
  }
  const subs = parseSubTypes(c.sub_types);
  if (subs && (existing.types === null || (Array.isArray(existing.types) && existing.types.length === 0))) {
    patch.types = subs;
  }

  if (!existing.image_url) {
    patch.image_url = c.card_image ?? `${OPT_IMAGE_BASE}/${c.card_image_id}.jpg`;
  }

  // Re-route to the imported set's UUID if the existing row points elsewhere.
  // Distribution set wins over origin set: a card_image_id like "OP02-004_r1"
  // physically belongs to PRB01 even though its card_number prefix is OP02.
  //
  // Guard: don't re-route a *bare* (no-suffix) card_image_id whose prefix
  // doesn't match the import target. optcgapi occasionally lists the same
  // bare ID under two different sets (e.g. "ST10-010" appears in both ST10
  // and OP07's catalogs because OP07 ships a TR-rarity box-topper variant
  // under the same Bandai ID). Re-routing would yank the original from its
  // home set. Suffixed variants (_pN/_rN/_alt) are still re-routed because
  // those are unambiguous "this physical card was distributed via X" cases.
  if (existing.set_id !== setUuid) {
    const cid = c.card_image_id || "";
    const hasVariantSuffix = /_(p\d+|r\d+|alt)/i.test(cid);
    const prefix = (cid.match(/^([A-Z]+\d+)/) ?? [])[1] ?? null;
    const prefixMatchesTarget = prefix === SET_CODE;
    if (hasVariantSuffix || prefixMatchesTarget) {
      patch.set_id = setUuid;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Page through the existing cards table to load ALL rows (PostgREST defaults
// to 1000-row limit; we need to chunk to avoid that bug).
async function loadAllExistingCards() {
  const all = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?select=id,card_image_id,set_id,rarity,card_type,power,counter,life,cost,attribute,effect,color,types,image_url&limit=${PAGE}&offset=${offset}`,
      { headers: SB_HEADERS },
    );
    if (!r.ok) throw new Error(`load existing cards: ${r.status} ${await r.text()}`);
    const batch = await r.json();
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  const apiId = toApiId(SET_CODE);
  console.log(`Importing set ${SET_CODE} from ${OPT_BASE}/sets/${apiId}/`);

  // 1. Fetch cards from optcgapi.
  const cards = await fetchJson(`${OPT_BASE}/sets/${apiId}/`);
  console.log(`Fetched ${cards.length} card records.`);

  // 2. Ensure the set row exists.
  const setName = cards[0]?.set_name ?? SET_CODE;
  await sbUpsert(
    "sets",
    [{ slug: SET_CODE.toLowerCase(), code: SET_CODE, name: setName }],
    "slug",
  );
  const setUuid = await getSetUuid(SET_CODE);
  if (!setUuid) {
    console.error(`Set ${SET_CODE} not found after upsert — aborting.`);
    process.exit(1);
  }

  // 3. Pre-load existing rows so we can decide insert-vs-patch without
  //    per-row queries.
  console.log("Loading existing cards (paged)...");
  const existing = await loadAllExistingCards();
  console.log(`Loaded ${existing.length} existing rows.`);
  const byCardImageId = new Map();
  for (const row of existing) if (row.card_image_id) byCardImageId.set(row.card_image_id, row);

  // 4. Walk the cards.
  let garbled = 0;
  let noCardImageId = 0;
  let inserts = 0;
  let patches = 0;
  let noOps = 0;

  const insertBatch = new Map();

  for (const c of cards) {
    if (looksGarbled(c)) {
      garbled++;
      continue;
    }
    if (!c.card_image_id) {
      noCardImageId++;
      continue;
    }

    const match = byCardImageId.get(c.card_image_id);
    if (match) {
      const patch = buildBackfillPatch(c, match, setUuid);
      if (patch) {
        const ok = await sbPatch("cards", `id=eq.${match.id}`, patch);
        if (ok) patches++;
      } else {
        noOps++;
      }
    } else {
      // Dedupe inserts by card_image_id (some scrape rows duplicate).
      insertBatch.set(c.card_image_id, buildInsertRow(c, setUuid));
    }
  }

  if (insertBatch.size > 0) {
    console.log(`\nInserting ${insertBatch.size} new card rows...`);
    const rows = Array.from(insertBatch.values());
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const ok = await sbUpsert("cards", slice, "card_image_id");
      if (ok) inserts += slice.length;
    }
  }

  console.log(`\n--- Summary for ${SET_CODE} ---`);
  console.log(`Garbled (skipped):       ${garbled}`);
  console.log(`No card_image_id:        ${noCardImageId}`);
  console.log(`No-op (nothing to fill): ${noOps}`);
  console.log(`Patched existing rows:   ${patches}`);
  console.log(`Inserted new rows:       ${inserts}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
