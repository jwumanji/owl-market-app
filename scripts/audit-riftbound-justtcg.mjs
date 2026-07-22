// Read-only reconciliation of Moon Market's canonical Riftbound catalog,
// durable candidate queue, and live JustTCG v1 catalog.

import fs from "node:fs";

import { matchRiftboundJustTcgCards } from "../src/lib/games/riftbound-justtcg.ts";

const SOURCE_GAME = "riftbound-league-of-legends-trading-card-game";
const JUSTTCG_BASE = "https://api.justtcg.com/v1";

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

loadEnvFile();

const justTcgKey = process.env.JUSTTCG_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!justTcgKey || !supabaseUrl || !supabaseKey) {
  throw new Error(
    "JUSTTCG_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required"
  );
}

async function justTcgPage(path) {
  const response = await fetch(`${JUSTTCG_BASE}${path}`, {
    headers: { "x-api-key": justTcgKey },
  });
  if (!response.ok) throw new Error(`JustTCG ${response.status}: ${await response.text()}`);
  return response.json();
}

async function justTcgAll(path) {
  const rows = [];
  let offset = 0;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await justTcgPage(`${path}${separator}limit=100&offset=${offset}`);
    rows.push(...(body.data ?? []));
    if (!(body.meta?.hasMore ?? body.pagination?.hasMore)) break;
    offset += 100;
  }
  return rows;
}

async function supabaseRows(path) {
  const rows = [];
  let from = 0;
  while (true) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${from}-${from + 999}`,
      },
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  return rows;
}

const games = await supabaseRows("games?select=id&slug=eq.riftbound");
if (!games[0]?.id) throw new Error("Riftbound game row is missing");
const gameId = games[0].id;
const tcgplayerIds = await supabaseRows(
  `card_external_ids?select=card_id,external_id&game_id=eq.${gameId}&provider=eq.tcgplayer&external_type=eq.product_id`
);
const priceRows = await supabaseRows(
  `price_stats?select=card_id,tcg_market,market_avg&game_id=eq.${gameId}`
);
let reconciliationCandidates = [];
try {
  reconciliationCandidates = await supabaseRows(
    `catalog_reconciliation_candidates?select=entity_type,status,reason,last_seen_at&game_id=eq.${gameId}&provider=eq.justtcg`
  );
} catch (error) {
  if (!String(error).includes("catalog_reconciliation_candidates")) throw error;
}
const sets = await justTcgAll(`/sets?game=${encodeURIComponent(SOURCE_GAME)}`);

const perSet = [];
let cardsFetched = 0;
let variantsFetched = 0;
let matched = 0;
let unmatched = 0;
for (const set of sets) {
  const cards = await justTcgAll(
    `/cards?game=${encodeURIComponent(SOURCE_GAME)}&set=${encodeURIComponent(set.id)}&include_price_history=false`
  );
  const joined = matchRiftboundJustTcgCards(cards, tcgplayerIds);
  const variants = cards.reduce((sum, card) => sum + (card.variants?.length ?? 0), 0);
  cardsFetched += cards.length;
  variantsFetched += variants;
  matched += joined.matches.length;
  unmatched += joined.unmatched.length;
  perSet.push({
    id: set.id,
    name: set.name,
    cards: cards.length,
    variants,
    exactMatches: joined.matches.length,
    unmatched: joined.unmatched.length,
  });
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      sourceGame: SOURCE_GAME,
      moonTcgplayerIds: tcgplayerIds.length,
      sets: sets.length,
      cardsFetched,
      variantsFetched,
      exactMatches: matched,
      unmatched,
      pricedCatalogCards: priceRows.filter(
        (row) => Number(row.market_avg ?? row.tcg_market) >= 0
      ).length,
      reconciliation: {
        total: reconciliationCandidates.length,
        byStatus: Object.fromEntries(
          reconciliationCandidates.reduce((counts, row) => {
            counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
            return counts;
          }, new Map())
        ),
      },
      perSet,
    },
    null,
    2
  )
);
