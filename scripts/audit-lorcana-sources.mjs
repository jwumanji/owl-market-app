// Read-only LorcanaJSON <-> JustTCG reconciliation.
//
// This script never writes to Supabase and never downloads card images. It
// validates source shapes, exact TCGplayer product-ID coverage, set-name
// agreement, and the commercial finish dimensions that must remain separate.

import fs from "node:fs";

import {
  LORCANAJSON_ALL_CARDS_URL,
  LORCANA_JUSTTCG_GAME_SLUG,
  eligibleLorcanaMarketVariants,
  matchLorcanaJustTcgCards,
  matchLorcanaJustTcgSet,
  normalizeLorcanaJsonCard,
} from "../src/lib/games/lorcana.ts";

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const MAX_RATE_LIMIT_RETRIES = 6;
let rateLimitRetries = 0;

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
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

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    const key = value || "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function responseJson(url, init = {}, attempt = 0) {
  const response = await fetch(url, init);
  if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    const retryAfterSeconds = Number.parseFloat(response.headers.get("retry-after") ?? "");
    const retryDelay = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : Math.min(30_000, 1000 * 2 ** attempt);
    rateLimitRetries += 1;
    await wait(Math.max(1000, retryDelay));
    return responseJson(url, init, attempt + 1);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${new URL(url).hostname} ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function justTcgAll(path, apiKey) {
  const rows = [];
  let offset = 0;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await responseJson(
      `${JUSTTCG_BASE}${path}${separator}limit=100&offset=${offset}`,
      { headers: { "x-api-key": apiKey } }
    );
    rows.push(...(body.data ?? []));
    if (!(body.meta?.hasMore ?? body.pagination?.hasMore)) break;
    offset += 100;
  }
  return rows;
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

if (process.argv.includes("--help")) {
  console.log(`Usage: npm run audit:lorcana-sources -- [options]

Options:
  --max-sets=N       Audit only the first N JustTCG sets (default: all)
  --sets=SLUGS       Comma-separated JustTCG set IDs to audit
  --concurrency=N    Concurrent JustTCG set fetches (default: 1, max: 6)

Required:
  JUSTTCG_API_KEY in the environment or .env.local

The command is read-only. It prints JSON and does not fetch card images.`);
  process.exit(0);
}

loadEnvFile();

const justTcgKey = process.env.JUSTTCG_API_KEY;
if (!justTcgKey) {
  throw new Error("JUSTTCG_API_KEY is required in the environment or .env.local");
}

