// Existing-only JustTCG enrichment.
//
// This script matches JustTCG cards onto rows that already exist in Supabase.
// It does not insert cards and does not update optcg-owned card metadata such
// as name, image URLs, set assignment, rarity, or variant_label.
//
// Default mode is a dry run. Use --apply to write price_stats and missing
// cards.tcg_product_id values.
//
// Optional history modes:
//   --history              insert one current price_history point per card
//   --backfill-history     insert JustTCG historical daily points per card
//   --history-duration=1y  history window for --backfill-history

import fs from "node:fs";

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const JUSTTCG_GAME = "one-piece-card-game";
const REPORT_PATH = "justtcg-existing-match-report.md";
const APPLY = process.argv.includes("--apply");
const WRITE_HISTORY = process.argv.includes("--history");
const BACKFILL_HISTORY = process.argv.includes("--backfill-history");
const HISTORY_DURATION = readArg("--history-duration") ?? "1y";
const HISTORY_DURATIONS = new Set(["7d", "30d", "90d", "180d", "1y"]);
const SETS_FILTER = readArg("--sets")
  ?.split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

if (BACKFILL_HISTORY && !HISTORY_DURATIONS.has(HISTORY_DURATION)) {
  throw new Error(`Unsupported --history-duration=${HISTORY_DURATION}`);
}

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

async function sbWrite(method, path, rows, extraHeaders = {}) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: restHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...extraHeaders,
    }),
    body: JSON.stringify(rows),
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

async function fetchJustTcgCardsForSet(slug) {
  const rows = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const params = [
      `game=${encodeURIComponent(JUSTTCG_GAME)}`,
      `set=${encodeURIComponent(slug)}`,
      `include_price_history=${BACKFILL_HISTORY ? "true" : "false"}`,
      "include_null_prices=false",
      `limit=${limit}`,
      `offset=${offset}`,
    ];
    if (BACKFILL_HISTORY) {
      params.push(`priceHistoryDuration=${encodeURIComponent(HISTORY_DURATION)}`);
    }
    const body = await justTcgJson(
      `/cards?${params.join("&")}`
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
  const map = new Map();
  const re = /"([^"]+)":\s*"([A-Z0-9]+)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

function nullIfEmpty(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^n\/?a$/i.test(text) || /^null$/i.test(text)) return null;
  return text;
}

function prefixFromCardNumber(cardNumber) {
  const text = nullIfEmpty(cardNumber);
  if (!text) return null;
  const withDigits = text.match(/^([A-Z]+\d+)-/i);
  if (withDigits) return withDigits[1].toUpperCase();
  const promo = text.match(/^([A-Z]+)-/i);
  return promo ? promo[1].toUpperCase() : null;
}

function allowsCardNumberInSet(setCode, cardNumber) {
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix) return false;
  if (setCode === "P" || setCode.startsWith("EB") || setCode.startsWith("PRB")) {
    return true;
  }
  return prefix === setCode;
}

function slugifySetName(name) {
  const text = nullIfEmpty(name);
  if (!text) return null;
  return `${text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-one-piece-card-game`;
}

function justTcgSetSlugCandidates(set) {
  return [set.id, set.slug, set.set, set.code, slugifySetName(set.name)]
    .filter(Boolean)
    .map(String);
}

function expectedVariantLabel(name) {
  const text = nullIfEmpty(name) ?? "";
  const tags = [];
  const re = /\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const tag = match[1].trim();
    if (!/^\d+$/.test(tag)) tags.push(tag);
  }
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
  if (joined.includes("alternate art")) return "Alternate Art";
  if (joined.includes("parallel")) return "Parallel";
  if (joined.includes("jolly roger foil")) return "Jolly Roger Foil";
  if (joined.includes("reprint")) return "Reprint";
  return null;
}

