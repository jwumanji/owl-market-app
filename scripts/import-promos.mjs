// Backfill: import promo cards from optcgapi /api/sets/P/
// Run: SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-promos.mjs
//
// Behavior:
// - Routes each promo to its ORIGIN set (by card-number prefix), matching
//   the JustTCG sync convention. So a promo print of "ST01-007 Nami" lives
//   under ST01, not P.
// - Categorizes the parenthetical in card_name into a `promo_segment` column.
// - Backfills NULL fields only — never overwrites existing values.
// - Inserts new rows for promo printings JustTCG hasn't seen, using a
//   synthetic card_image_id like "ST01-007-premium-card-collection".
// - Skips records with garbled fields (upstream API bugs).

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

// optcgapi has multiple URL patterns for promos depending on version. Try
// each in order until one returns a non-empty JSON array.
const OPT_PROMO_CANDIDATES = [
  "https://optcgapi.com/api/allPromos/",
  "https://optcgapi.com/api/promos/",
  "https://optcgapi.com/api/promo/",
  "https://optcgapi.com/api/sets/P/",
];
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullIfNullStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === "NULL") return null;
  }
  return v;
}

function toInt(v) {
  const x = nullIfNullStr(v);
  if (x === null) return null;
  const n = parseInt(String(x), 10);
  return Number.isNaN(n) ? null : n;
}

function prefixFromCardNumber(cardNumber) {
  if (!cardNumber) return null;
  const s = String(cardNumber);
  // "OP02-013" -> "OP02", "ST01-007" -> "ST01", "EB01-003" -> "EB01"
  let m = s.match(/^([A-Z]+\d+)-/);
  if (m) return m[1].toUpperCase();
  // "P-001" -> "P"
  m = s.match(/^([A-Z]+)-/);
  if (m) return m[1].toUpperCase();
  return null;
}

// Detect garbled rows where API returned shifted columns. Real set_id values
// look like "OP09", "ST03", "P", "EB01". Anything containing whitespace
// (e.g. "Blue Green Purple Red Black Yellow") is malformed.
function looksGarbled(c) {
  if (!c.set_id || typeof c.set_id !== "string") return true;
  if (/\s/.test(c.set_id)) return true;
  if (!/^[A-Z]+\d*$/.test(c.set_id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Promo segment classifier
// ---------------------------------------------------------------------------
// Rules apply top-down; first match wins. Tested against the actual feed.

const SEGMENT_RULES = [
  [/Anniversary Set\)/i, "Anniversary Set"],
  [/Premium Card Collection/i, "Premium Card Collection"],
  [/Championship 20\d\d/i, "Championship Prize"],
  // Year-pair format: "Championship 25-26 Regionals", "Championship 24-25"
  [/Championship \d{2}-\d{2}/i, "Championship Prize"],
  [/(Online|Offline) Regional/i, "Regional Prize"],
  // Bare "Regional Champion Card Set …" without Online/Offline prefix
  [/Regional Champion Card Set/i, "Regional Prize"],
  [/Treasure Cup/i, "Championship Prize"],
  [/Pirates League/i, "Championship Prize"],
  [/Store Championship/i, "Store Championship"],
  [/Store \d-on-\d Battle/i, "Store Event"],
  // Generic N-on-N events (e.g. "3-on-3 Cup")
  [/\d-on-\d Cup/i, "Store Event"],
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
  // BANDAI Card Games Fest is a recurring convention-style event
  [/BANDAI Card Games Fest|Bandai.*Card.*Fest/i, "Convention Promo"],
  [/PSA Magazine/i, "Magazine Promo"],
  // Anniversary tournaments — generalized from the original 2nd-only rule
  [/\d(?:st|nd|rd|th) Anniversary Tournament|Pre-Release Tournament/i, "Tournament Prize"],
  // Anniversary stamped/event promos that aren't part of an Anniversary Set
  [/Anniversary Stamped|Anniversary Promo/i, "Anniversary Promo"],
  [/Release Event/i, "Release Event"],
  [/New Year Event/i, "Special Event"],
  [/One Piece Film Red|Live Action|FILM RED/i, "Movie Tie-in"],
  [/Dodgers x|BVB x|x ONE PIECE|x One Piece/i, "Crossover Promo"],
  [/Demo Deck/i, "Demo Deck"],
  // Order matters: "Deck Battle Promo" must come before generic "Demo Deck"
  // (handled above) and before "Starter Deck" which itself isn't a promo.
  [/Starter Deck \d+:.*Deck Battle/i, "Deck Battle Promo"],
  [/Seven Warlords.*Binder Set/i, "Binder Set"],
  [/Retail Promo/i, "Retail Promo"],
  // Brackets included via the haystack builder below ([Serial Number])
  [/Serial Number|Jumbo/i, "Special Edition"],
  [/Alternate Art/i, "Alt Art Promo"],
  [/Learn Together Deck Set/i, "Learn Together"],
  [/Treasure Booster/i, "Treasure Booster"],
];

function classifySegment(cardName) {
  if (!cardName) return "Other";
  // Pull both () and [] groups — TCGPlayer-derived names sometimes use square
  // brackets ("[Serial Number]", "[Winner]", "[Participant]") that the
  // earlier paren-only regex silently ignored.
  const groups = cardName.match(/[(\[]([^)\]]+)[)\]]/g) ?? [];
  if (groups.length === 0) return "Other";
  const haystack = groups.join(" ");
  for (const [re, label] of SEGMENT_RULES) {
    if (re.test(haystack)) return label;
  }
  return "Other";
}

// Re-export so a re-classify script can pull the same logic without forking.
export { classifySegment, SEGMENT_RULES };

