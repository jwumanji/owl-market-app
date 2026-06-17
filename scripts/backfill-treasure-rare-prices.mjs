// Targeted Treasure Rare JustTCG price/history repair.
//
// Dry run:
//   node scripts/backfill-treasure-rare-prices.mjs
//
// Apply:
//   node scripts/backfill-treasure-rare-prices.mjs --apply
//
// Optional:
//   --sets=OP06,OP07,OP10,OP11,OP12,OP13,EB04

import fs from "node:fs";

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const JUSTTCG_GAME = "one-piece-card-game";
const ONE_PIECE_DB_SLUG = "one_piece";
const PRICE_STATS_UPSERT_CONFLICT = "game_id,card_id";
const APPLY = process.argv.includes("--apply");
const TARGET_SET_CODES = (
  readArg("--sets") ?? "OP06,OP07,OP10,OP11,OP12,OP13,EB04"
)
  .split(",")
  .map((code) => code.trim().toUpperCase())
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
const JUSTTCG_KEY = process.env.JUSTTCG_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!JUSTTCG_KEY) {
  throw new Error("Missing JUSTTCG_API_KEY");
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

async function sbWrite(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...extraHeaders,
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Supabase write ${path} failed: ${res.status} ${await res.text()}`);
  }
}

async function upsertRows(table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await sbWrite(
      "POST",
      `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      rows.slice(i, i + chunkSize),
      { Prefer: "resolution=merge-duplicates,return=minimal" }
    );
  }
}

async function insertRows(table, rows, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await sbWrite("POST", table, rows.slice(i, i + chunkSize));
  }
}

async function patchCardProductId(gameId, cardId, tcgProductId) {
  await sbWrite(
    "PATCH",
    `cards?game_id=eq.${encodeURIComponent(gameId)}&id=eq.${encodeURIComponent(cardId)}`,
    { tcg_product_id: tcgProductId }
  );
}

