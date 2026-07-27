import {
  assertExpectedProject,
  duplicateKeys,
  indexBy,
  mdTable,
  probeResource,
  projectRefFromUrl,
  readArg,
  requiredSupabaseEnv,
  sbFetchAll,
  writeReport,
} from "./lib/multitcg-audit-utils.mjs";

const REPORT_PATH = readArg("--report", "multitcg-preflight-report.md");
const EXPECTED_REF = readArg("--expected-project-ref", process.env.SUPABASE_EXPECTED_PROJECT_REF);
const FOUNDATION_PROVIDER_CODES = new Set([
  "justtcg",
  "ebay",
  "yuyutei",
  "tcgplayer",
  "optcgapi",
  "riftcodex",
]);

const REQUIRED_SCHEMA = {
  games: "id,slug,name,is_active,is_public,metadata",
  sets: "id,game_id,set_type_id,slug,code,name,release_date",
  cards: "id,game_id,set_id,rarity_id,variant_id,character_id,card_image_id,card_number,name,rarity,variant_label,region,game_payload",
  game_rarities: "id,game_id,code,name",
  game_variants: "id,game_id,code,name",
  game_set_types: "id,game_id,code,name",
  characters: "id,game_id,name",
  card_character_links: "game_id,card_id,character_id",
  inventory_items: "id,game_id,card_id",
  psa_submission_items: "id,game_id,inventory_item_id",
  centering_measurements: "id,game_id,inventory_item_id,created_at",
  jp_prices: "id,game_id,card_id,snapshot_date",
  ebay_sales: "id,game_id,card_id,grader,grade,title,sold_at",
  card_external_ids: "id,game_id,card_id,provider,external_id,external_type,metadata",
  set_external_ids: "id,game_id,set_id,provider,external_id,external_type,metadata",
  tcg_source_records: "id,game_id,provider,record_type,external_id,payload_hash,payload",
  price_provider_mappings: "id,game_id,provider",
  sync_state: "key,state,locked_at,lock_owner,updated_at,created_at",
  public_rarity_summaries: "game_id,rarity_id",
  public_character_summaries: "game_id,character_id",
};

const AUDIT_COLUMNS = {
  games: "id,slug,name,is_active,is_public",
  sets: "id,game_id,set_type_id,slug,code",
  cards: "id,game_id,set_id,rarity_id,variant_id,character_id,card_image_id",
  game_rarities: "id,game_id,code",
  game_variants: "id,game_id",
  game_set_types: "id,game_id",
  characters: "id,game_id",
  card_character_links: "game_id,card_id,character_id",
  inventory_items: "id,game_id,card_id",
  psa_submission_items: "id,game_id,inventory_item_id",
  centering_measurements: "id,game_id,inventory_item_id",
  jp_prices: "id,game_id,card_id",
  ebay_sales: "id,game_id,card_id",
  card_external_ids: "id,game_id,card_id,provider,external_id,external_type",
  set_external_ids: "id,game_id,set_id,provider,external_id,external_type",
  tcg_source_records: "id,game_id,provider,record_type,external_id",
  price_provider_mappings: "id,game_id,provider",
  sync_state: "key,locked_at,lock_owner",
  public_rarity_summaries: "game_id,rarity_id",
  public_character_summaries: "game_id,character_id",
};

function sameGameIssues(rows, targetById, foreignKey, label) {
  const issues = [];
  for (const row of rows) {
    const targetId = row[foreignKey];
    if (!targetId) continue;
    const target = targetById.get(targetId);
    if (!target) {
      issues.push(`${label}.${row.id ?? "row"}: missing ${foreignKey}=${targetId}`);
    } else if (row.game_id !== target.game_id) {
      issues.push(`${label}.${row.id ?? "row"}: game_id differs from ${foreignKey}`);
    }
  }
  return issues;
}

