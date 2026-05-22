#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const USAGE = `Usage:
  npm run riftbound:audit -- --fixture path/to/riftcodex-cards.json

Optional flags:
  --previous path/to/previous-cards.json   Compare image URLs against a previous fixture.
  --prices path/to/prices.json             Report cards without a matching price record.
  --expect-cards 298                       Fail when the card count differs.
  --expect-sets 6                          Fail when the set count differs.
  --json                                   Print machine-readable JSON only.
`;

function parseArgs(argv) {
  const args = { positional: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token.startsWith("--")) {
      const [rawKey, inlineValue] = token.slice(2).split("=", 2);
      const value = inlineValue ?? argv[index + 1];

      if (inlineValue === undefined) {
        index += 1;
      }

      args[rawKey] = value;
    } else {
      args.positional.push(token);
    }
  }

  return args;
}

async function readJson(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const body = await readFile(resolved, "utf8");

  try {
    return { filePath: resolved, value: JSON.parse(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse JSON fixture at ${resolved}: ${message}`);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isCardLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("riftbound_id" in value || "collector_number" in value || "tcgplayer_id" in value)
  );
}

function isSetLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !isCardLike(value) &&
      ("set_id" in value || "card_count" in value || "code" in value)
  );
}

function extractRecords(payload) {
  if (Array.isArray(payload)) {
    return {
      cards: payload.filter(isCardLike),
      sets: payload.filter(isSetLike),
      envelope: null,
    };
  }

  if (!payload || typeof payload !== "object") {
    return { cards: [], sets: [], envelope: null };
  }

  if (isCardLike(payload)) {
    return { cards: [payload], sets: [], envelope: null };
  }

  const candidates = [
    ...asArray(payload.cards),
    ...asArray(payload.card_items),
    ...asArray(payload.items),
    ...asArray(payload.data),
  ];

  return {
    cards: candidates.filter(isCardLike),
    sets: [...asArray(payload.sets), ...asArray(payload.items)].filter(isSetLike),
    envelope: payload,
  };
}

function getSetId(card) {
  return (
    card?.set?.set_id ??
    card?.set?.id ??
    card?.set_id ??
    card?.set?.code ??
    "unknown-set"
  );
}

