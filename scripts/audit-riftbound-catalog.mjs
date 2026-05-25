import fs from "node:fs";

const REPORT_PATH = readArg("--report") ?? "riftbound-catalog-audit.md";
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

function mdTable(headers, rows) {
  const out = [];
  out.push(`| ${headers.join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return out.join("\n");
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
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
}

async function main() {
  const games = await sbFetchAll(`games?select=id,slug,name,is_active,is_public,metadata&slug=eq.${GAME_SLUG}`, 1);
  const game = games[0];
  if (!game?.id) throw new Error("Riftbound game row is missing");

  const gameFilter = `game_id=eq.${encodeURIComponent(game.id)}`;
  const [sets, cards, rarities, variants, setTypes, sourceRecords, setExternalIds, cardExternalIds, priceMappings] = await Promise.all([
    sbFetchAll(`sets?select=id,slug,code,name,card_count,set_type_id&${gameFilter}`),
    sbFetchAll(`cards?select=id,card_image_id,card_number,name,rarity,rarity_id,variant_id,set_id,image_url,game_payload&${gameFilter}`),
    sbFetchAll(`game_rarities?select=id,code,name&${gameFilter}`),
    sbFetchAll(`game_variants?select=id,code,name&${gameFilter}`),
    sbFetchAll(`game_set_types?select=id,code,name&${gameFilter}`),
    sbFetchAll(`tcg_source_records?select=id,provider,record_type,external_id,parent_external_id&${gameFilter}`),
    sbFetchAll(`set_external_ids?select=id,provider,external_type,external_id,set_id&${gameFilter}`),
    sbFetchAll(`card_external_ids?select=id,provider,external_type,external_id,card_id&${gameFilter}`),
    sbFetchAll(`price_provider_mappings?select=id,provider,source_game_slug,is_active,pricing_capabilities&${gameFilter}`),
  ]);

  const missing = {
    cardGameId: 0,
    cardPayload: cards.filter((card) => !card.game_payload || Object.keys(card.game_payload).length === 0).length,
    cardSetId: cards.filter((card) => !card.set_id).length,
    cardRarityId: cards.filter((card) => !card.rarity_id).length,
    cardVariantId: cards.filter((card) => !card.variant_id).length,
    setTypeId: sets.filter((set) => !set.set_type_id).length,
    imageUrls: cards.filter((card) => card.image_url).length,
  };

  const report = [];
  report.push("# Riftbound Catalog Audit");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push(`Game: ${game.name} (${game.id})`);
  report.push(`Public: ${game.is_public ? "yes" : "no"}`);
  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(mdTable(
    ["Metric", "Count"],
    [
      ["Sets", sets.length],
      ["Cards", cards.length],
      ["Rarities", rarities.length],
      ["Variants", variants.length],
      ["Set types", setTypes.length],
      ["Raw source records", sourceRecords.length],
      ["Set external IDs", setExternalIds.length],
      ["Card external IDs", cardExternalIds.length],
      ["Price mappings", priceMappings.length],
      ["Cards missing game_payload", missing.cardPayload],
      ["Cards missing set_id", missing.cardSetId],
      ["Cards missing rarity_id", missing.cardRarityId],
      ["Cards missing variant_id", missing.cardVariantId],
      ["Sets missing set_type_id", missing.setTypeId],
      ["Cards with image_url", missing.imageUrls],
      ["Duplicate card_image_id keys", duplicateKeys(cards, (card) => card.card_image_id).length],
      ["Duplicate set slugs", duplicateKeys(sets, (set) => set.slug).length],
    ]
  ));
  report.push("");
  report.push("## Sets");
  report.push("");
  report.push(mdTable(
    ["Code", "Name", "Cards"],
    sets
      .slice()
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((set) => [set.code, set.name, set.card_count])
  ));
  report.push("");
  report.push("## Source Records By Type");
  report.push("");
  report.push(mdTable(["Type", "Count"], countBy(sourceRecords, (row) => row.record_type)));
  report.push("");
  report.push("## Card External IDs By Provider/Type");
  report.push("");
  report.push(mdTable(
    ["Provider / Type", "Count"],
    countBy(cardExternalIds, (row) => `${row.provider}:${row.external_type}`)
  ));
  report.push("");
  report.push("## Set External IDs By Provider/Type");
  report.push("");
  report.push(mdTable(
    ["Provider / Type", "Count"],
    countBy(setExternalIds, (row) => `${row.provider}:${row.external_type}`)
  ));
  report.push("");
  report.push("## Price Mappings");
  report.push("");
  report.push(mdTable(
    ["Provider", "Source Game", "Active", "Capabilities"],
    priceMappings.map((mapping) => [
      mapping.provider,
      mapping.source_game_slug,
      mapping.is_active ? "yes" : "no",
      JSON.stringify(mapping.pricing_capabilities ?? {}),
    ])
  ));
  report.push("");

  fs.writeFileSync(REPORT_PATH, `${report.join("\n")}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Riftbound sets=${sets.length} cards=${cards.length} raw=${sourceRecords.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
