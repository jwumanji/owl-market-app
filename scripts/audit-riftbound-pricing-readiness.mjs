import fs from "node:fs";

const REPORT_PATH = readArg("--report") ?? "riftbound-pricing-readiness.md";
const GAME_SLUG = "riftbound";

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

function headers(extra = {}) {
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
      headers: headers({ Range: `${from}-${from + pageSize - 1}` }),
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

function pct(count, total) {
  if (!total) return "0.0%";
  return `${((count / total) * 100).toFixed(1)}%`;
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
  return countBy(rows, keyFn)
    .filter(([key, count]) => key && count > 1)
    .map(([key, count]) => ({ key, count }));
}

function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function externalIdRowsFor(ownerId, rows, ownerKey) {
  return rows.filter((row) => row[ownerKey] === ownerId);
}

function hasExternalId(ownerId, rows, ownerKey, provider, externalType) {
  return externalIdRowsFor(ownerId, rows, ownerKey).some(
    (row) => row.provider === provider && row.external_type === externalType && row.external_id
  );
}

async function main() {
  const games = await sbFetchAll(`games?select=id,slug,name,is_active,is_public,metadata&slug=eq.${GAME_SLUG}`, 1);
  const game = games[0];
  if (!game?.id) throw new Error("Riftbound game row is missing");

  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;
  const [sets, cards, variants, cardExternalIds, setExternalIds, priceMappings] = await Promise.all([
    sbFetchAll(`sets?select=id,slug,code,name,card_count&${gameFilter}`),
    sbFetchAll(`cards?select=id,set_id,card_number,name,variant_id,rarity,tcg_product_id,game_payload&${gameFilter}`),
    sbFetchAll(`game_variants?select=id,code,name&${gameFilter}`),
    sbFetchAll(`card_external_ids?select=id,provider,external_type,external_id,card_id&${gameFilter}`),
    sbFetchAll(`set_external_ids?select=id,provider,external_type,external_id,set_id&${gameFilter}`),
    sbFetchAll(`price_provider_mappings?select=id,provider,source_game_slug,source_set_slug,is_active,product_key_rules,pricing_capabilities,metadata&${gameFilter}`),
  ]);

  const variantById = byId(variants);

  const cardsWithRiftcodexKey = cards.filter((card) =>
    hasExternalId(card.id, cardExternalIds, "card_id", "riftcodex", "card_key")
  );
  const cardsWithTcgplayerProduct = cards.filter((card) =>
    hasExternalId(card.id, cardExternalIds, "card_id", "tcgplayer", "product_id")
  );
  const cardsWithCardmarketId = cards.filter((card) =>
    externalIdRowsFor(card.id, cardExternalIds, "card_id").some((row) => row.provider === "cardmarket")
  );
  const cardsWithPayloadTcgplayer = cards.filter((card) => card.game_payload?.source?.tcgplayer_id);

  const setRows = sets
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((set) => {
      const setCards = cards.filter((card) => card.set_id === set.id);
      const tcgplayerCards = setCards.filter((card) =>
        hasExternalId(card.id, cardExternalIds, "card_id", "tcgplayer", "product_id")
      );
      const tcgplayerSet = hasExternalId(set.id, setExternalIds, "set_id", "tcgplayer", "set_id");
      const cardmarketSet = externalIdRowsFor(set.id, setExternalIds, "set_id").some((row) => row.provider === "cardmarket");
      return [
        set.code,
        set.name,
        setCards.length,
        `${tcgplayerCards.length} (${pct(tcgplayerCards.length, setCards.length)})`,
        tcgplayerSet ? "yes" : "no",
        cardmarketSet ? "yes" : "no",
      ];
    });

  const variantRows = countBy(cards, (card) => variantById.get(card.variant_id)?.code ?? "UNKNOWN")
    .map(([variantCode, count]) => {
      const variantCards = cards.filter((card) => (variantById.get(card.variant_id)?.code ?? "UNKNOWN") === variantCode);
      const tcgplayerCards = variantCards.filter((card) =>
        hasExternalId(card.id, cardExternalIds, "card_id", "tcgplayer", "product_id")
      );
      return [variantCode, count, `${tcgplayerCards.length} (${pct(tcgplayerCards.length, count)})`];
    });

  const tcgplayerDuplicateProducts = duplicateKeys(
    cardExternalIds.filter((row) => row.provider === "tcgplayer" && row.external_type === "product_id"),
    (row) => row.external_id
  );
  const riftcodexDuplicateKeys = duplicateKeys(
    cardExternalIds.filter((row) => row.provider === "riftcodex" && row.external_type === "card_key"),
    (row) => row.external_id
  );

  const providerReadiness = [
    [
      "scrydex",
      "Not stored yet",
      "Promising, blocked on fixture",
      "Docs expose Riftbound cards, raw prices, graded prices, and history; need credentialed sample to prove exact card ID or search join.",
    ],
    [
      "tcgplayer",
      `${cardsWithTcgplayerProduct.length}/${cards.length} card product IDs`,
      "Catalog IDs ready; price API blocked",
      "Product IDs are complete, but official pricing needs API access and SKU/condition resolution before writing prices.",
    ],
    [
      "cardmarket",
      `${cardsWithCardmarketId.length}/${cards.length} card IDs, ${sets.filter((set) => externalIdRowsFor(set.id, setExternalIds, "set_id").some((row) => row.provider === "cardmarket")).length}/${sets.length} set IDs`,
      "Not ready",
      "Only partial set IDs are present and no card IDs are stored, so exact card-level joins are not yet safe.",
    ],
  ];

  const report = [];
  report.push("# Riftbound Pricing Readiness Audit");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Game: ${game.name} (${game.id})`);
  report.push(`Public: ${game.is_public ? "yes" : "no"}`);
  report.push(`Pricing status: ${game.metadata?.pricing_status ?? "unknown"}`);
  report.push("");
  report.push("## Decision Gate Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count", "Coverage"],
    [
      ["Riftbound cards", cards.length, "100.0%"],
      ["Cards with Riftcodex durable key", cardsWithRiftcodexKey.length, pct(cardsWithRiftcodexKey.length, cards.length)],
      ["Cards with TCGplayer product ID", cardsWithTcgplayerProduct.length, pct(cardsWithTcgplayerProduct.length, cards.length)],
      ["Cards with TCGplayer ID in payload", cardsWithPayloadTcgplayer.length, pct(cardsWithPayloadTcgplayer.length, cards.length)],
      ["Cards with Cardmarket card ID", cardsWithCardmarketId.length, pct(cardsWithCardmarketId.length, cards.length)],
      ["TCGplayer duplicate product IDs", tcgplayerDuplicateProducts.length, "must be 0"],
      ["Riftcodex duplicate card keys", riftcodexDuplicateKeys.length, "must be 0"],
      ["Price provider mappings", priceMappings.length, "manual review"],
    ]
  ));
  report.push("");
  report.push("## Provider Readiness");
  report.push("");
  report.push(mdTable(["Provider", "Current Join Data", "Status", "Reason"], providerReadiness));
  report.push("");
  report.push("## Join Coverage By Set");
  report.push("");
  report.push(mdTable(["Set", "Name", "Cards", "TCGplayer Product IDs", "TCGplayer Set ID", "Cardmarket Set ID"], setRows));
  report.push("");
  report.push("## Join Coverage By Variant");
  report.push("");
  report.push(mdTable(["Variant", "Cards", "TCGplayer Product IDs"], variantRows));
  report.push("");
  report.push("## Active Price Provider Mappings");
  report.push("");
  report.push(mdTable(
    ["Provider", "Source Game", "Active", "Capabilities", "Key Rules", "Metadata"],
    priceMappings.map((mapping) => [
      mapping.provider,
      mapping.source_game_slug,
      mapping.is_active ? "yes" : "no",
      JSON.stringify(mapping.pricing_capabilities ?? {}),
      JSON.stringify(mapping.product_key_rules ?? {}),
      JSON.stringify(mapping.metadata ?? {}),
    ])
  ));
  report.push("");
  report.push("## Required Before Enabling Pricing");
  report.push("");
  report.push("- Keep `games.metadata.pricing_status = deferred` until credentialed provider fixture checks pass.");
  report.push("- Add provider-specific card IDs to `card_external_ids` before relying on any source without a direct TCGplayer product join.");
  report.push("- Do not write Riftbound prices into `price_stats` until condition, variant, currency, and provider semantics are collapsed intentionally.");
  report.push("- If using TCGplayer directly, resolve product IDs to SKU/condition IDs before requesting market prices.");
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Riftbound cards=${cards.length}`);
  console.log(`TCGplayer product IDs=${cardsWithTcgplayerProduct.length}`);
  console.log(`Cardmarket card IDs=${cardsWithCardmarketId.length}`);
  console.log(`Provider mappings=${priceMappings.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