function segmentSlug(segment) {
  return segment.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function fetchPromos() {
  for (const url of OPT_PROMO_CANDIDATES) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        console.log(`  ${url} → HTTP ${r.status}, trying next...`);
        continue;
      }
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  ${url} → ${data.length} cards`);
        return data;
      }
      console.log(`  ${url} → empty/invalid response, trying next...`);
    } catch (err) {
      console.log(`  ${url} → ${err.message}, trying next...`);
    }
  }
  throw new Error("No promo endpoint returned valid data. All candidates failed.");
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

// Build {prefix → set_id (uuid)} map once.
async function buildPrefixMap() {
  const sets = await sbGet("sets?select=id,code");
  const map = {};
  for (const s of sets) if (s.code) map[s.code.toUpperCase()] = s.id;
  return map;
}

// ---------------------------------------------------------------------------
// Card transform
// ---------------------------------------------------------------------------

function buildSyntheticId(cardSetId, segment) {
  return `${cardSetId}-${segmentSlug(segment)}`;
}

// Build the column set for an INSERT (new rows).
function buildInsertRow(c, setUuid, segment, syntheticId) {
  const color = nullIfNullStr(c.card_color);
  const subs = nullIfNullStr(c.sub_types);
  const name = c.card_name ?? null;
  const nameBase = name ? name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() : null;

  return {
    card_image_id: syntheticId,
    card_number: c.card_set_id,
    name,
    name_base: nameBase,
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
    types: subs ? [subs] : null,
    image_url: `${OPT_IMAGE_BASE}/${c.card_set_id}.jpg`,
    promo_segment: segment,
  };
}

// Build a PATCH body that ONLY backfills null fields on the existing row.
// Returns null if there's nothing to update.
function buildBackfillPatch(c, existing, segment) {
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
  const subs = nullIfNullStr(c.sub_types);
  if (subs && (existing.types === null || (Array.isArray(existing.types) && existing.types.length === 0))) {
    patch.types = [subs];
  }

  // Image: only fill if currently null.
  if (!existing.image_url) patch.image_url = `${OPT_IMAGE_BASE}/${c.card_set_id}.jpg`;

  // promo_segment: only fill if null (uniform rule).
  if (!existing.promo_segment) patch.promo_segment = segment;

  return Object.keys(patch).length > 0 ? patch : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching promo cards from optcgapi (trying candidate URLs)...");
  const cards = await fetchPromos();
  console.log(`Fetched ${cards.length} promo records.`);

  console.log("Building prefix → set_id map...");
  const prefixMap = await buildPrefixMap();

  // Pre-load all existing card_image_ids and the columns we may backfill,
  // so we can decide insert vs patch without per-row queries.
  console.log("Loading existing cards (this may take a moment)...");
  const existingCards = await sbGet(
    "cards?select=id,card_image_id,card_number,rarity,card_type,power,counter,life,cost,attribute,effect,color,types,image_url,promo_segment&limit=20000",
  );
  const byCardImageId = new Map();
  for (const row of existingCards) {
    if (row.card_image_id) byCardImageId.set(row.card_image_id, row);
  }
  console.log(`Loaded ${existingCards.length} existing rows.`);

  let garbled = 0;
  let unroutable = 0;
  let inserts = 0;
  let patches = 0;
  let noOps = 0;
  const segmentCounts = {};

  // Collect inserts in batches keyed by synthetic ID (dedupe within run).
  const insertBatch = new Map();

  for (const c of cards) {
    if (looksGarbled(c)) {
      garbled++;
      continue;
    }
    if (!c.card_set_id) {
      garbled++;
      continue;
    }

    const prefix = prefixFromCardNumber(c.card_set_id);
    const setUuid = prefix ? prefixMap[prefix] : null;
    if (!setUuid) {
      unroutable++;
      continue;
    }

    const segment = classifySegment(c.card_name);
    segmentCounts[segment] = (segmentCounts[segment] ?? 0) + 1;

    // Try matching an existing row in two ways:
    //   1. Raw card_set_id (e.g. "ST01-007") — base art row created by JustTCG sync.
    //   2. Our synthetic ID (e.g. "ST01-007-premium-card-collection") — already imported by us.
    const syntheticId = buildSyntheticId(c.card_set_id, segment);
    const existing = byCardImageId.get(syntheticId) ?? byCardImageId.get(c.card_set_id);

    if (existing) {
      const patch = buildBackfillPatch(c, existing, segment);
      if (patch) {
        const ok = await sbPatch("cards", `id=eq.${existing.id}`, patch);
        if (ok) patches++;
      } else {
        noOps++;
      }
    } else {
      // Queue for batch insert. Dedupe within the run so the same synthetic ID
      // (e.g. duplicate "Brook Premium Card Collection" rows) doesn't ON CONFLICT-twice.
      insertBatch.set(syntheticId, buildInsertRow(c, setUuid, segment, syntheticId));
    }
  }

  if (insertBatch.size > 0) {
    console.log(`\nInserting ${insertBatch.size} new promo rows...`);
    const rows = Array.from(insertBatch.values());
    // Chunk to keep request size sane.
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const ok = await sbUpsert("cards", slice, "card_image_id");
      if (ok) inserts += slice.length;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Garbled (skipped):       ${garbled}`);
  console.log(`Unroutable (no prefix):  ${unroutable}`);
  console.log(`No-op (nothing to fill): ${noOps}`);
  console.log(`Patched existing rows:   ${patches}`);
  console.log(`Inserted new rows:       ${inserts}`);
  console.log("\n--- Segment distribution ---");
  for (const [seg, n] of Object.entries(segmentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${seg.padEnd(28)} ${n}`);
  }
}

// Only run the import when invoked directly. Other scripts may import the
// classifier (`classifySegment`) without triggering a full promo fetch.
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
const isEntryPoint =
  process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