async function main() {
  const { supabaseUrl, supabaseKey } = requiredSupabaseEnv();
  const projectRef = assertExpectedProject(supabaseUrl, EXPECTED_REF);
  const probes = await Promise.all(
    Object.entries(REQUIRED_SCHEMA).map(([table, columns]) =>
      probeResource({ supabaseUrl, supabaseKey, table, columns })
    )
  );
  const missingSchema = probes.filter((probe) => !probe.ok);
  if (missingSchema.length > 0) {
    const report = [
      "# Multi-TCG Migration Preflight",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Supabase project: ${projectRefFromUrl(supabaseUrl)}`,
      "Result: FAIL",
      "",
      "## Missing prerequisites",
      "",
      mdTable(["Table", "Error"], missingSchema.map((row) => [row.table, row.error])),
      "",
    ].join("\n");
    writeReport(REPORT_PATH, report);
    throw new Error(`Preflight failed: ${missingSchema.length} required tables or columns are missing`);
  }

  const resources = Object.fromEntries(
    await Promise.all(
      Object.entries(AUDIT_COLUMNS).map(async ([table, columns]) => [
        table,
        await sbFetchAll({ supabaseUrl, supabaseKey, resource: `${table}?select=${columns}` }),
      ])
    )
  );
  const gamesById = indexBy(resources.games);
  const setsById = indexBy(resources.sets);
  const cardsById = indexBy(resources.cards);
  const raritiesById = indexBy(resources.game_rarities);
  const variantsById = indexBy(resources.game_variants);
  const setTypesById = indexBy(resources.game_set_types);
  const charactersById = indexBy(resources.characters);
  const inventoryById = indexBy(resources.inventory_items);

  const onePiece = resources.games.find((game) => game.slug === "one_piece");
  const failures = [];
  if (!onePiece) failures.push("Missing games.slug=one_piece");
  if (onePiece?.is_active === false) failures.push("One Piece is not active");
  if (onePiece?.is_public === false) failures.push("One Piece is not public");

  const onePieceTrRarities = onePiece
    ? resources.game_rarities.filter(
        (row) => row.game_id === onePiece.id && String(row.code ?? "").toUpperCase() === "TR"
      )
    : [];
  if (onePiece && onePieceTrRarities.length !== 1) {
    failures.push(
      `Expected exactly one One Piece TR rarity taxonomy row, found ${onePieceTrRarities.length}`
    );
  }

  const distinctExternalProviderCodes = Array.from(new Set(
    resources.card_external_ids.map((row) => String(row.provider).toLowerCase())
  )).sort();
  const unmappedExternalProviderCodes = distinctExternalProviderCodes.filter(
    (code) => !FOUNDATION_PROVIDER_CODES.has(code)
  );
  if (unmappedExternalProviderCodes.length > 0) {
    failures.push(
      `Unmapped card_external_ids provider codes: ${unmappedExternalProviderCodes.join(", ")}`
    );
  }

  failures.push(...sameGameIssues(resources.cards, setsById, "set_id", "cards"));
  failures.push(...sameGameIssues(resources.cards, raritiesById, "rarity_id", "cards"));
  failures.push(...sameGameIssues(resources.cards, variantsById, "variant_id", "cards"));
  failures.push(...sameGameIssues(resources.cards, charactersById, "character_id", "cards"));
  failures.push(...sameGameIssues(resources.sets, setTypesById, "set_type_id", "sets"));
  failures.push(...sameGameIssues(resources.card_character_links, cardsById, "card_id", "card_character_links"));
  failures.push(...sameGameIssues(resources.card_character_links, charactersById, "character_id", "card_character_links"));
  failures.push(...sameGameIssues(resources.jp_prices, cardsById, "card_id", "jp_prices"));
  failures.push(...sameGameIssues(resources.inventory_items, cardsById, "card_id", "inventory_items"));
  failures.push(...sameGameIssues(resources.psa_submission_items, inventoryById, "inventory_item_id", "psa_submission_items"));
  failures.push(...sameGameIssues(resources.centering_measurements, inventoryById, "inventory_item_id", "centering_measurements"));
  failures.push(...sameGameIssues(resources.card_external_ids, cardsById, "card_id", "card_external_ids"));
  failures.push(...sameGameIssues(resources.set_external_ids, setsById, "set_id", "set_external_ids"));

  const scopedCardDuplicates = duplicateKeys(
    resources.cards,
    (row) => `${row.game_id}:${row.card_image_id}`
  );
  const providerIdDuplicates = duplicateKeys(
    resources.card_external_ids,
    (row) => `${row.game_id}:${row.provider}:${row.external_type}:${row.external_id}`
  );
  failures.push(...scopedCardDuplicates.map((row) => `Duplicate scoped card identity ${row.key}`));
  failures.push(...providerIdDuplicates.map((row) => `Duplicate scoped provider identity ${row.key}`));

  const onePieceCards = onePiece
    ? resources.cards.filter((row) => row.game_id === onePiece.id)
    : [];
  const onePieceEbay = onePiece
    ? resources.ebay_sales.filter((row) => row.game_id === onePiece.id)
    : [];
  const knownCursors = new Set([
    "justtcg_price_sync_current",
    "justtcg_price_history_backfill_1y",
    "ebay_sync_current",
    "jp_prices_sync_current",
  ]);
  const presentCursors = resources.sync_state.filter((row) => knownCursors.has(row.key));

  const report = [
    "# Multi-TCG Migration Preflight",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Supabase project: ${projectRef}`,
    "Mode: read-only",
    `Result: ${failures.length === 0 ? "PASS" : "FAIL"}`,
    "",
    "## Bootstrap estimate",
    "",
    mdTable(
      ["Item", "Rows"],
      [
        ["One Piece legacy cards / provisional printings", onePieceCards.length],
        ["One Piece provisional commercial variants", onePieceCards.length],
        ["Existing eBay sales entering quarantine", onePieceEbay.length],
        ["Known legacy sync cursors carried forward", presentCursors.length],
        ["Inventory rows", resources.inventory_items.length],
        ["PSA submission items", resources.psa_submission_items.length],
        ["Owl Lens centering measurements", resources.centering_measurements.length],
        ["One Piece TR rarity taxonomy rows", onePieceTrRarities.length],
      ]
    ),
    "",
    "## Required schema",
    "",
    mdTable(["Table", "Status"], probes.map((probe) => [probe.table, probe.ok ? "ready" : "missing"])),
    "",
    "## Provider bootstrap",
    "",
    `Distinct card_external_ids providers: ${distinctExternalProviderCodes.join(", ") || "_None._"}`,
    "",
    `Unmapped providers: ${unmappedExternalProviderCodes.join(", ") || "_None._"}`,
    "",
    "## Integrity failures",
    "",
    failures.length === 0 ? "_None._" : failures.map((failure) => `- ${failure}`).join("\n"),
    "",
    "## Safety notes",
    "",
    "- This audit performs GET requests only.",
    "- A passing result means the additive migration prerequisites are present; it does not authorize applying them to production.",
    "- Existing eBay rows are expected to remain quarantined until exact commercial-variant matching is complete.",
    "- JustTCG True Market remains disabled.",
    "",
  ].join("\n");
  writeReport(REPORT_PATH, report);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Project: ${projectRef}`);
  console.log(`Result: ${failures.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`One Piece cards: ${onePieceCards.length}`);
  console.log(`eBay rows to quarantine: ${onePieceEbay.length}`);
  console.log(`Distinct card external providers: ${distinctExternalProviderCodes.join(", ")}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
