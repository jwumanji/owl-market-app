import {
  assertExpectedProject,
  countBy,
  duplicateKeys,
  indexBy,
  mdTable,
  probeResource,
  readArg,
  requiredSupabaseEnv,
  sbCount,
  sbFetchAll,
  writeReport,
} from "./lib/multitcg-audit-utils.mjs";

const REPORT_PATH = readArg("--report", "multitcg-reconciliation-report.md");
const EXPECTED_REF = readArg("--expected-project-ref", process.env.SUPABASE_EXPECTED_PROJECT_REF);

const REQUIRED_NEW_SCHEMA = {
  data_providers: "id,code",
  card_printings: "id,game_id,legacy_card_id,card_definition_id",
  commercial_variants: "id,game_id,card_printing_id,variant_key",
  provider_products: "id,game_id,provider_id,source_catalog_key,external_namespace,external_id,card_printing_id",
  provider_skus: "id,game_id,provider_id,source_catalog_key,external_namespace,external_id,commercial_variant_id",
  price_observations: "id,game_id,commercial_variant_id,provider_id,provider_sku_id,price_type,observed_at",
  latest_price_facts: "id,game_id,commercial_variant_id,provider_id,market_code,market_region_scope,currency_code,condition_code,grade_key,price_type",
  preferred_card_prices: "card_printing_id,game_id,legacy_card_id,commercial_variant_id,latest_price_fact_id",
  ebay_sale_variant_matches: "ebay_sale_id,game_id,commercial_variant_id,match_status",
  provider_sync_states: "id,game_id,provider,provider_api_version,job_key,scope_key,legacy_key",
};

