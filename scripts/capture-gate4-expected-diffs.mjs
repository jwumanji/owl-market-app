import fs from "node:fs";
import path from "node:path";
import {
  assertExpectedProject,
  readArg,
  requiredSupabaseEnv,
  sbFetchAll,
} from "./lib/multitcg-audit-utils.mjs";
import { enumerateGate4ExpectedDiffs } from "./lib/gate4-expected-diffs.mjs";

const OUTPUT_PATH = readArg(
  "--output",
  "tests/fixtures/golden/gate4-expected-diffs.json"
);
const EXPECTED_REF = readArg("--expected-project-ref", process.env.SUPABASE_EXPECTED_PROJECT_REF);

async function main() {
  const { supabaseUrl, supabaseKey } = requiredSupabaseEnv();
  const projectRef = assertExpectedProject(supabaseUrl, EXPECTED_REF);
  const games = await sbFetchAll({
    supabaseUrl,
    supabaseKey,
    resource: "games?select=id,slug",
  });
  const game = games.find((row) => row.slug === "one_piece");
  if (!game) throw new Error("Missing games.slug=one_piece");
  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;
  const [sets, cards, rarities] = await Promise.all([
    sbFetchAll({
      supabaseUrl,
      supabaseKey,
      resource: `sets?select=id,game_id,code&${gameFilter}`,
    }),
    sbFetchAll({
      supabaseUrl,
      supabaseKey,
      resource: `cards?select=id,game_id,set_id,card_image_id,name,rarity,variant_label,rarity_id,region&${gameFilter}`,
    }),
    sbFetchAll({
      supabaseUrl,
      supabaseKey,
      resource: `game_rarities?select=id,game_id,code&${gameFilter}`,
    }),
  ]);
  const rows = enumerateGate4ExpectedDiffs({ game, sets, cards, rarities });
  const selectorCounts = {
    "20260719113000.corrected_cards": 0,
    "20260719113000.variant_label_backfill": 0,
    "20260719114500.tr_reference_reconcile": 0,
  };
  for (const row of rows) {
    for (const selector of row.selectors) {
      selectorCounts[selector] = (selectorCounts[selector] ?? 0) + 1;
    }
  }
  const fixture = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "read-only GET enumeration",
    projectRef,
    game: game.slug,
    cardCount: rows.length,
    selectorCounts,
    routeIds: rows.map((row) => row.routeId),
    cards: rows,
  };
  fs.mkdirSync(path.dirname(path.resolve(OUTPUT_PATH)), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Project: ${projectRef}`);
  console.log(`Gate 4 expected-diff rows: ${rows.length}`);
  console.log(`Selectors: ${JSON.stringify(selectorCounts)}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
