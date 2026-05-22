#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const USAGE = `Usage:
  npm run riftbound:audit -- --fixture path/to/riftcodex-cards.json

Options:
  --previous path/to/previous-cards.json   Report image URL changes by riftbound_id.
  --prices path/to/prices.json             Report cards without a matching price record.
  --expect-cards 298                       Fail when the card count differs.
  --expect-sets 6                          Fail when the set count differs.
  --json                                   Print JSON without the human summary.
`;

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      args[key] = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }
    } else {
      args._.push(token);
    }
  }

  return args;
}

async function readJson(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const body = await readFile(resolvedPath, "utf8");

  try {
    return { filePath: resolvedPath, payload: JSON.parse(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse JSON at ${resolvedPath}: ${message}`);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isCard(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("riftbound_id" in value || "collector_number" in value || "tcgplayer_id" in value)
  );
}

function isSet(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !isCard(value) &&
      ("set_id" in value || "card_count" in value || "code" in value)
  );
}

function extractRecords(payload) {
  if (Array.isArray(payload)) {
    return { cards: payload.filter(isCard), sets: payload.filter(isSet), envelope: null };
  }

  if (!payload || typeof payload !== "object") {
    return { cards: [], sets: [], envelope: null };
  }

  if (isCard(payload)) {
    return { cards: [payload], sets: [], envelope: null };
  }

  const sharedItems = toArray(payload.items);
  const cards = [
    ...toArray(payload.cards),
    ...toArray(payload.card_items),
    ...sharedItems,
    ...toArray(payload.data),
  ].filter(isCard);
  const sets = [...toArray(payload.sets), ...sharedItems].filter(isSet);

  return { cards, sets, envelope: payload };
}

function addFinding(findings, severity, code, message, details = {}) {
  findings[severity].push({ code, message, ...details });
}

function groupBy(records, buildKey) {
  const groups = new Map();

  for (const record of records) {
    const key = buildKey(record);
    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return groups;
}

function parseRiftboundId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().toLowerCase().match(/^([a-z0-9]+)-(\d+)([a-z])?(\*)?-(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    setCode: match[1],
    number: Number.parseInt(match[2], 10),
    alphaSuffix: match[3] ?? null,
    signatureMarker: Boolean(match[4]),
    setSize: Number.parseInt(match[5], 10),
  };
}

function marker(value, text) {
  return typeof value === "string" && value.toLowerCase().includes(text.toLowerCase());
}

function setId(card) {
  return card?.set?.set_id ?? card?.set?.id ?? card?.set_id ?? card?.set?.code ?? "unknown-set";
}

function variantSignature(card) {
  const metadata = card?.metadata && typeof card.metadata === "object" ? card.metadata : {};
  const parsed = parseRiftboundId(card?.riftbound_id);
  const name = card?.name ?? "";
  const rarity = card?.classification?.rarity ?? "";
  const setCode = String(setId(card)).toUpperCase();
  const flags = [];

  if (metadata.alternate_art === true || parsed?.alphaSuffix || marker(name, "(Alternate Art)")) {
    flags.push("alternate_art");
  }

  if (metadata.overnumbered === true || (parsed && parsed.number > parsed.setSize) || marker(name, "(Overnumbered)")) {
    flags.push("overnumbered");
  }

  if (metadata.signature === true || parsed?.signatureMarker || marker(name, "(Signature)")) {
    flags.push("signature");
  }

  if (["PR", "OPP", "JDG"].includes(setCode) || String(rarity).toLowerCase() === "promo") {
    flags.push("promo");
  }

  return flags.length ? flags.join("+") : "normal";
}

function normalizePriceKeys(payload) {
  const prices = Array.isArray(payload)
    ? payload
    : [...toArray(payload?.prices), ...toArray(payload?.items), ...toArray(payload?.data)];
  const keys = new Set();

  for (const price of prices) {
    for (const candidate of [price?.riftbound_id, price?.tcgplayer_id, price?.card_id, price?.external_id]) {
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        keys.add(String(candidate));
      }
    }
  }

  return keys;
}

function runSummary(payload) {
  for (const candidate of [payload?.summary, payload?.sync, payload?.result, payload?.run].filter(Boolean)) {
    const keys = ["created", "updated", "skipped", "failed"];
    if (keys.some((key) => Number.isFinite(candidate?.[key]))) {
      return Object.fromEntries(keys.map((key) => [key, Number(candidate[key] ?? 0)]));
    }
  }

  return null;
}

function compareExpected(findings, label, actual, expected) {
  if (expected === undefined) {
    return;
  }

  const parsed = Number.parseInt(String(expected), 10);
  if (!Number.isFinite(parsed)) {
    addFinding(findings, "errors", `invalid_expected_${label}`, `Expected ${label} value is not numeric.`, { expected });
  } else if (actual !== parsed) {
    addFinding(findings, "errors", `${label}_count_mismatch`, `Expected ${parsed} ${label}, found ${actual}.`, {
      expected: parsed,
      actual,
    });
  }
}