const parsedMaxSets = Number.parseInt(argumentValue("max-sets") ?? "", 10);
const maxSets = Number.isFinite(parsedMaxSets) && parsedMaxSets > 0 ? parsedMaxSets : null;
const parsedConcurrency = Number.parseInt(argumentValue("concurrency") ?? "1", 10);
const concurrency = Math.min(6, Math.max(1, parsedConcurrency || 1));
const requestedSetIds = new Set(
  (argumentValue("sets") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const [lorcanaDocument, allJustTcgSets] = await Promise.all([
  responseJson(LORCANAJSON_ALL_CARDS_URL),
  justTcgAll(`/sets?game=${encodeURIComponent(LORCANA_JUSTTCG_GAME_SLUG)}`, justTcgKey),
]);

if (
  !lorcanaDocument?.metadata ||
  !lorcanaDocument?.sets ||
  !Array.isArray(lorcanaDocument?.cards)
) {
  throw new Error("LorcanaJSON allCards.json does not match the expected document shape");
}

const canonicalCards = lorcanaDocument.cards.map((card) =>
  normalizeLorcanaJsonCard(card, lorcanaDocument.metadata.language)
);
const canonicalSets = Object.entries(lorcanaDocument.sets).map(([code, set]) => ({
  code,
  name: set.name,
}));

let selectedSets =
  requestedSetIds.size > 0
    ? allJustTcgSets.filter((set) => requestedSetIds.has(set.id))
    : allJustTcgSets;
if (maxSets != null) selectedSets = selectedSets.slice(0, maxSets);

const perSetCards = await mapWithConcurrency(selectedSets, concurrency, async (set) => {
  const cards = await justTcgAll(
    `/cards?game=${encodeURIComponent(LORCANA_JUSTTCG_GAME_SLUG)}&set=${encodeURIComponent(
      set.id
    )}&include_price_history=false`,
    justTcgKey
  );
  return { set, cards };
});

const justTcgCards = perSetCards.flatMap((entry) => entry.cards);
const joins = matchLorcanaJustTcgCards(justTcgCards, canonicalCards);
const canonicalTcgplayerIds = canonicalCards.filter(
  (card) => card.externalIds.tcgplayer
).length;
const canonicalProductIds = new Set(
  canonicalCards
    .map((card) => card.externalIds.tcgplayer)
    .filter(Boolean)
);
const conflictingProductIds = new Set(joins.conflictingProductIds);
const unmatchedReasons = countBy(
  joins.unmatched.map((card) => {
    const productId = card.tcgplayerId?.trim();
    if (!productId) return "missing_justtcg_tcgplayer_product_id";
    if (conflictingProductIds.has(productId)) return "non_unique_tcgplayer_product_id";
    if (!canonicalProductIds.has(productId)) return "product_id_absent_from_lorcanajson";
    return "unclassified";
  })
);
const eligibleVariants = justTcgCards.flatMap(eligibleLorcanaMarketVariants);
const exactMatchKeys = new Set(
  joins.matches.map((match) => match.justTcgCard.uuid ?? match.justTcgCard.id)
);

const perSet = perSetCards.map(({ set, cards }) => {
  const variants = cards.flatMap(eligibleLorcanaMarketVariants);
  return {
    id: set.id,
    name: set.name,
    releaseDate: set.release_date ?? null,
    cards: cards.length,
    eligibleNearMintEnglishVariants: variants.length,
    exactProductIdMatches: cards.filter((card) =>
      exactMatchKeys.has(card.uuid ?? card.id)
    ).length,
    canonicalSetCode: matchLorcanaJustTcgSet(set, canonicalSets)?.code ?? null,
  };
});

const exactMatchPercent =
  justTcgCards.length > 0
    ? Number(((joins.matches.length / justTcgCards.length) * 100).toFixed(2))
    : 0;

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      mode: "read_only",
      sources: {
        lorcanajson: {
          url: LORCANAJSON_ALL_CARDS_URL,
          formatVersion: lorcanaDocument.metadata.formatVersion,
          generatedOn: lorcanaDocument.metadata.generatedOn,
          language: lorcanaDocument.metadata.language,
          sets: canonicalSets.length,
          cards: canonicalCards.length,
          cardsWithTcgplayerProductId: canonicalTcgplayerIds,
          cardsWithImageUrl: canonicalCards.filter((card) => card.imageUrls.full).length,
          imageWritesEnabled: false,
        },
        justtcg: {
          apiVersion: "v1",
          gameSlug: LORCANA_JUSTTCG_GAME_SLUG,
          totalSetsAvailable: allJustTcgSets.length,
          setsAudited: selectedSets.length,
          cardsAudited: justTcgCards.length,
          rateLimitRetries,
          eligibleNearMintEnglishVariants: eligibleVariants.length,
          printings: countBy(eligibleVariants.map((variant) => variant.printing)),
        },
      },
      reconciliation: {
        joinPolicy: "unique_exact_tcgplayer_product_id",
        exactMatches: joins.matches.length,
        exactMatchPercent,
        unmatchedJustTcgCards: joins.unmatched.length,
        unmatchedReasons,
        conflictingTcgplayerProductIds: joins.conflictingProductIds,
        exactSetNameMatches: perSet.filter((set) => set.canonicalSetCode).length,
      },
      gates: {
        publicCatalogEnabled: false,
        pricePublicationEnabled: false,
        imageWritesEnabled: false,
        next:
          "Review unmatched/conflicting rows and obtain commercial-use clearance before enabling assets or publication.",
      },
      perSet,
    },
    null,
    2
  )
);
