import fs from "node:fs";

const REPORT_PATH = readArg("--report") ?? "game-boundary-audit.md";
const REQUIRED_GAMES = ["one_piece", "riftbound"];

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

function encodeIn(values) {
  return `(${values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(",")})`;
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

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTable(headers, rows) {
  if (rows.length === 0) return "_None._\n";
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map(mdEscape).join(" | ")} |`);
  }
  return `${out.join("\n")}\n`;
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort(([a], [b]) => String(a).localeCompare(String(b)));
}

function duplicateKeys(rows, keyFn) {
  const counts = countBy(rows, keyFn).filter(([key, count]) => key && count > 1);
  return counts.map(([key, count]) => ({ key, count }));
}

function indexById(rows) {
  return new Map(rows.filter((row) => row.id).map((row) => [row.id, row]));
}

function findCrossGameRows(rows, targetById, foreignKey, label) {
  const issues = [];
  for (const row of rows) {
    const targetId = row[foreignKey];
    if (!targetId) continue;
    const target = targetById.get(targetId);
    if (!target) {
      issues.push({ table: label, id: row.id, foreignKey, reason: "missing referenced row" });
      continue;
    }
    if (row.game_id !== target.game_id) {
      issues.push({
        table: label,
        id: row.id,
        foreignKey,
        reason: `row game ${row.game_id} != target game ${target.game_id}`,
      });
    }
  }
  return issues;
}

async function main() {
  const games = await sbFetchAll(
    `games?select=id,slug,name,is_active,is_public,metadata&slug=in.${encodeIn(REQUIRED_GAMES)}`
  );
  const gameBySlug = new Map(games.map((game) => [game.slug, game]));
  const onePiece = gameBySlug.get("one_piece");
  const riftbound = gameBySlug.get("riftbound");

  const [
    sets,
    cards,
    priceStats,
    priceHistory,
    inventoryItems,
    customCards,
    aliases,
    bundles,
    bundleItems,
    orders,
    orderItems,
    psaSubmissions,
    psaItems,
    centeringMeasurements,
    cardExternalIds,
    setExternalIds,
    sourceRecords,
    priceMappings,
    sealedProducts,
    sealedPriceHistory,
    cardMarketSyncStatus,
  ] = await Promise.all([
    sbFetchAll("sets?select=id,game_id,slug,code,name"),
    sbFetchAll("cards?select=id,game_id,set_id,card_image_id,card_number,name"),
    sbFetchAll("price_stats?select=id,game_id,card_id"),
    sbFetchAll("price_history?select=id,game_id,card_id"),
    sbFetchAll("inventory_items?select=id,game_id,card_id,custom_card_id"),
    sbFetchAll("custom_cards?select=id,game_id"),
    sbFetchAll("card_match_aliases?select=id,game_id,card_id"),
    sbFetchAll("inventory_bundles?select=id,game_id"),
    sbFetchAll("inventory_bundle_items?select=id,game_id,bundle_id,inventory_item_id"),
    sbFetchAll("customer_orders?select=id,game_id"),
    sbFetchAll("customer_order_items?select=id,game_id,order_id,inventory_item_id"),
    sbFetchAll("psa_submissions?select=id,game_id"),
    sbFetchAll("psa_submission_items?select=id,game_id,submission_id,inventory_item_id"),
    sbFetchAll("centering_measurements?select=id,game_id,inventory_item_id"),
    sbFetchAll("card_external_ids?select=id,game_id,provider,external_id,card_id"),
    sbFetchAll("set_external_ids?select=id,game_id,provider,external_id,set_id"),
    sbFetchAll("tcg_source_records?select=id,game_id,provider,record_type,external_id"),
    sbFetchAll("price_provider_mappings?select=id,game_id,provider,source_game_slug,is_active"),
    sbFetchAll("sealed_products?select=id,game_id,set_id"),
    sbFetchAll("sealed_product_price_history?select=id,game_id,sealed_product_id"),
    sbFetchAll("card_market_sync_status?select=game_id,card_id,provider"),
  ]);

  const tables = [
    ["sets", sets],
    ["cards", cards],
    ["price_stats", priceStats],
    ["price_history", priceHistory],
    ["inventory_items", inventoryItems],
    ["custom_cards", customCards],
    ["card_match_aliases", aliases],
    ["inventory_bundles", bundles],
    ["inventory_bundle_items", bundleItems],
    ["customer_orders", orders],
    ["customer_order_items", orderItems],
    ["psa_submissions", psaSubmissions],
    ["psa_submission_items", psaItems],
    ["centering_measurements", centeringMeasurements],
    ["card_external_ids", cardExternalIds],
    ["set_external_ids", setExternalIds],
    ["tcg_source_records", sourceRecords],
    ["price_provider_mappings", priceMappings],
    ["sealed_products", sealedProducts],
    ["sealed_product_price_history", sealedPriceHistory],
    ["card_market_sync_status", cardMarketSyncStatus],
  ];

  const setsById = indexById(sets);
  const cardsById = indexById(cards);
  const customCardsById = indexById(customCards);
  const inventoryItemsById = indexById(inventoryItems);
  const bundlesById = indexById(bundles);
  const ordersById = indexById(orders);
  const psaSubmissionsById = indexById(psaSubmissions);
  const sealedProductsById = indexById(sealedProducts);

  const crossGameIssues = [
    ...findCrossGameRows(cards, setsById, "set_id", "cards.set_id"),
    ...findCrossGameRows(priceStats, cardsById, "card_id", "price_stats.card_id"),
    ...findCrossGameRows(priceHistory, cardsById, "card_id", "price_history.card_id"),
    ...findCrossGameRows(inventoryItems, cardsById, "card_id", "inventory_items.card_id"),
    ...findCrossGameRows(inventoryItems, customCardsById, "custom_card_id", "inventory_items.custom_card_id"),
    ...findCrossGameRows(aliases, cardsById, "card_id", "card_match_aliases.card_id"),
    ...findCrossGameRows(bundleItems, bundlesById, "bundle_id", "inventory_bundle_items.bundle_id"),
    ...findCrossGameRows(bundleItems, inventoryItemsById, "inventory_item_id", "inventory_bundle_items.inventory_item_id"),
    ...findCrossGameRows(orderItems, ordersById, "order_id", "customer_order_items.order_id"),
    ...findCrossGameRows(orderItems, inventoryItemsById, "inventory_item_id", "customer_order_items.inventory_item_id"),
    ...findCrossGameRows(psaItems, psaSubmissionsById, "submission_id", "psa_submission_items.submission_id"),
    ...findCrossGameRows(psaItems, inventoryItemsById, "inventory_item_id", "psa_submission_items.inventory_item_id"),
    ...findCrossGameRows(centeringMeasurements, inventoryItemsById, "inventory_item_id", "centering_measurements.inventory_item_id"),
    ...findCrossGameRows(cardExternalIds, cardsById, "card_id", "card_external_ids.card_id"),
    ...findCrossGameRows(setExternalIds, setsById, "set_id", "set_external_ids.set_id"),
    ...findCrossGameRows(sealedProducts, setsById, "set_id", "sealed_products.set_id"),
    ...findCrossGameRows(
      sealedPriceHistory,
      sealedProductsById,
      "sealed_product_id",
      "sealed_product_price_history.sealed_product_id"
    ),
    ...findCrossGameRows(
      cardMarketSyncStatus,
      cardsById,
      "card_id",
      "card_market_sync_status.card_id"
    ),
  ];

  const globalCardDuplicates = duplicateKeys(cards, (card) => card.card_image_id);
  const scopedCardDuplicates = duplicateKeys(cards, (card) => `${card.game_id}:${card.card_image_id}`);
  const globalSetSlugDuplicates = duplicateKeys(sets, (set) => set.slug);
  const scopedSetSlugDuplicates = duplicateKeys(sets, (set) => `${set.game_id}:${set.slug}`);
  const scopedSetCodeDuplicates = duplicateKeys(
    sets.filter((set) => set.code),
    (set) => `${set.game_id}:${String(set.code).toUpperCase()}`
  );
  const scopedCardExternalIdDuplicates = duplicateKeys(
    cardExternalIds,
    (row) => `${row.game_id}:${row.provider}:${row.external_id}`
  );
  const scopedSetExternalIdDuplicates = duplicateKeys(
    setExternalIds,
    (row) => `${row.game_id}:${row.provider}:${row.external_id}`
  );

  const missingGameRows = tables.flatMap(([table, rows]) =>
    rows.filter((row) => !row.game_id).map((row) => ({ table, id: row.id }))
  );

  const privateGateIssues = [];
  const riftboundPricingGateApproved =
    riftbound?.metadata?.pricing_status === "deferred" ||
    (
      riftbound?.metadata?.pricing_status === "live" &&
      riftbound?.metadata?.pricing_provider === "justtcg" &&
      riftbound?.metadata?.justtcg_ingestion_status === "live_exact_matches"
    );
  const riftboundCatalogPreviewApproved =
    riftbound?.is_public !== false &&
    riftbound?.metadata?.launch_status === "public_catalog_preview" &&
    riftbound?.metadata?.public_launch_scope === "catalog_and_tcgplayer_images" &&
    riftbound?.metadata?.public_launch_gate === "tcgplayer_images_only" &&
    riftboundPricingGateApproved;
  if (!onePiece) privateGateIssues.push("Missing one_piece game row");
  if (!riftbound) privateGateIssues.push("Missing riftbound game row");
  if (onePiece && onePiece.is_active === false) privateGateIssues.push("one_piece is not active");
  if (onePiece && onePiece.is_public === false) privateGateIssues.push("one_piece is not public");
  if (riftbound && riftbound.is_active === false) privateGateIssues.push("riftbound is not active");
  if (riftbound && riftbound.is_public !== false && !riftboundCatalogPreviewApproved) {
    privateGateIssues.push("riftbound is public without an approved catalog-preview and pricing gate");
  }

  const gameCounts = [];
  for (const game of games) {
    for (const [table, rows] of tables) {
      gameCounts.push([game.slug, table, rows.filter((row) => row.game_id === game.id).length]);
    }
  }

  const hardFailures = [
    ...privateGateIssues,
    ...missingGameRows.map((row) => `${row.table}.${row.id} missing game_id`),
    ...crossGameIssues.map((row) => `${row.table}.${row.id} ${row.reason}`),
    ...scopedCardDuplicates.map((row) => `duplicate scoped card key ${row.key}`),
    ...scopedSetSlugDuplicates.map((row) => `duplicate scoped set slug ${row.key}`),
    ...scopedSetCodeDuplicates.map((row) => `duplicate scoped set code ${row.key}`),
    ...scopedCardExternalIdDuplicates.map((row) => `duplicate scoped card external ID ${row.key}`),
    ...scopedSetExternalIdDuplicates.map((row) => `duplicate scoped set external ID ${row.key}`),
  ];

  const report = [];
  report.push("# Game Boundary Audit");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Result: ${hardFailures.length === 0 ? "PASS" : "FAIL"}`);
  report.push("");
  report.push("## Game Rows");
  report.push("");
  report.push(mdTable(
    ["Slug", "Name", "Active", "Public", "Route Slug"],
    games.map((game) => [
      game.slug,
      game.name,
      game.is_active !== false ? "yes" : "no",
      game.is_public !== false ? "yes" : "no",
      game.metadata?.route_slug ?? "",
    ])
  ));
  report.push("");
  report.push("## Table Counts By Game");
  report.push("");
  report.push(mdTable(["Game", "Table", "Rows"], gameCounts));
  report.push("");
  report.push("## Missing Game IDs");
  report.push("");
  report.push(mdTable(["Table", "Row ID"], missingGameRows.map((row) => [row.table, row.id])));
  report.push("");
  report.push("## Cross-Game Relationship Drift");
  report.push("");
  report.push(mdTable(
    ["Relation", "Row ID", "Foreign Key", "Reason"],
    crossGameIssues.map((row) => [row.table, row.id, row.foreignKey, row.reason])
  ));
  report.push("");
  report.push("## Duplicate Key Checks");
  report.push("");
  report.push(mdTable(
    ["Check", "Duplicates"],
    [
      ["Global card_image_id duplicates (allowed after scoping)", globalCardDuplicates.length],
      ["Scoped card game_id/card_image_id duplicates", scopedCardDuplicates.length],
      ["Global set slug duplicates (allowed after scoping)", globalSetSlugDuplicates.length],
      ["Scoped set game_id/slug duplicates", scopedSetSlugDuplicates.length],
      ["Scoped set game_id/upper(code) duplicates", scopedSetCodeDuplicates.length],
      ["Scoped card external ID duplicates", scopedCardExternalIdDuplicates.length],
      ["Scoped set external ID duplicates", scopedSetExternalIdDuplicates.length],
    ]
  ));
  report.push("");
  report.push("## Source And Provider Counts");
  report.push("");
  report.push(mdTable(
    ["Game", "Provider / Type", "Rows"],
    games.flatMap((game) =>
      countBy(
        sourceRecords.filter((row) => row.game_id === game.id),
        (row) => `${row.provider}:${row.record_type}`
      ).map(([key, count]) => [game.slug, key, count])
    )
  ));
  report.push("");
  report.push(mdTable(
    ["Game", "Provider", "Active Mappings"],
    games.flatMap((game) =>
      countBy(
        priceMappings.filter((row) => row.game_id === game.id && row.is_active),
        (row) => row.provider
      ).map(([key, count]) => [game.slug, key, count])
    )
  ));
  report.push("");
  report.push("## Failures");
  report.push("");
  report.push(hardFailures.length === 0 ? "_None._\n" : hardFailures.map((failure) => `- ${failure}`).join("\n"));
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Result: ${hardFailures.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Games checked: ${games.map((game) => game.slug).join(", ")}`);
  console.log(`Cross-game issues: ${crossGameIssues.length}`);
  console.log(`Missing game_id rows: ${missingGameRows.length}`);
  if (hardFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