function auditCards(cards, previousCards, priceKeys, findings) {
  const previousImageById = new Map(previousCards.map((card) => [card.riftbound_id, card?.media?.image_url]));

  for (const card of cards) {
    const id = card?.riftbound_id;
    const parsed = parseRiftboundId(id);
    const signature = variantSignature(card);

    if (!id) {
      addFinding(findings, "errors", "missing_riftbound_id", "Card is missing riftbound_id.", {
        name: card?.name,
        collector_number: card?.collector_number,
      });
    }

    for (const field of ["name", "collector_number", "classification", "set", "media", "metadata"]) {
      if (!(field in card)) {
        addFinding(findings, "errors", "source_shape_drift", `Card ${id ?? card?.name ?? "unknown"} is missing ${field}.`, {
          riftbound_id: id,
          field,
        });
      }
    }

    if (!card?.media?.image_url) {
      addFinding(findings, "warnings", "missing_image_url", "Card is missing media.image_url.", {
        riftbound_id: id,
        name: card?.name,
      });
    }

    if (!card?.media?.accessibility_text) {
      addFinding(findings, "warnings", "missing_image_alt_text", "Card is missing media.accessibility_text.", {
        riftbound_id: id,
        name: card?.name,
      });
    }

    if (parsed && parsed.number > parsed.setSize && card?.metadata?.overnumbered !== true) {
      addFinding(findings, "warnings", "overnumbered_not_flagged", "Collector number exceeds encoded set size but metadata.overnumbered is not true.", {
        riftbound_id: id,
      });
    }

    if (card?.metadata?.alternate_art === true && !signature.includes("alternate_art")) {
      addFinding(findings, "errors", "alternate_art_signature_mismatch", "metadata.alternate_art is true but derived signature is not alternate_art.", {
        riftbound_id: id,
        signature,
      });
    }

    if (signature.split("+").length > 2) {
      addFinding(findings, "warnings", "variant_flag_conflict", "Card has more than two variant flags.", {
        riftbound_id: id,
        signature,
      });
    }

    const previousImage = previousImageById.get(id);
    const currentImage = card?.media?.image_url;
    if (previousImage && currentImage && previousImage !== currentImage) {
      addFinding(findings, "warnings", "image_url_changed", "Image URL changed for an existing riftbound_id.", {
        riftbound_id: id,
        previous: previousImage,
        current: currentImage,
      });
    }

    if (priceKeys && !priceKeys.has(String(id)) && !priceKeys.has(String(card?.tcgplayer_id))) {
      addFinding(findings, "warnings", "unmatched_price", "No price record matched by riftbound_id or tcgplayer_id.", {
        riftbound_id: id,
        tcgplayer_id: card?.tcgplayer_id,
      });
    }
  }

  for (const [id, duplicates] of groupBy(cards, (card) => card.riftbound_id)) {
    if (duplicates.length > 1) {
      addFinding(findings, "errors", "duplicate_riftbound_id", "Duplicate riftbound_id found in provider payload.", {
        riftbound_id: id,
        count: duplicates.length,
      });
    }
  }

  for (const [key, duplicates] of groupBy(cards, (card) => `${setId(card)}:${card?.collector_number ?? "unknown-number"}:${variantSignature(card)}`)) {
    if (duplicates.length > 1) {
      addFinding(findings, "errors", "duplicate_card_number_variant", "Duplicate set/card-number/variant signature found.", {
        key,
        count: duplicates.length,
        riftbound_ids: duplicates.map((card) => card.riftbound_id),
      });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const fixturePath = args.fixture ?? args._[0] ?? process.env.RIFTBOUND_AUDIT_FIXTURE;
  if (!fixturePath) {
    console.error(USAGE);
    process.exit(2);
  }

  const { filePath, payload } = await readJson(fixturePath);
  const { cards, sets, envelope } = extractRecords(payload);
  const previousCards = args.previous ? extractRecords((await readJson(args.previous)).payload).cards : [];
  const priceKeys = args.prices ? normalizePriceKeys((await readJson(args.prices)).payload) : null;
  const findings = { errors: [], warnings: [], info: [] };

  if (!cards.length && !sets.length) {
    addFinding(findings, "errors", "empty_or_unknown_fixture", "Fixture did not contain recognizable Riftbound cards or sets.");
  }

  if (envelope?.total !== undefined && cards.length && Number(envelope.total) !== cards.length) {
    addFinding(findings, "warnings", "source_total_mismatch", "Collected card count does not equal the source envelope total.", {
      sourceTotal: Number(envelope.total),
      cardCount: cards.length,
      page: envelope.page ?? null,
      pages: envelope.pages ?? null,
    });
  }

  compareExpected(findings, "cards", cards.length, args["expect-cards"]);
  compareExpected(findings, "sets", sets.length, args["expect-sets"]);
  auditCards(cards, previousCards, priceKeys, findings);

  const summary = runSummary(payload);
  if (!summary) {
    addFinding(findings, "info", "missing_run_summary", "No created/updated/skipped/failed run summary was present.");
  }

  const report = {
    checkedAt: new Date().toISOString(),
    sourceFile: filePath,
    totals: {
      cards: cards.length,
      sets: sets.length,
      sourceTotal: envelope?.total ?? null,
      page: envelope?.page ?? null,
      pages: envelope?.pages ?? null,
      prices: priceKeys?.size ?? null,
    },
    runSummary: summary,
    findings,
  };

  if (!args.json) {
    console.log(`Riftbound audit: ${cards.length} cards, ${sets.length} sets`);
    console.log(`Errors: ${findings.errors.length}; warnings: ${findings.warnings.length}; info: ${findings.info.length}`);
  }

  console.log(JSON.stringify(report, null, 2));

  if (findings.errors.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
