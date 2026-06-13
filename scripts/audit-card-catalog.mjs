// Read-only catalog audit:
// - Compares Supabase cards/sets to optcgapi booster, deck, and promo data.
// - Flags missing cards, wrong set assignment, field mismatches, and variant rarity issues.
// - Does not mutate the database.

import fs from "node:fs";
import { loadGameScope, scriptGameSlug, withGameFilter } from "./lib/supabase-game-scope.mjs";

const OPT_BASE = "https://optcgapi.com/api";
const OPT_IMAGE_BASE = "https://optcgapi.com/media/static/Card_Images";
const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const JUSTTCG_GAME = "one-piece-card-game";
const REPORT_PATH = "catalog-audit-report.md";

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

async function optJson(path) {
  const res = await fetch(`${OPT_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`optcgapi ${path} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function justTcgJson(path, attempt = 0) {
  if (!JUSTTCG_KEY) {
    throw new Error("JUSTTCG_API_KEY is not set");
  }
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

function nullIfNullStr(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || /^null$/i.test(s) || /^n\/?a$/i.test(s)) return null;
  return s;
}

function normText(value) {
  return nullIfNullStr(value)?.replace(/\s+/g, " ") ?? null;
}

function toInt(value) {
  const s = nullIfNullStr(value);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function arrayText(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.filter(Boolean).map(String).join(" ");
}

function compactCode(value) {
  const s = nullIfNullStr(value);
  if (!s) return null;
  return s.replace(/-/g, "").toUpperCase();
}

function prefixFromCardNumber(cardNumber) {
  const s = nullIfNullStr(cardNumber);
  if (!s) return null;
  const withDigits = s.match(/^([A-Z]+\d+)-/i);
  if (withDigits) return withDigits[1].toUpperCase();
  const promo = s.match(/^([A-Z]+)-/i);
  if (promo) return promo[1].toUpperCase();
  return null;
}

function allowsCardNumberInSet(setCode, cardNumber) {
  const prefix = prefixFromCardNumber(cardNumber);
  if (!prefix) return false;
  if (setCode === "P" || setCode.startsWith("EB") || setCode.startsWith("PRB")) {
    return true;
  }
  return prefix === setCode;
}

function endpointCodeFromSet(set) {
  const id = set.set_id ?? set.structure_deck_id;
  const compact = compactCode(id);
  if (compact === "OP14EB04") return "OP14";
  if (compact === "OP15EB04") return "OP15";
  return compact;
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
  if (joined.includes("red super alternate art") || joined.includes("super alternate art")) return "Super Alternate Art";
  if (/\bspr\b/.test(joined)) return "SP";
  if (/\btr\b/.test(joined)) return "TR";
  if (joined.includes("sp") && joined.includes("gold")) return "SP Gold";
  if (/\bsp\b/.test(joined)) return "SP";
  if (joined.includes("wanted poster")) return "Wanted Poster";
  if (joined.includes("gold-stamped signature")) return "Gold-Stamped Signature";
  if (joined.includes("alternate art")) return "Alternate Art";
  if (joined.includes("parallel")) return "Parallel";
  if (joined.includes("reprint")) return "Reprint";
  if (joined.includes("jolly roger foil")) return "Jolly Roger Foil";
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
  if (/\(red super alternate art\)/i.test(hay) || /\(super alternate art\)/i.test(hay)) return "SAR";
  if (/\(sp\)/i.test(hay) || /\(spr\)/i.test(hay) || /\(wanted poster\)/i.test(hay)) return "SP";
  if (/\(alternate art\)/i.test(hay)) return "AA";
  return base;
}

function parseSetSlugMap() {
  const file = "src/lib/justtcg-match.ts";
  if (!fs.existsSync(file)) return new Map();
  const text = fs.readFileSync(file, "utf8");
  const map = new Map();
  const re = /"([^"]+)":\s*"([A-Z0-9]+)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

function slugifySetName(name) {
  const text = nullIfNullStr(name);
  if (!text) return null;
  return `${text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-one-piece-card-game`;
}

function justTcgSetSlug(set) {
  const candidates = [
    set.id,
    set.slug,
    set.set,
    set.code,
    set.name ? slugifySetName(set.name) : null,
  ].filter(Boolean);
  return candidates.map(String);
}

function normalizeVariantLabel(label) {
  return nullIfNullStr(label)?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
}

function variantKey(label) {
  const normalized = normalizeVariantLabel(label);
  if (!normalized) return "";
  if (normalized === "alternateart" || normalized === "parallel" || normalized === "altart") {
    return "altart";
  }
  if (normalized === "spr") return "sp";
  return normalized;
}

function rarityKey(value) {
  const normalized = normalizeVariantLabel(value);
  if (!normalized) return "";
  const map = {
    leader: "L",
    l: "L",
    common: "C",
    c: "C",
    uncommon: "UC",
    uc: "UC",
    rare: "R",
    r: "R",
    superrare: "SR",
    sr: "SR",
    secretrare: "SEC",
    sec: "SEC",
    promo: "PR",
    pr: "PR",
    don: "DON!!",
    doncard: "DON!!",
    doncards: "DON!!",
    aa: "AA",
    alternaterare: "AA",
    manga: "MR",
    mr: "MR",
    specialalternative: "SAR",
    sar: "SAR",
    sp: "SP",
    tr: "TR",
  };
  return map[normalized] ?? normalized.toUpperCase();
}

function numeric(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nameWithoutTags(name) {
  return (normText(name) ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function priceStatsFor(card) {
  const stats = card.price_stats;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats ?? null;
}

function bestJustTcgVariant(card) {
  const variants = Array.isArray(card.variants) ? card.variants : [];
  const expectedVariant = variantKey(expectedVariantLabel(card.name));
  const nearMint = variants.filter((variant) => {
    const condition = String(variant.condition ?? "").toLowerCase();
    const price = numeric(variant.price);
    return condition === "near mint" && price != null && price > 0;
  });
  const normal = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() === "normal");
  const foil = nearMint.find((variant) => String(variant.printing ?? "").toLowerCase() !== "normal");
  if (nearMint.length > 0) return expectedVariant ? foil ?? normal ?? nearMint[0] : normal ?? foil ?? nearMint[0];
  return (
    variants.find((v) => v.condition === "Near Mint" && v.printing === "Foil") ??
    variants.find((v) => v.condition === "Near Mint" && v.printing === "Normal") ??
    variants.find((v) => v.condition === "Near Mint") ??
    null
  );
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
    const body = await justTcgJson(
      `/cards?game=${encodeURIComponent(JUSTTCG_GAME)}&set=${encodeURIComponent(slug)}&include_price_history=false&limit=${limit}&offset=${offset}`
    );
    const page = justTcgRows(body);
    rows.push(...page);
    if (!justTcgHasMore(body) || page.length === 0 || page.length < limit) break;
    offset += limit;
  }
  return rows;
}

function setCodeForCard(card, setById) {
  return (setById.get(card.set_id)?.code ?? "").toUpperCase();
}

function buildJustTcgIndexes(dbCards, setById) {
  const bySetNumber = new Map();
  const byTcgProductId = new Map();
  for (const card of dbCards) {
    const code = setCodeForCard(card, setById);
    const number = nullIfNullStr(card.card_number);
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
  return { bySetNumber, byTcgProductId, setById };
}

function scoreJustTcgCandidate(card, jtCard, jtNumber, jtVariantKey) {
  const dbVariantKey = variantKey(card.variant_label);
  const dbNameVariantKey = variantKey(expectedVariantLabel(card.name));
  const exactBaseImage = Boolean(jtNumber && card.card_image_id === jtNumber);
  const cardImage = String(card.card_image_id ?? "");
  const looksLikeImageVariant = /(?:_p\d+|_r\d+|-alt|-manga|-parallel)/i.test(cardImage);
  const jtBase = nameWithoutTags(jtCard.name);
  const dbBase = nameWithoutTags(card.name_base ?? card.name);
  let score = 0;

  if (jtBase && dbBase && jtBase !== dbBase) score += 12;

  if (!jtVariantKey) {
    if (exactBaseImage && !dbVariantKey) score -= 40;
    if (dbVariantKey) score += 60;
    if (!exactBaseImage && looksLikeImageVariant) score += 30;
  } else {
    if (dbVariantKey && dbVariantKey === jtVariantKey) {
      score -= 40;
    } else if (!dbVariantKey && dbNameVariantKey === jtVariantKey && !exactBaseImage) {
      score -= 15;
    } else {
      score += 50;
    }
    if (exactBaseImage && !dbVariantKey) score += 80;
  }

  if (card.tcg_product_id && card.tcg_product_id === jtCard.id) score -= 100;
  if (card.tcg_product_id && card.tcg_product_id !== jtCard.id) score += 10;

  return score;
}

function findJustTcgMatch(jtCard, expectedCode, indexes) {
  const number = nullIfNullStr(jtCard.number);
  if (!number) return { card: null, matchType: "no_number" };

  const direct = jtCard.id
    ? (indexes.byTcgProductId.get(String(jtCard.id)) ?? []).filter(
        (card) => setCodeForCard(card, indexes.setById) === expectedCode && nullIfNullStr(card.card_number) === number
      )
    : [];
  if (direct.length === 1) return { card: direct[0], matchType: "tcg_product_id", score: -100 };

  const outsideDirect = jtCard.id ? indexes.byTcgProductId.get(String(jtCard.id)) ?? [] : [];
  if (outsideDirect.length > 0 && direct.length === 0) {
    return { card: null, matchType: "tcg_product_id_outside_expected_set", conflictCards: outsideDirect };
  }

  const candidates = indexes.bySetNumber.get(`${expectedCode}|${number}`) ?? [];
  if (candidates.length === 0) return { card: null, matchType: "no_existing_card" };

  const jtVariantKey = variantKey(expectedVariantLabel(jtCard.name));
  const scored = candidates
    .map((card) => ({ card, score: scoreJustTcgCandidate(card, jtCard, number, jtVariantKey) }))
    .sort((a, b) => a.score - b.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return { card: null, matchType: "no_existing_card" };
  if (second && second.score === best.score) {
    return { card: null, matchType: "ambiguous", candidates: scored.slice(0, 5) };
  }
  if (best.score >= 60) {
    return { card: null, matchType: "low_confidence", candidates: scored.slice(0, 5) };
  }

  return { card: best.card, matchType: "set_number_variant", score: best.score };
}

async function auditJustTcg(dbSets, dbCards, setById, setByCode) {
  if (!JUSTTCG_KEY) {
    return { status: "blocked", message: "JUSTTCG_API_KEY is not present in .env.local." };
  }

  const slugMap = parseSetSlugMap();
  const indexes = buildJustTcgIndexes(dbCards, setById);
  let rawSets;
  try {
    rawSets = justTcgRows(await justTcgJson(`/sets?game=${encodeURIComponent(JUSTTCG_GAME)}&limit=200`));
  } catch (error) {
    return {
      status: "blocked",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const unmappedSets = [];
  const perSet = [];
  const missingCards = [];
  const wrongSetCards = [];
  const rarityMismatches = [];
  const missingVariantLabels = [];
  const priceGaps = [];
  const skippedCards = [];
  const productIdConflicts = [];
  const ambiguousMatches = [];
  const lowConfidenceMatches = [];
  const duplicateMatches = [];
  const matchedRows = [];
  const fetchedSlugs = new Set();

  for (const jtSet of rawSets) {
    const slug = justTcgSetSlug(jtSet).find((candidate) => slugMap.has(candidate));
    const setCode = slug ? slugMap.get(slug) : null;
    if (!slug || !setCode) {
      unmappedSets.push({
        id: jtSet.id ?? "",
        name: jtSet.name ?? "",
        candidates: justTcgSetSlug(jtSet).join(", "),
      });
      continue;
    }
    if (fetchedSlugs.has(slug)) continue;
    fetchedSlugs.add(slug);

    let cards = [];
    let fetchError = null;
    try {
      cards = await fetchJustTcgCardsForSet(slug);
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
    }

    const dbSet = setByCode.get(setCode);
    const perSetRow = {
      slug,
      setCode,
      name: jtSet.name ?? "",
      sourceCards: cards.length,
      dbRowsInSet: dbSet ? dbCards.filter((card) => card.set_id === dbSet.id).length : 0,
      missing: 0,
      wrongSet: 0,
      rarityMismatch: 0,
      missingVariant: 0,
      priceGap: 0,
      skipped: 0,
      duplicate: 0,
      productIdConflict: 0,
      ambiguous: 0,
      lowConfidence: 0,
      fetchError,
    };
    perSet.push(perSetRow);

    for (const jtCard of cards) {
      const jtNumber = nullIfNullStr(jtCard.number);
      if (!allowsCardNumberInSet(setCode, jtNumber)) {
        perSetRow.skipped++;
        skippedCards.push({
          set: setCode,
          slug,
          id: jtCard.id,
          number: jtCard.number,
          name: jtCard.name,
          reason: jtNumber ? "prefix_mismatch" : "missing_number",
        });
        continue;
      }

      const match = findJustTcgMatch(jtCard, setCode, indexes);
      if (!match.card) {
        const row = {
          set: setCode,
          slug,
          id: jtCard.id,
          number: jtCard.number,
          name: jtCard.name,
          rarity: jtCard.rarity,
          derived: expectedRarity({ card_name: jtCard.name, rarity: jtCard.rarity }),
        };
        if (match.matchType === "tcg_product_id_outside_expected_set") {
          perSetRow.productIdConflict++;
          productIdConflicts.push({
            ...row,
            conflictCardImageIds: (match.conflictCards ?? []).map((card) => {
              const set = setById.get(card.set_id);
              return `${set?.code ?? ""}:${card.card_image_id}`;
            }),
          });
        } else if (match.matchType === "ambiguous") {
          perSetRow.ambiguous++;
          ambiguousMatches.push(row);
        } else if (match.matchType === "low_confidence") {
          perSetRow.lowConfidence++;
          lowConfidenceMatches.push(row);
        } else {
          perSetRow.missing++;
          missingCards.push(row);
        }
        continue;
      }

      matchedRows.push({ perSetRow, setCode, slug, jtCard, match });
    }
  }

  const groupedMatches = new Map();
  for (const row of matchedRows) {
    const bucket = groupedMatches.get(row.match.card.id) ?? [];
    bucket.push(row);
    groupedMatches.set(row.match.card.id, bucket);
  }

  for (const group of groupedMatches.values()) {
    const uniqueJtIds = new Set(group.map((row) => row.jtCard.id).filter(Boolean));
    if (uniqueJtIds.size > 1) {
      duplicateMatches.push(group);
      for (const row of group) row.perSetRow.duplicate++;
      continue;
    }

    const row = group[group.length - 1];
    const { perSetRow, setCode, jtCard, match } = row;
    const actualCode = setCodeForCard(match.card, setById);
    if (actualCode !== setCode) {
      perSetRow.wrongSet++;
      wrongSetCards.push({
        expectedSet: setCode,
        actualSet: actualCode,
        number: jtCard.number,
        name: jtCard.name,
        dbCardImageId: match.card.card_image_id,
        matchType: match.matchType,
      });
    }

    const derived = expectedRarity({ card_name: jtCard.name, rarity: jtCard.rarity });
    if (derived && match.card.rarity && rarityKey(derived) !== rarityKey(match.card.rarity)) {
      perSetRow.rarityMismatch++;
      rarityMismatches.push({
        set: setCode,
        number: jtCard.number,
        name: jtCard.name,
        dbCardImageId: match.card.card_image_id,
        sourceRarity: jtCard.rarity,
        derivedRarity: derived,
        dbRarity: match.card.rarity,
      });
    }

    const expectedVariant = expectedVariantLabel(jtCard.name);
    if (expectedVariant && !match.card.variant_label) {
      perSetRow.missingVariant++;
      missingVariantLabels.push({
        set: setCode,
        number: jtCard.number,
        name: jtCard.name,
        expectedVariant,
        dbCardImageId: match.card.card_image_id,
        dbRarity: match.card.rarity,
      });
    }

    const variant = bestJustTcgVariant(jtCard);
    const dbStats = priceStatsFor(match.card);
    const jtPrice = numeric(variant?.price);
    const dbPrice = dbStats?.tcg_market ?? null;
    if (jtPrice != null && jtPrice > 0 && (dbPrice == null || Math.abs(Number(dbPrice) - jtPrice) / jtPrice > 0.25)) {
      perSetRow.priceGap++;
      priceGaps.push({
        set: setCode,
        number: jtCard.number,
        name: jtCard.name,
        dbCardImageId: match.card.card_image_id,
        justTcgPrice: jtPrice,
        dbTcgMarket: dbPrice,
      });
    }
  }

  return {
    status: "ok",
    setsFetched: rawSets.length,
    mappedSlugs: fetchedSlugs.size,
    unmappedSets,
    cardsFetched: perSet.reduce((sum, row) => sum + row.sourceCards, 0),
    perSet,
    missingCards,
    wrongSetCards,
    rarityMismatches,
    missingVariantLabels,
    priceGaps,
    skippedCards,
    productIdConflicts,
    ambiguousMatches,
    lowConfidenceMatches,
    duplicateMatches,
  };
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
  if (!cardName) return "Other";
  const parens = cardName.match(/\(([^)]+)\)/g) ?? [];
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

function looksGarbledPromo(card) {
  if (!card.set_id || typeof card.set_id !== "string") return true;
  if (/\s/.test(card.set_id)) return true;
  return !/^[A-Z]+\d*$/.test(card.set_id);
}

function expectedRow(card) {
  const color = nullIfNullStr(card.card_color);
  const types = nullIfNullStr(card.sub_types);
  const override = bandaiBaseOverride(card);
  return {
    card_image_id: nullIfNullStr(card.card_image_id),
    card_number: nullIfNullStr(card.card_set_id),
    name: normText(card.card_name),
    raritySource: nullIfNullStr(card.rarity),
    rarityDerived: override?.rarity ?? expectedRarity(card),
    variantLabel: override ? override.variantLabel : expectedVariantLabel(card.card_name),
    card_type: nullIfNullStr(card.card_type),
    color,
    power: toInt(card.card_power),
    counter: toInt(card.counter_amount),
    life: toInt(card.life),
    cost: toInt(card.card_cost),
    attribute: nullIfNullStr(card.attribute),
    types,
    effect: normText(card.card_text),
    image_url: nullIfNullStr(card.card_image),
  };
}

function sourceClaimSignature(entry) {
  const expected = entry.expected;
  return JSON.stringify({
    set: entry.expectedSetCode,
    card_number: expected.card_number,
    name: expected.name,
    rarity: expected.rarityDerived,
    variant_label: expected.variantLabel,
    image_url: expected.image_url,
  });
}

function compareField(mismatches, label, dbValue, expectedValue, normalize = (v) => v) {
  const db = normalize(dbValue);
  const expected = normalize(expectedValue);
  if (expected === null || expected === undefined) return;
  if (db !== expected) {
    mismatches.push({ field: label, db, expected });
  }
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

function sample(items, count = 20) {
  return items.slice(0, count);
}

async function tryPromoSegmentProbe(gameId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${withGameFilter("cards?select=id,promo_segment&limit=1", gameId)}`, {
    headers: restHeaders(),
  });
  return res.ok ? null : await res.text();
}

async function main() {
  const started = new Date();
  const game = await loadGameScope({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, gameSlug: GAME_SLUG });
  console.log(`Loading Supabase sets/cards for game scope: ${game.slug}...`);
  const [dbSets, dbCards, promoSegmentError] = await Promise.all([
    sbFetchAll(withGameFilter("sets?select=id,slug,code,name,card_count,series,year", game.id)),
    sbFetchAll(withGameFilter("cards?select=id,card_image_id,card_number,name,name_base,variant_label,set_id,rarity,card_type,color,power,counter,life,cost,attribute,types,effect,trigger,image_url,image_url_small,tcg_product_id,price_stats(tcg_market,market_avg,updated_at)", game.id)),
    tryPromoSegmentProbe(game.id),
  ]);

  const setById = new Map(dbSets.map((set) => [set.id, set]));
  const cardsBySetId = new Map();
  for (const card of dbCards) {
    cardsBySetId.set(card.set_id, (cardsBySetId.get(card.set_id) ?? 0) + 1);
  }

  const setBucketsByCode = new Map();
  for (const set of dbSets) {
    if (!set.code) continue;
    const code = String(set.code).toUpperCase();
    const bucket = setBucketsByCode.get(code) ?? [];
    bucket.push(set);
    setBucketsByCode.set(code, bucket);
  }
  const duplicateSetCodes = Array.from(setBucketsByCode.entries()).filter(([, sets]) => sets.length > 1);
  const setByCode = new Map();
  for (const [code, sets] of setBucketsByCode.entries()) {
    setByCode.set(
      code,
      sets.slice().sort((a, b) => (cardsBySetId.get(b.id) ?? 0) - (cardsBySetId.get(a.id) ?? 0))[0]
    );
  }
  const dbByImageId = new Map();
  for (const card of dbCards) {
    if (card.card_image_id) dbByImageId.set(card.card_image_id, card);
  }

  console.log("Fetching optcgapi set/deck/promo indexes...");
  const [optSets, optDecks, promos] = await Promise.all([
    optJson("/allSets/"),
    optJson("/allDecks/"),
    optJson("/allPromos/"),
  ]);

  console.log(JUSTTCG_KEY ? "Fetching JustTCG set/card data..." : "Skipping JustTCG: JUSTTCG_API_KEY is not set.");
  const justTcgAudit = await auditJustTcg(dbSets, dbCards, setById, setByCode);

  const sources = [];
  for (const set of optSets) {
    const endpointCode = endpointCodeFromSet(set);
    sources.push({
      kind: "set",
      apiId: set.set_id,
      endpoint: `/sets/${set.set_id}/`,
      endpointCode,
      name: set.set_name,
    });
  }
  for (const deck of optDecks) {
    const endpointCode = endpointCodeFromSet(deck);
    sources.push({
      kind: "deck",
      apiId: deck.structure_deck_id,
      endpoint: `/decks/${deck.structure_deck_id}/`,
      endpointCode,
      name: deck.structure_deck_name,
    });
  }
  sources.push({
    kind: "promo",
    apiId: "P",
    endpoint: "/allPromos/",
    endpointCode: "P",
    name: "One Piece Promotion Cards",
    preloadedCards: promos,
  });

  console.log(`Fetching ${sources.length} optcgapi card collections...`);
  const perSet = [];
  const missingSetRows = [];
  const missingCards = [];
  const wrongSetCards = [];
  const fieldMismatchRows = [];
  const derivedRarityRows = [];
  const missingVariantLabels = [];
  const duplicateOptcgClaims = [];
  const promoFallbackCoveredRows = [];
  const conflictingSourceImageIds = new Set();
  const sourceEntries = [];
  const sourceKeys = new Set();
  const sourceImageIds = new Set();

  for (const source of sources) {
    let cards = source.preloadedCards ?? [];
    if (!source.preloadedCards) {
      try {
        cards = await optJson(source.endpoint);
      } catch (error) {
        perSet.push({
          source,
          fetched: 0,
          dbSetExists: Boolean(setByCode.get(source.endpointCode)),
          dbRowsInSet: 0,
          missing: 0,
          wrongSet: 0,
          mismatched: 0,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    } else if (source.kind === "promo") {
      cards = cards.filter((card) => !looksGarbledPromo(card));
    }

    const dbSet = source.kind === "promo" ? setByCode.get("P") : setByCode.get(source.endpointCode);
    if (!dbSet) missingSetRows.push(source);

    const dbRowsInSet = dbSet ? dbCards.filter((card) => card.set_id === dbSet.id).length : 0;
    const perSetRow = {
      source,
      fetched: cards.length,
      dbSetExists: Boolean(dbSet),
      dbRowsInSet,
      missing: 0,
      wrongSet: 0,
      mismatched: 0,
      sourceConflicts: 0,
      promoFallbackCovered: 0,
      error: null,
    };
    perSet.push(perSetRow);

    for (const rawCard of cards) {
      const expected = expectedRow(rawCard);
      const sourceImageId =
        expected.card_image_id ??
        (source.kind === "promo" ? promoSyntheticId(rawCard) : null);
      const sourceKey = sourceImageId ?? `${source.kind}:${source.endpointCode}:${expected.card_number}:${normText(rawCard.card_name)}`;
      sourceKeys.add(sourceKey);
      if (sourceImageId) sourceImageIds.add(sourceImageId);

      const exactDb = sourceImageId ? dbByImageId.get(sourceImageId) : null;
      const fallbackDb =
        source.kind === "promo" && expected.card_number ? dbByImageId.get(expected.card_number) : null;
      const promoFallbackCovered =
        source.kind === "promo" &&
        Boolean(sourceImageId) &&
        Boolean(expected.card_number) &&
        sourceImageId !== expected.card_number &&
        !exactDb &&
        Boolean(fallbackDb);
      const expectedSetCode =
        source.kind === "promo"
          ? prefixFromCardNumber(expected.card_number) ?? "P"
          : source.endpointCode;

      sourceEntries.push({
        source,
        perSetRow,
        rawCard,
        expected,
        sourceImageId,
        sourceKey,
        expectedSetCode,
        promoFallbackCovered,
        fallbackDb,
      });
    }
  }

  const claimsByImageId = new Map();
  for (const entry of sourceEntries) {
    if (!entry.sourceImageId) continue;
    const bucket = claimsByImageId.get(entry.sourceImageId) ?? [];
    bucket.push(entry);
    claimsByImageId.set(entry.sourceImageId, bucket);
  }

  for (const [sourceImageId, entries] of claimsByImageId.entries()) {
    const signatures = new Map();
    for (const entry of entries) {
      const signature = sourceClaimSignature(entry);
      const bucket = signatures.get(signature) ?? [];
      bucket.push(entry);
      signatures.set(signature, bucket);
    }
    if (signatures.size <= 1) continue;
    conflictingSourceImageIds.add(sourceImageId);
    duplicateOptcgClaims.push({
      card_image_id: sourceImageId,
      claims: Array.from(signatures.values()).map((bucket) => bucket[0]),
      occurrences: entries.length,
    });
    for (const entry of entries) {
      entry.perSetRow.sourceConflicts++;
    }
  }

  for (const entry of sourceEntries) {
    const { source, perSetRow, expected, sourceImageId, expectedSetCode } = entry;
    if (sourceImageId && conflictingSourceImageIds.has(sourceImageId)) continue;
    if (entry.promoFallbackCovered) {
      perSetRow.promoFallbackCovered++;
      const fallbackSet = setById.get(entry.fallbackDb.set_id);
      promoFallbackCoveredRows.push({
        expectedSet: expectedSetCode,
        fallbackSet: fallbackSet?.code ?? null,
        sourceImageId,
        fallbackCardImageId: entry.fallbackDb.card_image_id,
        card_number: expected.card_number,
        name: expected.name,
      });
      continue;
    }

    const db =
      source.kind === "promo"
        ? dbByImageId.get(sourceImageId) ?? dbByImageId.get(expected.card_number)
        : dbByImageId.get(sourceImageId);

    if (!db) {
      perSetRow.missing++;
      missingCards.push({
        set: source.endpointCode,
        kind: source.kind,
        card_image_id: sourceImageId,
        card_number: expected.card_number,
        name: expected.name,
        rarity: expected.raritySource,
        derived: expected.rarityDerived,
      });
      continue;
    }

    const actualSet = setById.get(db.set_id);
    const actualSetCode = actualSet?.code ? String(actualSet.code).toUpperCase() : null;
    if (expectedSetCode && actualSetCode !== expectedSetCode) {
      perSetRow.wrongSet++;
      wrongSetCards.push({
        expectedSet: expectedSetCode,
        actualSet: actualSetCode,
        card_image_id: sourceImageId,
        card_number: expected.card_number,
        name: expected.name,
      });
    }

    const mismatches = [];
    compareField(mismatches, "card_number", db.card_number, expected.card_number, normText);
    compareField(mismatches, "name", db.name, expected.name, normText);
    compareField(mismatches, "rarity_derived", db.rarity, expected.rarityDerived, normText);
    compareField(mismatches, "card_type", db.card_type, expected.card_type, normText);
    compareField(mismatches, "color", arrayText(db.color), expected.color, normText);
    compareField(mismatches, "power", db.power, expected.power);
    compareField(mismatches, "counter", db.counter, expected.counter);
    compareField(mismatches, "life", db.life, expected.life);
    compareField(mismatches, "cost", db.cost, expected.cost);
    compareField(mismatches, "attribute", db.attribute, expected.attribute, normText);
    compareField(mismatches, "types", arrayText(db.types), expected.types, normText);
    compareField(mismatches, "effect", db.effect, expected.effect, normText);
    compareField(mismatches, "image_url", db.image_url, expected.image_url, normText);

    if (mismatches.length > 0) {
      perSetRow.mismatched++;
      fieldMismatchRows.push({
        set: expectedSetCode,
        card_image_id: sourceImageId,
        card_number: expected.card_number,
        name: expected.name,
        mismatches,
      });
    }

    if (expected.rarityDerived && expected.raritySource && expected.rarityDerived !== expected.raritySource) {
      derivedRarityRows.push({
        set: expectedSetCode,
        card_image_id: sourceImageId,
        card_number: expected.card_number,
        name: expected.name,
        sourceRarity: expected.raritySource,
        derivedRarity: expected.rarityDerived,
        dbRarity: db.rarity,
      });
    }

    if (expected.variantLabel && !db.variant_label) {
      missingVariantLabels.push({
        set: expectedSetCode,
        card_image_id: sourceImageId,
        card_number: expected.card_number,
        name: expected.name,
        expectedVariant: expected.variantLabel,
        dbRarity: db.rarity,
      });
    }
  }

  const duplicateNumberBuckets = new Map();
  for (const card of dbCards) {
    const set = setById.get(card.set_id);
    const key = `${set?.code ?? "NO_SET"}|${card.card_number ?? "NO_NUM"}|${card.variant_label ?? ""}`;
    const bucket = duplicateNumberBuckets.get(key) ?? [];
    bucket.push(card);
    duplicateNumberBuckets.set(key, bucket);
  }
  const duplicateRows = Array.from(duplicateNumberBuckets.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, rows }));

  const nullCritical = dbCards.filter(
    (card) => !card.card_image_id || !card.card_number || !card.name || !card.rarity || !card.set_id
  );

  const staleDbRows = dbCards.filter((card) => card.card_image_id && !sourceImageIds.has(card.card_image_id));

  const rarityCounts = {};
  const setCounts = {};
  for (const card of dbCards) {
    const rarity = card.rarity ?? "NULL";
    rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;
    const set = setById.get(card.set_id);
    const code = set?.code ?? "NO_SET";
    setCounts[code] = (setCounts[code] ?? 0) + 1;
  }

  const report = [];
  report.push(`# One Piece Catalog Audit`);
  report.push("");
  report.push(`Generated: ${started.toISOString()}`);
  report.push(`Game: ${game.name ?? game.slug} (${game.slug})`);
  report.push("");
  report.push(`## Scope`);
  report.push("");
  report.push(`- DB tables checked: sets (${dbSets.length}), cards (${dbCards.length}).`);
  report.push(`- External source checked: optcgapi allSets (${optSets.length}), allDecks (${optDecks.length}), allPromos (${promos.length}).`);
  if (justTcgAudit.status === "ok") {
    report.push(`- JustTCG checked: sets (${justTcgAudit.setsFetched}), mapped set slugs (${justTcgAudit.mappedSlugs}), card records (${justTcgAudit.cardsFetched}).`);
  } else {
    report.push(`- JustTCG checked: blocked, because ${justTcgAudit.message}`);
  }
  report.push("");
  report.push(`## Summary`);
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["DB sets", dbSets.length],
      ["DB cards", dbCards.length],
      ["optcgapi source collections", sources.length],
      ["optcgapi source card records", perSet.reduce((sum, row) => sum + row.fetched, 0)],
      ["Missing DB set rows", missingSetRows.length],
      ["Missing DB cards by card_image_id", missingCards.length],
      ["Cards in wrong DB set by source collection", wrongSetCards.length],
      ["Cards with field mismatches", fieldMismatchRows.length],
      ["Duplicate optcgapi card_image_id claims", duplicateOptcgClaims.length],
      ["Promo source rows covered by base card fallback", promoFallbackCoveredRows.length],
      ["Cards whose derived variant rarity differs from source rarity", derivedRarityRows.length],
      ["Variant-tagged source cards with empty DB variant_label", missingVariantLabels.length],
      ["DB cards with missing critical fields", nullCritical.length],
      ["Duplicate set/card_number/variant buckets", duplicateRows.length],
      ["DB card_image_ids not seen in optcgapi snapshot", staleDbRows.length],
      ["Duplicate set code buckets", duplicateSetCodes.length],
      ["JustTCG missing DB card matches", justTcgAudit.status === "ok" ? justTcgAudit.missingCards.length : "blocked"],
      ["JustTCG wrong-set matches", justTcgAudit.status === "ok" ? justTcgAudit.wrongSetCards.length : "blocked"],
      ["JustTCG rarity mismatches", justTcgAudit.status === "ok" ? justTcgAudit.rarityMismatches.length : "blocked"],
      ["JustTCG missing variant labels", justTcgAudit.status === "ok" ? justTcgAudit.missingVariantLabels.length : "blocked"],
      ["JustTCG price gaps >25%", justTcgAudit.status === "ok" ? justTcgAudit.priceGaps.length : "blocked"],
      ["JustTCG rows skipped by existing-only guard", justTcgAudit.status === "ok" ? justTcgAudit.skippedCards.length : "blocked"],
      ["JustTCG duplicate matches skipped", justTcgAudit.status === "ok" ? justTcgAudit.duplicateMatches.length : "blocked"],
      ["JustTCG product IDs linked outside mapped set", justTcgAudit.status === "ok" ? justTcgAudit.productIdConflicts.length : "blocked"],
      ["JustTCG ambiguous matches skipped", justTcgAudit.status === "ok" ? justTcgAudit.ambiguousMatches.length : "blocked"],
      ["JustTCG low-confidence matches skipped", justTcgAudit.status === "ok" ? justTcgAudit.lowConfidenceMatches.length : "blocked"],
    ]
  ));
  report.push("");

  report.push(`## JustTCG Coverage`);
  report.push("");
  if (justTcgAudit.status !== "ok") {
    report.push(justTcgAudit.message);
  } else {
    report.push(mdTable(
      ["Slug", "DB Set", "Name", "JustTCG Cards", "DB Rows In Set", "Missing", "Wrong Set", "Rarity Mismatch", "Missing Variant", "Price Gap", "Skipped", "Duplicate", "Product ID Conflict", "Ambiguous", "Low Confidence", "Fetch Error"],
      justTcgAudit.perSet.map((row) => [
        row.slug,
        row.setCode,
        row.name,
        row.sourceCards,
        row.dbRowsInSet,
        row.missing,
        row.wrongSet,
        row.rarityMismatch,
        row.missingVariant,
        row.priceGap,
        row.skipped,
        row.duplicate,
        row.productIdConflict,
        row.ambiguous,
        row.lowConfidence,
        row.fetchError ?? "",
      ])
    ));
  }
  report.push("");

  if (justTcgAudit.status === "ok" && justTcgAudit.unmappedSets.length > 0) {
    report.push(`## JustTCG Unmapped Sets`);
    report.push("");
    report.push(mdTable(
      ["ID", "Name", "Candidate Slugs"],
      sample(justTcgAudit.unmappedSets, 100).map((row) => [row.id, row.name, row.candidates])
    ));
    report.push("");
  }

  if (promoSegmentError) {
    report.push(`## Schema Warning`);
    report.push("");
    report.push("The promo import script references `cards.promo_segment`, but the live REST schema probe failed:");
    report.push("");
    report.push("```text");
    report.push(promoSegmentError.slice(0, 1000));
    report.push("```");
    report.push("");
  }

  report.push(`## Per-Collection Coverage`);
  report.push("");

  report.push(`## Duplicate Set Codes`);
  report.push("");
  if (duplicateSetCodes.length === 0) {
    report.push("No duplicate set codes found.");
  } else {
    report.push(mdTable(
      ["Code", "Rows", "Set UUIDs / Names / Card Rows"],
      duplicateSetCodes.map(([code, sets]) => [
        code,
        sets.length,
        sets.map((set) => `${set.id} ${set.name} (${cardsBySetId.get(set.id) ?? 0})`).join("; "),
      ])
    ));
  }
  report.push("");
  report.push(mdTable(
    ["Kind", "API ID", "Expected DB Set", "Name", "Source Cards", "DB Rows In Set", "Missing", "Wrong Set", "Field Mismatch", "Source Conflicts", "Promo Fallback", "Fetch Error"],
    perSet.map((row) => [
      row.source.kind,
      row.source.apiId,
      row.source.kind === "promo" ? "P / card prefix" : row.source.endpointCode,
      row.source.name,
      row.fetched,
      row.dbRowsInSet,
      row.missing,
      row.wrongSet,
      row.mismatched,
      row.sourceConflicts ?? 0,
      row.promoFallbackCovered ?? 0,
      row.error ?? "",
    ])
  ));
  report.push("");

  report.push(`## DB Cards By Set`);
  report.push("");
  report.push(mdTable(
    ["Set", "DB Cards"],
    Object.entries(setCounts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => [code, count])
  ));
  report.push("");

  report.push(`## DB Cards By Rarity`);
  report.push("");
  report.push(mdTable(
    ["Rarity", "DB Cards"],
    Object.entries(rarityCounts).sort(([a], [b]) => a.localeCompare(b)).map(([rarity, count]) => [rarity, count])
  ));
  report.push("");

  const sections = [
    {
      title: "Missing DB Set Rows",
      rows: missingSetRows.map((row) => [row.kind, row.apiId, row.endpointCode, row.name]),
      headers: ["Kind", "API ID", "Expected Code", "Name"],
    },
    {
      title: "Missing DB Cards By card_image_id",
      rows: sample(missingCards, 100).map((row) => [row.kind, row.set, row.card_image_id, row.card_number, row.name, row.rarity, row.derived]),
      headers: ["Kind", "Set", "card_image_id", "Card #", "Name", "Source Rarity", "Derived Rarity"],
    },
    {
      title: "Wrong DB Set Assignments",
      rows: sample(wrongSetCards, 100).map((row) => [row.expectedSet, row.actualSet, row.card_image_id, row.card_number, row.name]),
      headers: ["Expected Set", "Actual Set", "card_image_id", "Card #", "Name"],
    },
    {
      title: "Duplicate optcgapi card_image_id Claims",
      rows: sample(duplicateOptcgClaims, 100).map((row) => [
        row.card_image_id,
        row.occurrences,
        row.claims
          .map((claim) => `${claim.source.kind}:${claim.source.apiId} -> ${claim.expectedSetCode} ${claim.expected.name}`)
          .join("; "),
      ]),
      headers: ["card_image_id", "Occurrences", "Claims"],
    },
    {
      title: "Promo Source Rows Covered By Base Card Fallback",
      rows: sample(promoFallbackCoveredRows, 100).map((row) => [
        row.expectedSet,
        row.fallbackSet,
        row.sourceImageId,
        row.fallbackCardImageId,
        row.card_number,
        row.name,
      ]),
      headers: ["Expected Set", "Fallback Set", "Source card_image_id", "Fallback card_image_id", "Card #", "Name"],
    },
    {
      title: "Derived Rarity Differences",
      rows: sample(derivedRarityRows, 100).map((row) => [row.set, row.card_image_id, row.card_number, row.name, row.sourceRarity, row.derivedRarity, row.dbRarity]),
      headers: ["Set", "card_image_id", "Card #", "Name", "Source Rarity", "Derived Rarity", "DB Rarity"],
    },
    {
      title: "Missing Variant Labels",
      rows: sample(missingVariantLabels, 100).map((row) => [row.set, row.card_image_id, row.card_number, row.name, row.expectedVariant, row.dbRarity]),
      headers: ["Set", "card_image_id", "Card #", "Name", "Expected Variant", "DB Rarity"],
    },
    {
      title: "DB Cards With Missing Critical Fields",
      rows: sample(nullCritical, 100).map((card) => {
        const set = setById.get(card.set_id);
        return [set?.code ?? "", card.card_image_id, card.card_number, card.name, card.rarity];
      }),
      headers: ["Set", "card_image_id", "Card #", "Name", "Rarity"],
    },
    {
      title: "Duplicate set/card_number/variant Buckets",
      rows: sample(duplicateRows, 100).map((row) => [row.key, row.count, row.rows.map((card) => card.card_image_id).join(", ")]),
      headers: ["Bucket", "Count", "card_image_ids"],
    },
    {
      title: "DB card_image_ids Not Seen In optcgapi Snapshot",
      rows: sample(staleDbRows, 100).map((card) => {
        const set = setById.get(card.set_id);
        return [set?.code ?? "", card.card_image_id, card.card_number, card.name, card.rarity, card.variant_label ?? ""];
      }),
      headers: ["Set", "card_image_id", "Card #", "Name", "Rarity", "Variant"],
    },
  ];

  for (const section of sections) {
    report.push(`## ${section.title}`);
    report.push("");
    if (section.rows.length === 0) {
      report.push("No issues found.");
    } else {
      report.push(mdTable(section.headers, section.rows));
      if (section.title !== "Missing DB Set Rows" && section.rows.length === 100) {
        report.push("");
        report.push("_Showing first 100 rows._");
      }
    }
    report.push("");
  }

  if (justTcgAudit.status === "ok") {
    const justTcgSections = [
      {
        title: "JustTCG Missing DB Card Matches",
        rows: sample(justTcgAudit.missingCards, 100).map((row) => [row.set, row.slug, row.id, row.number, row.name, row.rarity, row.derived]),
        headers: ["Set", "Slug", "JustTCG ID", "Card #", "Name", "Source Rarity", "Derived Rarity"],
      },
      {
        title: "JustTCG Wrong-Set Matches",
        rows: sample(justTcgAudit.wrongSetCards, 100).map((row) => [row.expectedSet, row.actualSet, row.number, row.name, row.dbCardImageId, row.matchType]),
        headers: ["Expected Set", "Actual Set", "Card #", "Name", "DB card_image_id", "Match Type"],
      },
      {
        title: "JustTCG Rarity Mismatches",
        rows: sample(justTcgAudit.rarityMismatches, 100).map((row) => [row.set, row.number, row.name, row.dbCardImageId, row.sourceRarity, row.derivedRarity, row.dbRarity]),
        headers: ["Set", "Card #", "Name", "DB card_image_id", "Source Rarity", "Derived Rarity", "DB Rarity"],
      },
      {
        title: "JustTCG Missing Variant Labels",
        rows: sample(justTcgAudit.missingVariantLabels, 100).map((row) => [row.set, row.number, row.name, row.dbCardImageId, row.expectedVariant, row.dbRarity]),
        headers: ["Set", "Card #", "Name", "DB card_image_id", "Expected Variant", "DB Rarity"],
      },
      {
        title: "JustTCG Price Gaps Greater Than 25%",
        rows: sample(justTcgAudit.priceGaps, 100).map((row) => [row.set, row.number, row.name, row.dbCardImageId, row.justTcgPrice, row.dbTcgMarket]),
        headers: ["Set", "Card #", "Name", "DB card_image_id", "JustTCG Price", "DB tcg_market"],
      },
      {
        title: "JustTCG Rows Skipped By Existing-Only Guard",
        rows: sample(justTcgAudit.skippedCards, 100).map((row) => [row.set, row.slug, row.id, row.number, row.name, row.reason]),
        headers: ["Set", "Slug", "JustTCG ID", "Card #", "Name", "Reason"],
      },
      {
        title: "JustTCG Duplicate Matches Skipped",
        rows: sample(justTcgAudit.duplicateMatches, 100).map((group) => [
          group[0]?.match.card.card_image_id ?? "",
          group[0]?.match.card.card_number ?? "",
          group.map((row) => `${row.setCode} ${row.jtCard.id} ${row.jtCard.name}`).join("; "),
        ]),
        headers: ["DB card_image_id", "DB Card #", "JustTCG Claims"],
      },
      {
        title: "JustTCG Product IDs Linked Outside Mapped Set",
        rows: sample(justTcgAudit.productIdConflicts, 100).map((row) => [
          row.set,
          row.slug,
          row.id,
          row.number,
          row.name,
          row.conflictCardImageIds.join("; "),
        ]),
        headers: ["Set", "Slug", "JustTCG ID", "Card #", "Name", "Linked DB Rows"],
      },
      {
        title: "JustTCG Ambiguous Matches Skipped",
        rows: sample(justTcgAudit.ambiguousMatches, 100).map((row) => [row.set, row.slug, row.id, row.number, row.name]),
        headers: ["Set", "Slug", "JustTCG ID", "Card #", "Name"],
      },
      {
        title: "JustTCG Low-Confidence Matches Skipped",
        rows: sample(justTcgAudit.lowConfidenceMatches, 100).map((row) => [row.set, row.slug, row.id, row.number, row.name]),
        headers: ["Set", "Slug", "JustTCG ID", "Card #", "Name"],
      },
    ];

    for (const section of justTcgSections) {
      report.push(`## ${section.title}`);
      report.push("");
      if (section.rows.length === 0) {
        report.push("No issues found.");
      } else {
        report.push(mdTable(section.headers, section.rows));
        if (section.rows.length === 100) {
          report.push("");
          report.push("_Showing first 100 rows._");
        }
      }
      report.push("");
    }
  }

  report.push(`## Field Mismatch Samples`);
  report.push("");
  if (fieldMismatchRows.length === 0) {
    report.push("No field mismatches found.");
  } else {
    for (const row of sample(fieldMismatchRows, 50)) {
      report.push(`- ${row.set} ${row.card_image_id} ${row.name}`);
      for (const mismatch of row.mismatches.slice(0, 8)) {
        report.push(`  - ${mismatch.field}: DB=${JSON.stringify(mismatch.db)} SOURCE=${JSON.stringify(mismatch.expected)}`);
      }
    }
  }
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Missing cards: ${missingCards.length}`);
  console.log(`Wrong-set cards: ${wrongSetCards.length}`);
  console.log(`Field mismatches: ${fieldMismatchRows.length}`);
  console.log(`Missing variant labels: ${missingVariantLabels.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
