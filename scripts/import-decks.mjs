// Backfill: import all starter decks from optcgapi /api/decks/
// Run: SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-decks.mjs

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
const SLEEP_MS = 500;
const ONE_PIECE_DB_SLUG = "one_piece";
const SET_UPSERT_CONFLICT = "game_id,slug";
const CARD_UPSERT_CONFLICT = "game_id,card_image_id";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toDbId(apiId) {
  return apiId.replace("-", ""); // "ST-01" -> "ST01"
}

function prefixFromCardNumber(cardNumber) {
  const text = nullIfNullStr(cardNumber);
  const match = text?.match(/^([A-Z]+\d+)-/i);
  return match ? match[1].toUpperCase() : null;
}

function reprintSyntheticId(card, deckId) {
  const imageId = nullIfNullStr(card.card_image_id);
  const cardNumber = nullIfNullStr(card.card_set_id);
  if (!imageId || !cardNumber) return imageId;
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix || prefix === deckId) return imageId;
  return `${imageId}-${deckId.toLowerCase()}-reprint`;
}

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

function nameBase(name) {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

const VARIANT_PATTERNS = [
  [/\(Manga\)/i, "Manga"],
  [/\(Red Super Alternate Art\)/i, "Red Super Alternate Art"],
  [/\(Super Alternate Art\)/i, "Super Alternate Art"],
  [/\(SP\)[^)]*\(Gold\)/i, "SP Gold"],
  [/\(SP\)[^)]*\(Silver\)/i, "SP Silver"],
  [/\(SP\)/i, "SP"],
  [/\(SPR\)/i, "SP"],
  [/\(TR\)/i, "TR"],
  [/\(Wanted Poster\)/i, "Wanted Poster"],
  [/\(Gold-Stamped Signature\)/i, "Gold-Stamped Signature"],
  [/\(Alternate Art\)/i, "Alternate Art"],
  [/\(Parallel\)/i, "Parallel"],
  [/\(Best Selection\)/i, "Alt Art"],
  [/\(Anniversary\)/i, "Anniversary"],
  [/\(Pre-Release\)/i, "Pre-Release"],
  [/\(Film Red\)/i, "Alt Art"],
  [/\(ONE PIECE DAY\)/i, "Alt Art"],
  [/\(Jolly Roger Foil\)/i, "Jolly Roger Foil"],
  [/\(Reprint\)/i, "Reprint"],
];
function variantLabel(name) {
  for (const [re, label] of VARIANT_PATTERNS) if (re.test(name)) return label;
  return null;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function sbUpsert(table, rows, onConflict) {
  if (rows.length === 0) return true;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
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

async function loadOnePieceGame() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/games?select=id,slug,name&slug=eq.${encodeURIComponent(ONE_PIECE_DB_SLUG)}`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) throw new Error(`games lookup failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const game = data[0] ?? null;
  if (!game?.id) {
    throw new Error("One Piece game row is missing. Run the multi-TCG game migration before importing decks.");
  }
  return game;
}

async function getSetUuid(dbId, gameId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sets?game_id=eq.${encodeURIComponent(gameId)}&code=eq.${encodeURIComponent(dbId)}&select=id`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) throw new Error(`sets lookup failed: ${r.status}`);
  const data = await r.json();
  return data[0]?.id ?? null;
}

// Map an optcgapi card → cards-table row.
// Every row in a batch must have the same key set (PostgREST requirement),
// so always include all columns — use null when the API has no value.
// Columns omitted entirely (tcg_product_id, image_url_small, ...) are
// preserved on update.
function transformCard(c, setUuid, deckId, gameId) {
  const color = nullIfNullStr(c.card_color);
  const subs = nullIfNullStr(c.sub_types);
  return {
    game_id: gameId,
    card_image_id: reprintSyntheticId(c, deckId),
    card_number: c.card_set_id,
    name: c.card_name,
    name_base: nameBase(c.card_name),
    variant_label: variantLabel(c.card_name) ?? (prefixFromCardNumber(c.card_set_id) === deckId ? null : "Reprint"),
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
    image_url: c.card_image ?? null,
  };
}

async function main() {
  const game = await loadOnePieceGame();
  console.log("Fetching deck index...");
  const decks = await fetchJson(`${OPT_BASE}/allDecks/`);
  // Spec gotcha: API returns ST22 out of numeric order — sort defensively.
  decks.sort((a, b) => a.structure_deck_id.localeCompare(b.structure_deck_id));
  console.log(`Found ${decks.length} decks.`);

  let totalCards = 0;
  let setErrors = 0;

  for (const deck of decks) {
    const dbId = toDbId(deck.structure_deck_id);
    const apiId = deck.structure_deck_id;

    try {
      // 1. Upsert into sets table (idempotent per game slug).
      const setOk = await sbUpsert(
        "sets",
        [
          {
            game_id: game.id,
            slug: dbId.toLowerCase(),
            code: dbId,
            name: deck.structure_deck_name,
            series: "STARTER",
          },
        ],
        SET_UPSERT_CONFLICT,
      );
      if (!setOk) {
        setErrors++;
        continue;
      }

      // 2. Resolve UUID for the FK.
      const setUuid = await getSetUuid(dbId, game.id);
      if (!setUuid) {
        console.error(`[${dbId}] set lookup returned no row — skipping`);
        setErrors++;
        continue;
      }

      // 3. Fetch the deck cards from optcgapi.
      const cards = await fetchJson(`${OPT_BASE}/decks/${apiId}/`);
      if (!Array.isArray(cards) || cards.length === 0) {
        console.error(`[${dbId}] empty card array from API — skipping`);
        setErrors++;
        continue;
      }

      // 4. Upsert each card on (game_id, card_image_id). Dedupe by card_image_id
      //    within the batch — Postgres rejects ON CONFLICT touching the
      //    same row twice in one statement.
      const byId = new Map();
      for (const c of cards) byId.set(reprintSyntheticId(c, dbId), transformCard(c, setUuid, dbId, game.id));
      const rows = Array.from(byId.values());
      const cardOk = await sbUpsert("cards", rows, CARD_UPSERT_CONFLICT);
      if (!cardOk) {
        setErrors++;
        continue;
      }

      totalCards += rows.length;
      console.log(`[${dbId}] ${deck.structure_deck_name} — ${rows.length} cards`);
    } catch (err) {
      setErrors++;
      console.error(`[${dbId}] failed:`, err.message);
    }

    await sleep(SLEEP_MS);
  }

  console.log(
    `\nDone. ${totalCards} card upserts across ${decks.length} decks (${setErrors} errors).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