function parseRiftboundId(riftboundId) {
  if (typeof riftboundId !== "string") {
    return null;
  }

  const match = riftboundId.trim().toLowerCase().match(/^([a-z0-9]+)-(\d+)([a-z])?(\*)?-(\d+)$/);
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

function includesMarker(value, marker) {
  return typeof value === "string" && value.toLowerCase().includes(marker.toLowerCase());
}

function deriveVariantSignature(card) {
  const metadata = card?.metadata && typeof card.metadata === "object" ? card.metadata : {};
  const parsed = parseRiftboundId(card?.riftbound_id);
  const name = card?.name ?? "";
  const rarity = card?.classification?.rarity ?? "";
  const setId = String(getSetId(card)).toUpperCase();
  const flags = [];

  if (
    metadata.alternate_art === true ||
    parsed?.alphaSuffix ||
    includesMarker(name, "(Alternate Art)")
  ) {
    flags.push("alternate_art");
  }

  if (
    metadata.overnumbered === true ||
    (parsed && parsed.number > parsed.setSize) ||
    includesMarker(name, "(Overnumbered)")
  ) {
    flags.push("overnumbered");
  }

  if (
    metadata.signature === true ||
    parsed?.signatureMarker ||
    includesMarker(name, "(Signature)")
  ) {
    flags.push("signature");
  }

  if (["PR", "OPP", "JDG"].includes(setId) || String(rarity).toLowerCase() === "promo") {
    flags.push("promo");
  }

  return flags.length > 0 ? flags.join("+") : "normal";
}

function pushFinding(findings, level, code, message, details = {}) {
  findings[level].push({ code, message, ...details });
}

function increment(map, key, value) {
  if (!key) {
    return;
  }

  const existing = map.get(key) ?? [];
  existing.push(value);
  map.set(key, existing);
}

function normalizePriceKeys(payload) {
  const records = Array.isArray(payload)
    ? payload
    : [
        ...asArray(payload?.prices),
        ...asArray(payload?.items),
        ...asArray(payload?.data),
      ];

  const keys = new Set();
  for (const price of records) {
    for (const key of [price?.riftbound_id, price?.tcgplayer_id, price?.card_id, price?.external_id]) {
      if (key !== undefined && key !== null && String(key).trim()) {
        keys.add(String(key));
      }
    }
  }

  return keys;
}

function extractRunSummary(payload) {
  const candidates = [payload?.summary, payload?.sync, payload?.result, payload?.run].filter(Boolean);

  for (const candidate of candidates) {
    const keys = ["created", "updated", "skipped", "failed"];
    if (keys.some((key) => Number.isFinite(candidate?.[key]))) {
      return Object.fromEntries(keys.map((key) => [key, Number(candidate[key] ?? 0)]));
    }
  }

  return null;
}

function compareExpectedCount(findings, label, actual, expected) {
  if (expected === undefined || expected === null) {
    return;
  }

  const parsed = Number.parseInt(String(expected), 10);
  if (!Number.isFinite(parsed)) {
    pushFinding(findings, "errors", `invalid_expected_${label}`, `Expected ${label} count is not a number.`, {
      expected,
    });
    return;
  }

  if (actual !== parsed) {
    pushFinding(findings, "errors", `${label}_count_mismatch`, `Expected ${parsed} ${label}, found ${actual}.`, {
      expected: parsed,
      actual,
    });
  }
}

function auditCards(cards, previousCards, priceKeys, findings) {
  const riftboundIds = new Map();
  const cardNumberKeys = new Map();
  const imageById = new Map(previousCards.map((card) => [card.riftbound_id, card?.media?.image_url]));

  for (const card of cards) {
    const riftboundId = card?.riftbound_id;
    const variantSignature = deriveVariantSignature(card);
    const setId = getSetId(card);
    const cardNumberKey = `${setId}:${card?.collector_number ?? "unknown-number"}:${variantSignature}`;
    const parsed = parseRiftboundId(riftboundId);

    if (!riftboundId) {
      pushFinding(findings, "errors", "missing_riftbound_id", "Card is missing riftbound_id.", {
        name: card?.name,
        collector_number: card?.collector_number,
      });
    }

    for (const requiredField of ["name", "collector_number", "classification", "set", "media", "metadata"]) {
      if (!(requiredField in card)) {
        pushFinding(findings, "errors", "source_shape_drift", `Card ${riftboundId ?? card?.name ?? "unknown"} is missing ${requiredField}.`, {
          riftbound_id: riftboundId,
          field: requiredField,
        });
      }
    }

    if (!card?.media?.image_url) {
      pushFinding(findings, "warnings", "missing_image_url", "Card is missing media.image_url.", {
        riftbound_id: riftboundId,
        name: card?.name,
      });
    }

    if (!card?.media?.accessibility_text) {
      pushFinding(findings, "warnings", "missing_image_alt_text", "Card is missing media.accessibility_text.", {
        riftbound_id: riftboundId,
        name: card?.name,
      });
    }

    if (parsed && parsed.number > parsed.setSize && card?.metadata?.overnumbered !== true) {
      pushFinding(findings, "warnings", "overnumbered_not_flagged", "Collector number exceeds set size but metadata.overnumbered is not true.", {
        riftbound_id: riftboundId,
        collector_number: card?.collector_number,
      });
    }

    if (card?.metadata?.alternate_art === true && !variantSignature.includes("alternate_art")) {
      pushFinding(findings, "errors", "alternate_art_signature_mismatch", "metadata.alternate_art is true but the derived signature is not alternate_art.", {
        riftbound_id: riftboundId,
        variantSignature,
      });
    }

    if (variantSignature.split("+").length > 2) {
      pushFinding(findings, "warnings", "variant_flag_conflict", "Card has an unusually broad variant signature.", {
        riftbound_id: riftboundId,
        variantSignature,
      });
    }

    const previousImage = imageById.get(riftboundId);
    const nextImage = card?.media?.image_url;
    if (previousImage && nextImage && previousImage !== nextImage) {
      pushFinding(findings, "warnings", "image_url_changed", "Image URL changed for an existing riftbound_id.", {
        riftbound_id: riftboundId,
        previous: previousImage,
        next: nextImage,
      });
    }

    if (priceKeys && !priceKeys.has(String(riftboundId)) && !priceKeys.has(String(card?.tcgplayer_id))) {
      pushFinding(findings, "warnings", "unmatched_price", "No price record matched this card by riftbound_id or tcgplayer_id.", {
        riftbound_id: riftboundId,
        tcgplayer_id: card?.tcgplayer_id,
      });
    }

    increment(riftboundIds, riftboundId, card);
    increment(cardNumberKeys, cardNumberKey, card);
  }

  for (const [riftboundId, duplicates] of riftboundIds) {
    if (duplicates.length > 1) {
      pushFinding(findings, "errors", "duplicate_riftbound_id", "Duplicate riftbound_id found in provider payload.", {
        riftbound_id: riftboundId,
        count: duplicates.length,
      });
    }
  }

  for (const [cardNumberKey, duplicates] of cardNumberKeys) {
    if (duplicates.length > 1) {
      pushFinding(findings, "errors", "duplicate_card_number_variant", "Duplicate set/card-number/variant signature found.", {
        key: cardNumberKey,
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

  const fixturePath = args.fixture ?? args.positional[0] ?? process.env.RIFTBOUND_AUDIT_FIXTURE;
  if (!fixturePath) {
    console.error(USAGE);
    process.exit(2);
  }

  const { filePath, value: payload } = await readJson(fixturePath);
  const { cards, sets, envelope } = extractRecords(payload);
  const previousCards = args.previous ? extractRecords((await readJson(args.previous)).value).cards : [];
  const priceKeys = args.prices ? normalizePriceKeys((await readJson(args.prices)).value) : null;
  const findings = { errors: [], warnings: [], info: [] };

  if (cards.length === 0 && sets.length === 0) {
    pushFinding(findings, "errors", "empty_or_unknown_fixture", "Fixture did not contain recognizable Riftbound cards or sets.");
  }

  if (envelope?.total !== undefined && cards.length > 0 && Number(envelope.total) !== cards.length) {
    const message = envelope.pages && Number(envelope.pages) > 1
      ? "Fixture appears to be a paginated card response; collected items do not equal source total."
      : "Card item count does not equal source total.";
    pushFinding(findings, "warnings", "source_total_mismatch", message, {
      sourceTotal: Number(envelope.total),
      itemCount: cards.length,
      page: envelope.page,
      pages: envelope.pages,
    });
  }

  compareExpectedCount(findings, "cards", cards.length, args["expect-cards"]);
  compareExpectedCount(findings, "sets", sets.length, args["expect-sets"]);
  auditCards(cards, previousCards, priceKeys, findings);

  const runSummary = extractRunSummary(payload);
  if (!runSummary) {
    pushFinding(findings, "info", "missing_run_summary", "No created/updated/skipped/failed run summary was present in the fixture.");
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
    runSummary,
    findings,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Riftbound audit: ${cards.length} cards, ${sets.length} sets`);
    console.log(`Errors: ${findings.errors.length}; warnings: ${findings.warnings.length}; info: ${findings.info.length}`);
    console.log(JSON.stringify(report, null, 2));
  }

  if (findings.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
