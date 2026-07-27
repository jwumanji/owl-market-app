import fs from "node:fs";
import path from "node:path";
import {
  loadEnvFile,
  mdTable,
  readArg,
  writeReport,
} from "./lib/multitcg-audit-utils.mjs";
import {
  classifyExpectedDifferences,
  stableValue,
  summarizeCardDifference,
} from "./lib/card-api-golden-utils.mjs";

loadEnvFile();

const MODE = readArg("--mode", "compare");
const BASE_URL = readArg("--base-url", process.env.GOLDEN_API_BASE_URL)?.replace(/\/$/, "");
const FIXTURE_PATH = readArg(
  "--fixture",
  "tests/fixtures/golden/card-api-one-piece.json"
);
const REPORT_PATH = readArg("--report", "card-api-golden-report.md");
const PROFILE = readArg("--profile", "exact");
const GAME_SLUG = readArg("--game", "one_piece");
const LIMIT = Math.max(1, Math.min(500, Number(readArg("--limit", "200")) || 200));
const IDS_FILE = readArg("--ids-file");
const EXPECTED_DIFFS_FILE = readArg("--expected-diffs");
const CONCURRENCY = Math.max(1, Math.min(20, Number(readArg("--concurrency", "5")) || 5));

function apiHeaders() {
  const token = process.env.GOLDEN_API_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: apiHeaders() });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return stableValue(body);
}

async function fetchCard(cardId) {
  const game = encodeURIComponent(GAME_SLUG);
  const id = encodeURIComponent(cardId);
  const [extras, history] = await Promise.all([
    fetchJson(`${BASE_URL}/api/card/${id}/extras?game=${game}`),
    fetchJson(`${BASE_URL}/api/card/${id}/history?game=${game}`),
  ]);
  return { id: cardId, extras, history };
}

async function mapConcurrent(values, worker) {
  const results = new Array(values.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, run));
  return results;
}

function idsFromFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const values = Array.isArray(parsed) ? parsed : parsed.cardIds ?? parsed.routeIds;
  if (!Array.isArray(values)) {
    throw new Error("IDs file must be an array or contain cardIds[] or routeIds[]");
  }
  return values.map(String).filter(Boolean);
}

function expectedDiffIdsFromFile(filePath) {
  if (!filePath) return new Set();
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (parsed.game && parsed.game !== GAME_SLUG) {
    throw new Error(`Expected-diff game ${parsed.game} does not match requested game ${GAME_SLUG}`);
  }
  const values = Array.isArray(parsed)
    ? parsed
    : parsed.routeIds ?? parsed.cardIds ?? parsed.cards?.map((card) => card.routeId ?? card.id);
  if (!Array.isArray(values)) {
    throw new Error("Expected-diffs file must be an array or contain routeIds[], cardIds[], or cards[]");
  }
  return new Set(values.map(String).filter(Boolean));
}

async function selectRepresentativeCardIds() {
  if (IDS_FILE) return idsFromFile(IDS_FILE);
  const candidateTarget = Math.min(500, LIMIT + Math.max(25, Math.ceil(LIMIT * 0.25)));
  const game = encodeURIComponent(GAME_SLUG);
  const [marketCards, setIndex] = await Promise.all([
    fetchJson(`${BASE_URL}/api/markets?game=${game}&limit=${Math.min(100, LIMIT)}`),
    fetchJson(`${BASE_URL}/api/sets?game=${game}`),
  ]);
  if (!Array.isArray(marketCards) || !Array.isArray(setIndex?.sets)) {
    throw new Error("Automatic public selection requires /api/markets and /api/sets");
  }

  // Route IDs are cards.card_image_id, not the database UUID returned as id.
  // Start with the global market leaders, then deliberately add strong cards
  // across several high-value sets so the fixture is not one-set-heavy.
  const selected = [];
  const seen = new Set();
  const addRouteId = (routeId) => {
    if (!routeId || seen.has(routeId)) return;
    seen.add(routeId);
    selected.push(routeId);
  };
  const add = (card) => {
    addRouteId(card?.card_image_id);
  };
  expectedDiffIdsFromFile(EXPECTED_DIFFS_FILE).forEach(addRouteId);
  marketCards.forEach(add);

  const setSlugs = setIndex.sets
    .filter((set) => set?.slug && !set.comingSoon && Number(set.cardsTotal ?? set.cards ?? 0) > 0)
    .slice(0, 12)
    .map((set) => set.slug);
  const setDetails = await mapConcurrent(setSlugs, (slug) =>
    fetchJson(`${BASE_URL}/api/sets/${encodeURIComponent(slug)}?game=${game}`)
  );
  const perSetTarget = Math.max(12, Math.ceil(Math.max(0, candidateTarget - selected.length) / Math.max(1, setDetails.length)) + 5);
  const allSetCards = [];
  for (const detail of setDetails) {
    const cards = Array.isArray(detail?.cards) ? [...detail.cards] : [];
    cards.sort((a, b) => {
      const aPrice = a?.price_stats?.market_avg ?? a?.price_stats?.tcg_market ?? 0;
      const bPrice = b?.price_stats?.market_avg ?? b?.price_stats?.tcg_market ?? 0;
      return bPrice - aPrice;
    });
    cards.slice(0, perSetTarget).forEach(add);
    allSetCards.push(...cards);
  }
  allSetCards
    .sort((a, b) => {
      const aPrice = a?.price_stats?.market_avg ?? a?.price_stats?.tcg_market ?? 0;
      const bPrice = b?.price_stats?.market_avg ?? b?.price_stats?.tcg_market ?? 0;
      return bPrice - aPrice;
    })
    .forEach((card) => {
      if (selected.length < candidateTarget) add(card);
    });
  return selected.slice(0, candidateTarget);
}