async function justTcgJson(path, attempt = 0) {
  const res = await fetch(`${JUSTTCG_BASE}${path}`, {
    headers: {
      "x-api-key": JUSTTCG_KEY,
      Accept: "application/json",
    },
  });
  if (res.status === 429 && attempt < 5) {
    await sleep(2500 * (attempt + 1));
    return justTcgJson(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`JustTCG ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function justTcgRows(body) {
  if (Array.isArray(body)) return body;
  return body?.data ?? [];
}

function justTcgHasMore(body) {
  return Boolean(body?.pagination?.hasMore ?? body?.meta?.hasMore);
}

async function fetchJustTcgCardsForSlug(slug) {
  const rows = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const body = await justTcgJson(
      `/cards?game=${encodeURIComponent(JUSTTCG_GAME)}&set=${encodeURIComponent(slug)}&include_price_history=true&priceHistoryDuration=1y&include_null_prices=false&limit=${limit}&offset=${offset}`
    );
    const page = justTcgRows(body);
    rows.push(...page);
    if (!justTcgHasMore(body) || page.length === 0 || page.length < limit) break;
    offset += limit;
  }
  return rows;
}

function parseSetSlugMap() {
  const text = fs.readFileSync("src/lib/justtcg-match.ts", "utf8");
  const rows = [];
  const re = /"([^"]+)":\s*"([A-Z0-9]+)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    rows.push({ slug: match[1], code: match[2] });
  }
  return rows;
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = numeric(value);
  return number === null ? "" : `$${number.toFixed(2)}`;
}

function utcDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historyDayKey(gameId, cardId, recordedAt) {
  const day = utcDay(recordedAt);
  return day ? `${gameId}|${cardId}|${day}` : null;
}

function providerHasTreasureTag(card) {
  return /\(TR\)|treasure rare/i.test(card?.name ?? "");
}

function chooseNearMintVariant(card) {
  const nearMint = (card.variants ?? []).filter((variant) => {
    return (
      String(variant.condition ?? "").toLowerCase() === "near mint" &&
      numeric(variant.price) !== null &&
      numeric(variant.price) > 0
    );
  });
  return (
    nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() !== "normal") ??
    nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() === "normal") ??
    nearMint[0] ??
    null
  );
}

function variantAverage(variant) {
  return (
    numeric(variant?.avgPrice30d) ??
    numeric(variant?.avgPrice) ??
    numeric(variant?.price)
  );
}

function buildPriceStats(gameId, cardId, variant, now) {
  const price = numeric(variant.price);
  const average = variantAverage(variant);
  if (price === null || average === null) return null;
  return {
    game_id: gameId,
    card_id: cardId,
    tcg_market: price,
    tcg_low: numeric(variant.minPrice30d) ?? numeric(variant.minPrice7d),
    tcg_mid: numeric(variant.avgPrice30d) ?? numeric(variant.avgPrice),
    tcg_high: numeric(variant.maxPrice30d) ?? numeric(variant.maxPrice7d),
    market_avg: average,
    chg_1d: numeric(variant.priceChange24hr),
    chg_7d: numeric(variant.priceChange7d),
    chg_30d: numeric(variant.priceChange30d),
    ath: numeric(variant.maxPriceAllTime),
    ath_date: variant.maxPriceAllTimeDate ?? null,
    atl: numeric(variant.minPriceAllTime),
    atl_date: variant.minPriceAllTimeDate ?? null,
    updated_at: now,
  };
}

function historyRowsForVariant(gameId, cardId, variant, now) {
  const rows = [];
  const points = Array.isArray(variant.priceHistory)
    ? variant.priceHistory
    : Array.isArray(variant.priceHistory30d)
      ? variant.priceHistory30d
      : [];

  for (const point of points) {
    const price = numeric(point?.p);
    const timestamp = numeric(point?.t);
    if (price === null || price <= 0 || timestamp === null) continue;
    const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
    rows.push({
      game_id: gameId,
      card_id: cardId,
      tcg_market: price,
      market_avg: price,
      recorded_at: new Date(ms).toISOString(),
    });
  }

  const price = numeric(variant.price);
  const average = variantAverage(variant);
  if (price !== null && price > 0 && average !== null && average > 0) {
    rows.push({
      game_id: gameId,
      card_id: cardId,
      tcg_market: price,
      market_avg: average,
      recorded_at: now,
    });
  }

  return rows;
}

function dedupeHistoryRows(rows) {
  const byCardDay = new Map();
  for (const row of rows) {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
    if (!key) continue;
    const existing = byCardDay.get(key);
    if (!existing || new Date(row.recorded_at).getTime() >= new Date(existing.recorded_at).getTime()) {
      byCardDay.set(key, row);
    }
  }
  return Array.from(byCardDay.values());
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

function priceStatsFor(card) {
  const stats = card.price_stats;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats ?? null;
}

async function main() {
  const now = new Date().toISOString();
  const [game] = await sbFetchAll(
    `games?select=id,slug,name&slug=eq.${encodeURIComponent(ONE_PIECE_DB_SLUG)}`,
    1
  );
  if (!game?.id) throw new Error("One Piece game row is missing.");

  const [sets, treasureCards] = await Promise.all([
    sbFetchAll(`sets?select=id,code,slug,name&game_id=eq.${encodeURIComponent(game.id)}`),
    sbFetchAll(
      `cards?select=id,set_id,card_image_id,card_number,name,variant_label,rarity,tcg_product_id,price_stats!price_stats_card_game_fk(tcg_market,market_avg,updated_at)&game_id=eq.${encodeURIComponent(game.id)}&rarity=eq.TR&order=card_image_id.asc`
    ),
  ]);

  const setById = new Map(sets.map((set) => [set.id, set]));
  const providerCards = [];
  const slugRows = parseSetSlugMap().filter((row) => TARGET_SET_CODES.includes(row.code));

  for (const row of slugRows) {
    const cards = await fetchJustTcgCardsForSlug(row.slug);
    for (const card of cards) {
      if (providerHasTreasureTag(card)) {
        providerCards.push({ ...card, _setCode: row.code, _setSlug: row.slug });
      }
    }
  }

  const providerByNumber = new Map();
  for (const card of providerCards) {
    if (!card.number) continue;
    const bucket = providerByNumber.get(card.number) ?? [];
    bucket.push(card);
    providerByNumber.set(card.number, bucket);
  }

  const matches = [];
  for (const dbCard of treasureCards) {
    const dbSet = setById.get(dbCard.set_id);
    const providers = providerByNumber.get(dbCard.card_number) ?? [];
    const provider =
      providers.find((card) => card._setCode === dbSet?.code) ??
      providers[0] ??
      null;
    const variant = provider ? chooseNearMintVariant(provider) : null;
    matches.push({ dbCard, dbSet, provider, variant });
  }

  const matched = matches.filter((match) => match.provider && match.variant);
  const priceUpserts = [];
  const productUpdates = [];
  const historyRows = [];

  for (const match of matched) {
    const stats = buildPriceStats(game.id, match.dbCard.id, match.variant, now);
    if (stats) priceUpserts.push(stats);
    if (match.provider.id && match.dbCard.tcg_product_id !== match.provider.id) {
      productUpdates.push({
        card_id: match.dbCard.id,
        card_image_id: match.dbCard.card_image_id,
        previous: match.dbCard.tcg_product_id,
        next: match.provider.id,
      });
    }
    historyRows.push(...historyRowsForVariant(game.id, match.dbCard.id, match.variant, now));
  }

  const dedupedHistoryRows = dedupeHistoryRows(historyRows);
  const existingRows = matched.length
    ? await sbFetchAll(
        `price_history?select=game_id,card_id,recorded_at&game_id=eq.${encodeURIComponent(game.id)}&card_id=in.(${matched.map((match) => match.dbCard.id).join(",")})`
      )
    : [];
  const existingKeys = new Set(
    existingRows
      .map((row) => historyDayKey(row.game_id, row.card_id, row.recorded_at))
      .filter(Boolean)
  );
  const historyInserts = dedupedHistoryRows.filter((row) => {
    const key = historyDayKey(row.game_id, row.card_id, row.recorded_at);
    return key && !existingKeys.has(key);
  });

  const reportRows = matches.map((match) => {
    const stats = priceStatsFor(match.dbCard);
    return [
      match.dbSet?.code ?? "",
      match.dbCard.card_image_id,
      match.dbCard.card_number,
      match.dbCard.name,
      money(stats?.market_avg ?? stats?.tcg_market),
      match.provider?._setCode ?? "",
      match.provider?.id ?? "",
      money(variantAverage(match.variant)),
      money(match.variant?.price),
      (match.variant?.priceHistory ?? match.variant?.priceHistory30d ?? []).length,
    ];
  });

  console.log(mdTable(
    ["DB Set", "card_image_id", "Card #", "Name", "DB Avg", "JT Set", "JT Product", "JT Avg", "JT Market", "History points"],
    reportRows
  ));
  console.log("");
  console.log(`Matched TR rows: ${matched.length}/${treasureCards.length}`);
  console.log(`price_stats upserts: ${priceUpserts.length}`);
  console.log(`price_history rows to insert: ${historyInserts.length}`);
  console.log(`tcg_product_id updates: ${productUpdates.length}`);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to write changes.");
    return;
  }

  if (priceUpserts.length) {
    await upsertRows("price_stats", priceUpserts, PRICE_STATS_UPSERT_CONFLICT);
  }
  if (historyInserts.length) {
    await insertRows("price_history", historyInserts);
  }
  for (const update of productUpdates) {
    await patchCardProductId(game.id, update.card_id, update.next);
  }
  console.log("Applied Treasure Rare price/history backfill.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