function variantKey(label) {
  const normalized = (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "";
  if (normalized === "alternateart" || normalized === "parallel" || normalized === "altart") {
    return "altart";
  }
  if (normalized === "spr") return "sp";
  return normalized;
}

function variantsEquivalent(a, b) {
  return Boolean(a && b && a === b);
}

function baseName(name) {
  return (nullIfEmpty(name) ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function priceStatsFor(card) {
  const stats = card.price_stats;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats ?? null;
}

function chooseVariant(jtCard, isVariantCard) {
  const variants = Array.isArray(jtCard.variants) ? jtCard.variants : [];
  const nearMint = variants.filter((variant) => {
    const condition = String(variant.condition ?? "").toLowerCase();
    return condition === "near mint" && numeric(variant.price) !== null && numeric(variant.price) > 0;
  });
  const normal = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() === "normal");
  const foil = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() !== "normal");
  return isVariantCard ? foil ?? normal ?? nearMint[0] ?? null : normal ?? foil ?? nearMint[0] ?? null;
}

function setCodeForCard(card, setById) {
  return (setById.get(card.set_id)?.code ?? "").toUpperCase();
}

function buildIndexes(cards, setById) {
  const bySetNumber = new Map();
  const byTcgProductId = new Map();
  for (const card of cards) {
    const code = setCodeForCard(card, setById);
    const number = nullIfEmpty(card.card_number);
    if (code && number) {
      const key = `${code}|${number}`;
      const bucket = bySetNumber.get(key) ?? [];
      bucket.push(card);
      bySetNumber.set(key, bucket);
    }
    if (card.tcg_product_id) {
      const bucket = byTcgProductId.get(String(card.tcg_product_id)) ?? [];
      bucket.push(card);
      byTcgProductId.set(String(card.tcg_product_id), bucket);
    }
  }
  return { bySetNumber, byTcgProductId };
}

function scoreCandidate(card, jtCard, jtNumber, jtVariantKey) {
  const dbVariantKey = variantKey(card.variant_label);
  const dbNameVariantKey = variantKey(expectedVariantLabel(card.name));
  const dbAnyVariantKey = dbVariantKey || dbNameVariantKey;
  const exactBaseImage = Boolean(jtNumber && card.card_image_id === jtNumber);
  const cardImage = String(card.card_image_id ?? "");
  const looksLikeImageVariant = /(?:_p\d+|_r\d+|-alt|-manga|-parallel)/i.test(cardImage);
  const jtBase = baseName(jtCard.name);
  const dbBase = baseName(card.name_base ?? card.name);
  let score = 0;

  if (jtBase && dbBase && jtBase !== dbBase) score += 12;

  if (!jtVariantKey) {
    if (exactBaseImage && !dbAnyVariantKey) score -= 50;
    if (dbAnyVariantKey) score += 80;
    if (!exactBaseImage && looksLikeImageVariant) score += 30;
  } else {
    if (dbAnyVariantKey && variantsEquivalent(dbAnyVariantKey, jtVariantKey)) {
      score -= 55;
    } else {
      score += 80;
    }
    if (exactBaseImage && !dbAnyVariantKey) score += 120;
    if (!exactBaseImage && looksLikeImageVariant) score -= 10;
  }

  if (card.tcg_product_id && card.tcg_product_id === jtCard.id) score -= 100;
  if (card.tcg_product_id && card.tcg_product_id !== jtCard.id) score += 10;

  return score;
}

function findExistingMatch(jtCard, setCode, indexes, setById) {
  const jtNumber = nullIfEmpty(jtCard.number);
  if (!jtNumber) return { card: null, reason: "no_number" };
  if (!allowsCardNumberInSet(setCode, jtNumber)) {
    return { card: null, reason: "prefix_mismatch" };
  }

  const direct = jtCard.id
    ? (indexes.byTcgProductId.get(String(jtCard.id)) ?? []).filter(
        (card) => setCodeForCard(card, setById) === setCode && nullIfEmpty(card.card_number) === jtNumber
      )
    : [];
  if (direct.length === 1) {
    return { card: direct[0], reason: "tcg_product_id", score: -100 };
  }

  const candidates = indexes.bySetNumber.get(`${setCode}|${jtNumber}`) ?? [];
  if (candidates.length === 0) return { card: null, reason: "no_existing_card" };

  const jtVariantKey = variantKey(expectedVariantLabel(jtCard.name));
  const scored = candidates
    .map((card) => ({
      card,
      score: scoreCandidate(card, jtCard, jtNumber, jtVariantKey),
    }))
    .sort((a, b) => a.score - b.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return { card: null, reason: "no_existing_card" };
  if (second && second.score === best.score) {
    return { card: null, reason: "ambiguous", candidates: scored.slice(0, 5) };
  }
  if (best.score >= 60) {
    return { card: null, reason: "low_confidence", candidates: scored.slice(0, 5) };
  }

  return { card: best.card, reason: "set_number_variant", score: best.score };
}

function makePriceUpsert(cardId, variant) {
  const now = new Date().toISOString();
  const price = numeric(variant.price);
  return {
    card_id: cardId,
    tcg_market: price,
    tcg_low: numeric(variant.minPrice30d) ?? numeric(variant.minPrice7d),
    tcg_mid: numeric(variant.avgPrice30d) ?? numeric(variant.avgPrice),
    tcg_high: numeric(variant.maxPrice30d) ?? numeric(variant.maxPrice7d),
    market_avg: numeric(variant.avgPrice30d) ?? numeric(variant.avgPrice) ?? price,
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

function utcDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function historyDayKey(cardId, recordedAt) {
  const day = utcDay(recordedAt);
  return day ? `${cardId}|${day}` : null;
}

function makeCurrentHistoryInsert(cardId, match) {
  return {
    card_id: cardId,
    tcg_market: match.jtPrice,
    market_avg: numeric(match.variant.avgPrice30d) ?? numeric(match.variant.avgPrice) ?? match.jtPrice,
    recorded_at: new Date().toISOString(),
  };
}

function historyRowsForVariant(cardId, variant) {
  const points = Array.isArray(variant.priceHistory)
    ? variant.priceHistory
    : Array.isArray(variant.priceHistory30d)
      ? variant.priceHistory30d
      : [];
  const rows = [];
  for (const point of points) {
    const price = numeric(point?.p);
    const timestamp = numeric(point?.t);
    if (price === null || price <= 0 || timestamp === null) continue;
    rows.push({
      card_id: cardId,
      tcg_market: price,
      market_avg: price,
      recorded_at: new Date(timestamp * 1000).toISOString(),
    });
  }
  return rows;
}

function dedupeHistoryRows(rows) {
  const byCardDay = new Map();
  for (const row of rows) {
    const key = historyDayKey(row.card_id, row.recorded_at);
    if (!key) continue;
    const existing = byCardDay.get(key);
    if (!existing || new Date(row.recorded_at).getTime() >= new Date(existing.recorded_at).getTime()) {
      byCardDay.set(key, row);
    }
  }
  return Array.from(byCardDay.values()).sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
}

async function fetchExistingHistoryDayKeys(cardIds, chunkSize = 100) {
  const keys = new Set();
  const uniqueIds = Array.from(new Set(cardIds.filter(Boolean)));
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const rows = await sbFetchAll(
      `price_history?select=card_id,recorded_at&card_id=in.(${chunk.join(",")})`,
      1000
    );
    for (const row of rows) {
      const key = historyDayKey(row.card_id, row.recorded_at);
      if (key) keys.add(key);
    }
  }
  return keys;
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
    sbFetchAll("cards?select=id,card_image_id,card_number,name,name_base,variant_label,set_id,rarity,tcg_product_id,price_stats(tcg_market,market_avg,updated_at)"),
  ]);

  const setById = new Map(dbSets.map((set) => [set.id, set]));
  const setBucketsByCode = new Map();
  for (const set of dbSets) {
    if (!set.code) continue;
    const code = String(set.code).toUpperCase();
    const bucket = setBucketsByCode.get(code) ?? [];
    bucket.push(set);
    setBucketsByCode.set(code, bucket);
  }
  const setByCode = new Map();
  for (const [code, sets] of setBucketsByCode.entries()) {
    setByCode.set(
      code,
      sets.slice().sort((a, b) => (Number(b.card_count) || 0) - (Number(a.card_count) || 0))[0]
    );
  }

  const slugMap = parseSetSlugMap();
  const indexes = buildIndexes(dbCards, setById);

  console.log("Fetching JustTCG set index...");
  const rawSets = justTcgRows(await justTcgJson(`/sets?game=${encodeURIComponent(JUSTTCG_GAME)}&limit=200`));
  const mappedSets = [];
  const seenSlugs = new Set();
  const unmappedSets = [];

  for (const jtSet of rawSets) {
    const slug = justTcgSetSlugCandidates(jtSet).find((candidate) => slugMap.has(candidate));
    const setCode = slug ? slugMap.get(slug) : null;
    if (!slug || !setCode) {
      unmappedSets.push({
        id: jtSet.id ?? "",
        name: jtSet.name ?? "",
        candidates: justTcgSetSlugCandidates(jtSet).join(", "),
      });
      continue;
    }
    if (SETS_FILTER && !SETS_FILTER.includes(setCode)) continue;
    if (!setByCode.has(setCode)) continue;
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    mappedSets.push({ slug, setCode, name: jtSet.name ?? "", sourceCount: jtSet.cards_count ?? jtSet.count ?? null });
  }

  const matches = [];
  const skipped = {
    no_number: 0,
    prefix_mismatch: 0,
    no_existing_card: 0,
    ambiguous: 0,
    low_confidence: 0,
    no_price: 0,
  };
  const perSet = [];
  const matchSamples = [];
  const skipSamples = [];

  for (const row of mappedSets) {
    console.log(`Fetching ${row.setCode} ${row.slug}...`);
    let cards = [];
    let fetchError = null;
    try {
      cards = await fetchJustTcgCardsForSet(row.slug);
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
    }

    let setMatched = 0;
    for (const jtCard of cards) {
      const match = findExistingMatch(jtCard, row.setCode, indexes, setById);
      if (!match.card) {
        skipped[match.reason] = (skipped[match.reason] ?? 0) + 1;
        if (skipSamples.length < 100) {
          skipSamples.push([row.setCode, jtCard.number ?? "", jtCard.name ?? "", match.reason]);
        }
        continue;
      }

      const jtVariantKey = variantKey(expectedVariantLabel(jtCard.name));
      const dbVariantKey = variantKey(match.card.variant_label);
      const variant = chooseVariant(jtCard, Boolean(jtVariantKey || dbVariantKey));
      if (!variant) {
        skipped.no_price++;
        if (skipSamples.length < 100) {
          skipSamples.push([row.setCode, jtCard.number ?? "", jtCard.name ?? "", "no_price"]);
        }
        continue;
      }

      const price = numeric(variant.price);
      if (price === null || price <= 0) {
        skipped.no_price++;
        continue;
      }

      const dbStats = priceStatsFor(match.card);
      matches.push({
        setCode: row.setCode,
        slug: row.slug,
        jtId: jtCard.id,
        jtNumber: jtCard.number,
        jtName: jtCard.name,
        dbCard: match.card,
        matchReason: match.reason,
        matchScore: match.score,
        variant,
        dbPrice: dbStats?.tcg_market ?? null,
        jtPrice: price,
      });
      setMatched++;
      if (matchSamples.length < 100) {
        matchSamples.push([
          row.setCode,
          jtCard.number ?? "",
          jtCard.name ?? "",
          match.card.card_image_id,
          match.card.variant_label ?? "",
          price,
          dbStats?.tcg_market ?? "",
        ]);
      }
    }

    perSet.push({
      ...row,
      fetched: cards.length,
      matched: setMatched,
      fetchError,
    });
  }

  const grouped = new Map();
  for (const match of matches) {
    const bucket = grouped.get(match.dbCard.id) ?? [];
    bucket.push(match);
    grouped.set(match.dbCard.id, bucket);
  }

  const duplicateConflicts = [];
  const safeMatches = [];
  for (const group of grouped.values()) {
    const uniqueJtIds = new Set(group.map((match) => match.jtId));
    if (uniqueJtIds.size === 1) {
      safeMatches.push(group[group.length - 1]);
      continue;
    }
    duplicateConflicts.push(group);
  }

  const priceUpserts = safeMatches.map((match) => makePriceUpsert(match.dbCard.id, match.variant));
  const currentHistoryRows = WRITE_HISTORY
    ? safeMatches.map((match) => makeCurrentHistoryInsert(match.dbCard.id, match))
    : [];
  const backfillHistoryRows = BACKFILL_HISTORY
    ? safeMatches.flatMap((match) => historyRowsForVariant(match.dbCard.id, match.variant))
    : [];
  let historyInserts = dedupeHistoryRows([...backfillHistoryRows, ...currentHistoryRows]);
  let existingHistoryRowsSkipped = 0;

  if (historyInserts.length > 0) {
    console.log("Checking existing price_history days...");
    const existingHistoryDays = await fetchExistingHistoryDayKeys(historyInserts.map((row) => row.card_id));
    const before = historyInserts.length;
    historyInserts = historyInserts.filter((row) => {
      const key = historyDayKey(row.card_id, row.recorded_at);
      return key && !existingHistoryDays.has(key);
    });
    existingHistoryRowsSkipped = before - historyInserts.length;
  }

  const cardIdFills = [];
  const productConflicts = [];
  for (const match of safeMatches) {
    const existing = nullIfEmpty(match.dbCard.tcg_product_id);
    if (!existing && match.jtId) {
      cardIdFills.push({
        id: match.dbCard.id,
        card_image_id: match.dbCard.card_image_id,
        card_number: match.dbCard.card_number,
        set_id: match.dbCard.set_id,
        tcg_product_id: match.jtId,
      });
    } else if (existing && match.jtId && existing !== match.jtId) {
      productConflicts.push(match);
    }
  }

  const report = [];
  report.push("# JustTCG Existing-Only Match Report");
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
      ["JustTCG sets read", rawSets.length],
      ["Mapped JustTCG slugs fetched", mappedSets.length],
      ["JustTCG card records fetched", perSet.reduce((sum, row) => sum + row.fetched, 0)],
      ["Matched existing DB rows", matches.length],
      ["Safe unique row matches", safeMatches.length],
      ["Price rows to upsert", priceUpserts.length],
      ["Current-day history rows found", currentHistoryRows.length],
      ["Backfill history rows found", backfillHistoryRows.length],
      ["History rows already present by card/day", existingHistoryRowsSkipped],
      ["History rows to insert", historyInserts.length],
      ["Missing tcg_product_id values to fill", cardIdFills.length],
      ["Duplicate JustTCG matches skipped", duplicateConflicts.length],
      ["Existing tcg_product_id conflicts skipped", productConflicts.length],
      ["Skipped no number", skipped.no_number],
      ["Skipped prefix mismatch", skipped.prefix_mismatch],
      ["Skipped no existing card", skipped.no_existing_card],
      ["Skipped ambiguous", skipped.ambiguous],
      ["Skipped low confidence", skipped.low_confidence],
      ["Skipped no price", skipped.no_price],
      ["Unmapped JustTCG sets", unmappedSets.length],
    ]
  ));
  report.push("");

  report.push("## Per Set");
  report.push("");
  report.push(mdTable(
    ["Set", "Slug", "Name", "Fetched", "Matched", "Fetch Error"],
    perSet.map((row) => [row.setCode, row.slug, row.name, row.fetched, row.matched, row.fetchError ?? ""])
  ));
  report.push("");

  report.push("## Match Samples");
  report.push("");
  report.push(mdTable(
    ["Set", "Card #", "JustTCG Name", "DB card_image_id", "DB Variant", "JustTCG Price", "DB tcg_market"],
    matchSamples
  ));
  report.push("");

  report.push("## Skip Samples");
  report.push("");
  report.push(mdTable(["Set", "Card #", "JustTCG Name", "Reason"], skipSamples));
  report.push("");

  if (duplicateConflicts.length > 0) {
    report.push("## Duplicate Match Conflicts");
    report.push("");
    report.push(mdTable(
      ["DB card_image_id", "DB Card #", "JustTCG IDs"],
      sample(duplicateConflicts).map((group) => [
        group[0].dbCard.card_image_id,
        group[0].dbCard.card_number,
        group.map((match) => `${match.jtId} (${match.jtPrice})`).join("; "),
      ])
    ));
    report.push("");
  }

  if (productConflicts.length > 0) {
    report.push("## tcg_product_id Conflicts");
    report.push("");
    report.push(mdTable(
      ["Set", "DB card_image_id", "Existing", "JustTCG ID"],
      sample(productConflicts).map((match) => [
        match.setCode,
        match.dbCard.card_image_id,
        match.dbCard.tcg_product_id,
        match.jtId,
      ])
    ));
    report.push("");
  }

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);

  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Safe unique matches: ${safeMatches.length}`);
  console.log(`Price upserts: ${priceUpserts.length}`);
  console.log(`Current-day history rows found: ${currentHistoryRows.length}`);
  console.log(`Backfill history rows found: ${backfillHistoryRows.length}`);
  console.log(`History rows already present by card/day: ${existingHistoryRowsSkipped}`);
  console.log(`History rows to insert: ${historyInserts.length}`);
  console.log(`Missing tcg_product_id fills: ${cardIdFills.length}`);
  console.log(`Skipped duplicate conflicts: ${duplicateConflicts.length}`);

  if (!APPLY) {
    console.log(
      "Dry run only. Re-run with --apply to write price_stats, missing tcg_product_id values, and requested price_history rows."
    );
    return;
  }

  console.log("Applying price_stats upserts...");
  await upsertRows("price_stats", priceUpserts, "card_id");

  if (cardIdFills.length > 0) {
    console.log("Filling missing cards.tcg_product_id values...");
    await upsertRows("cards", cardIdFills, "id");
  }

  if ((WRITE_HISTORY || BACKFILL_HISTORY) && historyInserts.length > 0) {
    console.log("Inserting price_history rows...");
    await insertRows("price_history", historyInserts);
  }

  console.log("Apply complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