async function capture() {
  const ids = await selectRepresentativeCardIds();
  if (ids.length === 0) throw new Error("No representative card IDs were selected");
  const cards = [];
  const skipped = [];
  const batchSize = Math.max(CONCURRENCY, CONCURRENCY * 2);
  for (let offset = 0; offset < ids.length && cards.length < LIMIT; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    const settled = await Promise.allSettled(batch.map(fetchCard));
    for (let index = 0; index < settled.length && cards.length < LIMIT; index++) {
      const result = settled[index];
      if (result.status === "fulfilled") cards.push(result.value);
      else skipped.push({ id: batch[index], error: result.reason?.message ?? String(result.reason) });
    }
  }
  if (cards.length < LIMIT) {
    throw new Error(`Captured ${cards.length}/${LIMIT} cards; ${skipped.length} candidates failed`);
  }
  const fixture = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    game: GAME_SLUG,
    cardCount: cards.length,
    routeIds: cards.map((card) => card.id),
    skippedCandidates: skipped,
    expectedDiffRouteIds: Array.from(expectedDiffIdsFromFile(EXPECTED_DIFFS_FILE)),
    cards,
  };
  fs.mkdirSync(path.dirname(path.resolve(FIXTURE_PATH)), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Captured ${cards.length} cards to ${FIXTURE_PATH}`);
}

async function compare() {
  if (!fs.existsSync(FIXTURE_PATH)) throw new Error(`Fixture does not exist: ${FIXTURE_PATH}`);
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  if (fixture.schemaVersion !== 1 || !Array.isArray(fixture.cards)) {
    throw new Error("Unsupported or invalid golden fixture");
  }
  if (fixture.game !== GAME_SLUG) {
    throw new Error(`Fixture game ${fixture.game} does not match requested game ${GAME_SLUG}`);
  }
  const actualCards = await mapConcurrent(fixture.cards.map((card) => card.id), fetchCard);
  const expectedDiffIds = expectedDiffIdsFromFile(EXPECTED_DIFFS_FILE);
  const fixtureIds = new Set(fixture.cards.map((card) => card.id));
  const missingExpectedDiffIds = Array.from(expectedDiffIds).filter((id) => !fixtureIds.has(id));
  if (missingExpectedDiffIds.length > 0) {
    throw new Error(
      `Expected-diff cards missing from golden fixture: ${missingExpectedDiffIds.join(", ")}`
    );
  }
  const actualById = new Map(actualCards.map((card) => [card.id, card]));
  const differences = [];
  for (const expected of fixture.cards) {
    const actual = actualById.get(expected.id);
    if (!actual) {
      differences.push({ id: expected.id, sections: ["missing"] });
      continue;
    }
    const sections = summarizeCardDifference(expected, actual, PROFILE);
    if (sections.length > 0) differences.push({ id: expected.id, sections });
  }
  const classifiedDifferences = classifyExpectedDifferences(differences, expectedDiffIds);
  const expectedDifferences = classifiedDifferences.filter((row) => row.status === "EXPECTED");
  const unexpectedDifferences = classifiedDifferences.filter((row) => row.status === "UNEXPECTED");
  const report = [
    "# Card API Golden Comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Game: ${GAME_SLUG}`,
    `Cards: ${fixture.cards.length}`,
    `Profile: ${PROFILE}`,
    `Expected-diff allowlist rows: ${expectedDiffIds.size}`,
    `Expected differences observed: ${expectedDifferences.length}`,
    `Unexpected differences observed: ${unexpectedDifferences.length}`,
    `Result: ${unexpectedDifferences.length === 0 ? "PASS" : "FAIL"}`,
    "",
    "## Differences",
    "",
    mdTable(
      ["Card ID", "Changed responses", "Status"],
      classifiedDifferences.map((row) => [row.id, row.sections.join(", "), row.status])
    ),
    "",
    PROFILE === "exact"
      ? "Exact JSON equality is intentional: use this before any expected legacy price write."
      : "Shape/identity comparison ignores price-bearing values and price-history cardinality, but retains stable non-price identities and response structure.",
    "",
  ].join("\n");
  writeReport(REPORT_PATH, report);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Result: ${unexpectedDifferences.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Expected differences: ${expectedDifferences.length}`);
  console.log(`Unexpected differences: ${unexpectedDifferences.length}`);
  if (unexpectedDifferences.length > 0) process.exitCode = 1;
}

if (!BASE_URL) {
  console.error("Provide --base-url=https://... or GOLDEN_API_BASE_URL");
  process.exit(1);
}
if (!new Set(["capture", "compare"]).has(MODE)) {
  console.error("--mode must be capture or compare");
  process.exit(1);
}
if (!new Set(["exact", "shape_identity"]).has(PROFILE)) {
  console.error("--profile must be exact or shape_identity");
  process.exit(1);
}
if (EXPECTED_DIFFS_FILE && PROFILE !== "exact") {
  console.error("--expected-diffs is only valid with --profile=exact");
  process.exit(1);
}

(MODE === "capture" ? capture() : compare()).catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
