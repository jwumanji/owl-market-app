// Bundle importer for composite optcgapi sets like OP14-EB04 and OP15-EB04,
// where two set halves ship in one product. Splits cards into distinct
// destination sets by `card_set_id` prefix.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-bundle.mjs OP14-EB04
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-bundle.mjs OP15-EB04 --dry-run
//
// Routing:
// - card_set_id starts with the OP half  → that OP set        (e.g. OP14-091 → OP14)
// - card_set_id starts with the EB half  → that EB set        (e.g. EB04-018 → EB04)
// - older-set reprints (OP06-, OP07-, …) → EB half            (these are EB SP slots)
// - P-prefixed promos                    → skipped            (owned by import-promos.mjs)
// - garbled / empty rows                 → skipped
//
// Backfill semantics match import-set.mjs: insert new rows on card_image_id;
// for existing rows, fill only NULL fields and re-route set_id to the routed
// destination set (distribution wins over origin).

const BUNDLE = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!BUNDLE || !/^[A-Z]+\d+-[A-Z]+\d+$/.test(BUNDLE)) {
  console.error("Usage: node scripts/import-bundle.mjs <BUNDLE>");
  console.error("  e.g. node scripts/import-bundle.mjs OP14-EB04");
  process.exit(1);
}

const [OP_HALF, EB_HALF] = BUNDLE.split("-");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://kiquytaevufssveqmqix.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY && !DRY_RUN) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in env before running (or pass --dry-run).");
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SERVICE_KEY ?? "",
  Authorization: `Bearer ${SERVICE_KEY ?? ""}`,
  "Content-Type": "application/json",
};

const OPT_BASE = "https://optcgapi.com/api";
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";

// Hand-curated names — the bundle endpoint only exposes the bundle name
// (e.g. "Adventure on Kami's Island"), not per-half names.
const SET_NAMES = {
  OP14: "The Azure Sea's Seven",
  OP15: "Adventure on Kami's Island",
  EB04: "Extra Booster Vol. 4",
};

// ---------------------------------------------------------------------------
// Helpers (mirrored from import-set.mjs)
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

function parseSubTypes(s) {
  const v = nullIfNullStr(s);
  return v ? [v] : null;
}

function looksGarbled(c) {
  if (!c.set_id || typeof c.set_id !== "string") return true;
  if (/\s/.test(c.set_id)) return true;
  if (!/^[A-Z]+-?\d*(?:-[A-Z]+\d*)?$/.test(c.set_id)) return true;
  if (c.card_color && /^(Character|Leader|Stage|Event)$/.test(c.card_color)) return true;
  return false;
}

// Decide which destination set a card belongs to.
// Returns the set code (e.g. "OP14", "EB04") or null to skip.
function routeCard(card) {
  const csid = card.card_set_id || "";
  if (csid.startsWith("P-") || csid.startsWith("P_")) return null;
  const m = csid.match(/^([A-Z]+\d+)/);
  if (!m) return null;
  const prefix = m[1];
  if (prefix === OP_HALF) return OP_HALF;
  if (prefix === EB_HALF) return EB_HALF;
  return EB_HALF;
}

// ---------------------------------------------------------------------------
// HTTP / Supabase
// ---------------------------------------------------------------------------

async function fetchJson(url, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      return r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
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
  if (existing.set_id !== setUuid) {
    patch.set_id = setUuid;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Importing bundle ${BUNDLE} → splitting into ${OP_HALF} + ${EB_HALF}${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`Source: ${OPT_BASE}/sets/${BUNDLE}/`);

  const cards = await fetchJson(`${OPT_BASE}/sets/${BUNDLE}/`);
  console.log(`Fetched ${cards.length} card records.\n`);

  // Walk once to bucket cards by destination set + collect skip reasons.
  const buckets = { [OP_HALF]: [], [EB_HALF]: [] };
  let skippedPromo = 0;
  let skippedGarbled = 0;
  let skippedNoImg = 0;

  for (const c of cards) {
    if (looksGarbled(c)) { skippedGarbled++; continue; }
    if (!c.card_image_id) { skippedNoImg++; continue; }
    const target = routeCard(c);
    if (target === null) { skippedPromo++; continue; }
    buckets[target].push(c);
  }

  // Routing report (always shown — primary dry-run output).
  console.log("Routing summary:");
  for (const code of [OP_HALF, EB_HALF]) {
    const list = buckets[code];
    const prefixCounts = {};
    for (const c of list) {
      const p = (c.card_set_id || "").match(/^([A-Z]+\d+)/)?.[1] ?? "?";
      prefixCounts[p] = (prefixCounts[p] || 0) + 1;
    }
    const detail = Object.entries(prefixCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(`  → ${code}: ${list.length} cards   [${detail}]`);
  }
  console.log(`  Skipped: ${skippedPromo} promo, ${skippedGarbled} garbled, ${skippedNoImg} no-image\n`);

  if (DRY_RUN) {
    console.log("Dry run — no DB writes.");
    return;
  }

  // 1. Ensure destination set rows exist. Look up by `code` first; only
  //    upsert when the code isn't already present, to avoid creating a
  //    duplicate row with a different slug format.
  const setUuids = {};
  for (const code of [OP_HALF, EB_HALF]) {
    let id = await getSetUuid(code);
    if (!id) {
      await sbUpsert(
        "sets",
        [{ slug: code.toLowerCase(), code, name: SET_NAMES[code] ?? code }],
        "slug",
      );
      id = await getSetUuid(code);
    }
    if (!id) { console.error(`Set ${code} missing after upsert — aborting`); process.exit(1); }
    setUuids[code] = id;
  }

  // 2. Pre-load existing cards for insert-vs-patch decisions.
  console.log("Loading existing cards (paged)...");
  const existing = await loadAllExistingCards();
  console.log(`Loaded ${existing.length} existing rows.\n`);
  const byCardImageId = new Map();
  for (const row of existing) if (row.card_image_id) byCardImageId.set(row.card_image_id, row);

  // 3. Walk buckets and apply.
  let patches = 0;
  let noOps = 0;
  const inserts = { [OP_HALF]: 0, [EB_HALF]: 0 };
  const insertBatches = { [OP_HALF]: new Map(), [EB_HALF]: new Map() };

  for (const code of [OP_HALF, EB_HALF]) {
    const setUuid = setUuids[code];
    for (const c of buckets[code]) {
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
        insertBatches[code].set(c.card_image_id, buildInsertRow(c, setUuid));
      }
    }
  }

  for (const code of [OP_HALF, EB_HALF]) {
    const batch = insertBatches[code];
    if (batch.size === 0) continue;
    console.log(`Inserting ${batch.size} new rows into ${code}...`);
    const rows = Array.from(batch.values());
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const ok = await sbUpsert("cards", slice, "card_image_id");
      if (ok) inserts[code] += slice.length;
    }
  }

  console.log(`\n--- Summary for ${BUNDLE} ---`);
  console.log(`Inserted into ${OP_HALF}: ${inserts[OP_HALF]}`);
  console.log(`Inserted into ${EB_HALF}: ${inserts[EB_HALF]}`);
  console.log(`Patched existing rows:    ${patches}`);
  console.log(`No-op (nothing to fill):  ${noOps}`);
  console.log(`Skipped: ${skippedPromo} promo, ${skippedGarbled} garbled, ${skippedNoImg} no-image`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