async function main() {
  const { supabaseUrl, supabaseKey } = requiredSupabaseEnv();
  const projectRef = assertExpectedProject(supabaseUrl, EXPECTED_REF);
  const probes = await Promise.all(
    Object.entries(REQUIRED_NEW_SCHEMA).map(([table, columns]) =>
      probeResource({ supabaseUrl, supabaseKey, table, columns })
    )
  );
  const missing = probes.filter((probe) => !probe.ok);
  if (missing.length > 0) {
    throw new Error(`Foundation is not deployed: ${missing.map((row) => row.table).join(", ")}`);
  }

  const games = await sbFetchAll({ supabaseUrl, supabaseKey, resource: "games?select=id,slug" });
  const game = games.find((row) => row.slug === "one_piece");
  if (!game) throw new Error("Missing games.slug=one_piece");
  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;

  const resources = Object.fromEntries(
    await Promise.all([
      ["cards", `cards?select=id,game_id&${gameFilter}`],
      ["data_providers", "data_providers?select=id,code"],
      ["card_external_ids", "card_external_ids?select=id,provider"],
      ["game_rarities", `game_rarities?select=id,game_id,code&${gameFilter}`],
      ["price_stats", `price_stats?select=card_id,tcg_market&${gameFilter}`],
      ["inventory_items", `inventory_items?select=id,card_id,card_printing_id,commercial_variant_id&${gameFilter}`],
      ["psa_submission_items", `psa_submission_items?select=id,inventory_item_id,card_printing_id,commercial_variant_id&${gameFilter}`],
      ["centering_measurements", `centering_measurements?select=id,inventory_item_id,card_printing_id,commercial_variant_id&${gameFilter}`],
      ["ebay_sales", `ebay_sales?select=id,card_id,grade_label,grade_tier_code&${gameFilter}`],
      ...Object.entries(REQUIRED_NEW_SCHEMA)
        .filter(([table]) => table !== "price_observations" && table !== "data_providers")
        .map(([table, columns]) => [
        table,
        `${table}?select=${columns}&${gameFilter}`,
      ]),
    ].map(async ([name, resource]) => [
      name,
      await sbFetchAll({ supabaseUrl, supabaseKey, resource }),
    ]))
  );
  const [priceObservationCount, trueMarketCount] = await Promise.all([
    sbCount({
      supabaseUrl,
      supabaseKey,
      resource: `price_observations?select=id&${gameFilter}`,
    }),
    sbCount({
      supabaseUrl,
      supabaseKey,
      resource: `price_observations?select=id&${gameFilter}&price_type=eq.true_market`,
    }),
  ]);

  const foundationFailures = [];
  const cutoverBlockers = [];
  const providerCodes = new Set(resources.data_providers.map((row) => row.code));
  const externalProviderCodes = Array.from(new Set(
    resources.card_external_ids.map((row) => String(row.provider).toLowerCase())
  )).sort();
  const unmappedProviderCodes = externalProviderCodes.filter((code) => !providerCodes.has(code));
  if (unmappedProviderCodes.length > 0) {
    foundationFailures.push(
      `Unmapped card_external_ids provider codes: ${unmappedProviderCodes.join(", ")}`
    );
  }
  const trRarities = resources.game_rarities.filter(
    (row) => String(row.code ?? "").toUpperCase() === "TR"
  );
  if (trRarities.length !== 1) {
    foundationFailures.push(`Expected exactly one One Piece TR rarity taxonomy row, found ${trRarities.length}`);
  }
  const printingsByLegacyCard = countBy(
    resources.card_printings.filter((row) => row.legacy_card_id),
    (row) => row.legacy_card_id
  );
  for (const card of resources.cards) {
    if (printingsByLegacyCard.get(card.id) !== 1) {
      foundationFailures.push(`Card ${card.id} has ${printingsByLegacyCard.get(card.id) ?? 0} legacy printings`);
    }
  }

  const variantsByPrinting = countBy(
    resources.commercial_variants.filter((row) => row.variant_key === "legacy"),
    (row) => row.card_printing_id
  );
  for (const printing of resources.card_printings.filter((row) => row.legacy_card_id)) {
    if (variantsByPrinting.get(printing.id) !== 1) {
      foundationFailures.push(`Printing ${printing.id} has ${variantsByPrinting.get(printing.id) ?? 0} legacy variants`);
    }
  }

  const unmappedInventory = resources.inventory_items.filter(
    (row) => row.card_id && (!row.card_printing_id || !row.commercial_variant_id)
  );
  const unmappedPsa = resources.psa_submission_items.filter(
    (row) => row.inventory_item_id && (!row.card_printing_id || !row.commercial_variant_id)
  );
  const unmappedLens = resources.centering_measurements.filter(
    (row) => row.inventory_item_id && (!row.card_printing_id || !row.commercial_variant_id)
  );
  foundationFailures.push(...unmappedInventory.map((row) => `Inventory ${row.id} is not mapped`));
  foundationFailures.push(...unmappedPsa.map((row) => `PSA item ${row.id} is not mapped`));
  foundationFailures.push(...unmappedLens.map((row) => `Centering measurement ${row.id} is not mapped`));

  const matchesBySale = countBy(resources.ebay_sale_variant_matches, (row) => row.ebay_sale_id);
  for (const sale of resources.ebay_sales) {
    if (matchesBySale.get(sale.id) !== 1) {
      foundationFailures.push(`eBay sale ${sale.id} has ${matchesBySale.get(sale.id) ?? 0} match-state rows`);
    }
  }
  const unresolvedEbay = resources.ebay_sale_variant_matches.filter(
    (row) => row.match_status !== "matched" || !row.commercial_variant_id
  );
  if (unresolvedEbay.length > 0) {
    cutoverBlockers.push(`${unresolvedEbay.length} eBay sales do not resolve to exactly one commercial variant`);
  }

  if (trueMarketCount > 0) {
    foundationFailures.push(`${trueMarketCount} True Market observations exist while integration is disabled`);
  }

  const productDuplicates = duplicateKeys(
    resources.provider_products,
    (row) => `${row.provider_id}:${row.source_catalog_key}:${row.external_namespace}:${row.external_id}`
  );
  const skuDuplicates = duplicateKeys(
    resources.provider_skus,
    (row) => `${row.provider_id}:${row.source_catalog_key}:${row.external_namespace}:${row.external_id}`
  );
  foundationFailures.push(...productDuplicates.map((row) => `Provider product collision ${row.key}`));
  foundationFailures.push(...skuDuplicates.map((row) => `Provider SKU collision ${row.key}`));

  const latestDuplicates = duplicateKeys(
    resources.latest_price_facts,
    (row) => [
      row.commercial_variant_id,
      row.provider_id,
      row.market_code,
      row.market_region_scope,
      row.currency_code,
      row.condition_code,
      row.grade_key,
      row.price_type,
    ].join(":"),
  );
  foundationFailures.push(...latestDuplicates.map((row) => `Latest fact collision ${row.key}`));

  const preferredByLegacyCard = indexBy(
    resources.preferred_card_prices.filter((row) => row.legacy_card_id),
    "legacy_card_id"
  );
  const pricedCardIds = new Set(
    resources.price_stats.filter((row) => row.tcg_market != null).map((row) => row.card_id)
  );
  const missingPreferred = Array.from(pricedCardIds).filter((cardId) => !preferredByLegacyCard.has(cardId));
  if (missingPreferred.length > 0) {
    cutoverBlockers.push(`${missingPreferred.length} legacy priced cards lack a preferred-price projection`);
  }
  if (priceObservationCount === 0) {
    cutoverBlockers.push("No shadow price observations exist; dual writing has not been proven");
  }

  const report = [
    "# Multi-TCG Reconciliation",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Supabase project: ${projectRef}`,
    "Mode: read-only",
    `Foundation: ${foundationFailures.length === 0 ? "PASS" : "FAIL"}`,
    `Read cutover: ${foundationFailures.length === 0 && cutoverBlockers.length === 0 ? "READY" : "BLOCKED"}`,
    "",
    "## Coverage",
    "",
    mdTable(
      ["Check", "Rows", "Unresolved"],
      [
        ["Legacy cards → printings", resources.cards.length, foundationFailures.filter((row) => row.startsWith("Card ")).length],
        ["Printings → legacy variants", resources.card_printings.length, foundationFailures.filter((row) => row.startsWith("Printing ")).length],
        ["Inventory identity", resources.inventory_items.length, unmappedInventory.length],
        ["PSA identity", resources.psa_submission_items.length, unmappedPsa.length],
        ["Owl Lens identity", resources.centering_measurements.length, unmappedLens.length],
        ["One Piece TR rarity taxonomy", trRarities.length, trRarities.length === 1 ? 0 : 1],
        ["External provider-code mapping", externalProviderCodes.length, unmappedProviderCodes.length],
        ["eBay exact variant match", resources.ebay_sales.length, unresolvedEbay.length],
        ["Immutable price observations", priceObservationCount, 0],
        ["Preferred priced-card coverage", pricedCardIds.size, missingPreferred.length],
      ]
    ),
    "",
    "## Foundation failures",
    "",
    foundationFailures.length === 0 ? "_None._" : foundationFailures.map((row) => `- ${row}`).join("\n"),
    "",
    "## Read-cutover blockers",
    "",
    cutoverBlockers.length === 0 ? "_None._" : cutoverBlockers.map((row) => `- ${row}`).join("\n"),
    "",
    "## Interpretation",
    "",
    "- Foundation PASS means the additive identity and pricing layers are internally consistent.",
    "- Read cutover remains blocked until eBay is exactly matched, shadow price coverage is complete, and golden API comparisons pass.",
    "- This audit performs GET requests only.",
    "",
  ].join("\n");
  writeReport(REPORT_PATH, report);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Foundation: ${foundationFailures.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Read cutover: ${foundationFailures.length === 0 && cutoverBlockers.length === 0 ? "READY" : "BLOCKED"}`);
  if (foundationFailures.length > 0) process.exitCode = 1;
  else if (cutoverBlockers.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
