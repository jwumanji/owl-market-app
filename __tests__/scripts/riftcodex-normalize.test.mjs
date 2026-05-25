import assert from "node:assert/strict";
import test from "node:test";

import {
  cardExternalIdRows,
  cardImageId,
  externalCardId,
  normalizeRiftcodexCard,
  normalizeRiftcodexSet,
  publicCardNumber,
  rawSourceRecord,
  setExternalIdRows,
  setTypeCode,
  validateNormalizedCard,
  validateNormalizedSet,
  variantCode,
  variantLabel,
  variantSignature,
} from "../../scripts/tcg/riftcodex-normalize.mjs";

const baseCard = {
  id: "69bc5bc7d308c64675ca86c1",
  name: "Magma Wurm",
  riftbound_id: "ogn-011-298",
  tcgplayer_id: "652782",
  collector_number: 11,
  attributes: { energy: 8, might: 8, power: 1 },
  classification: { type: "Unit", supertype: null, rarity: "Common", domain: ["Fury"] },
  text: { plain: "Other friendly units enter ready." },
  set: { set_id: "OGN", label: "Origins" },
  media: {
    image_url: "https://example.test/magma.png",
    artist: "Envar Studio",
    accessibility_text: "Riftbound Unit: Magma Wurm.",
  },
  tags: ["Freljord"],
  metadata: {
    clean_name: "Magma Wurm",
    updated_on: "2026-03-20T03:25:43.245489+07:00",
    alternate_art: false,
    overnumbered: false,
    signature: false,
  },
};

test("normalizes Riftcodex set rows into existing sets columns", () => {
  const normalized = normalizeRiftcodexSet({
    id: "69bc5bf6e195be3e561d1eb1",
    name: "Origins",
    set_id: "OGN",
    card_count: 352,
    tcgplayer_id: "24344",
    cardmarket_id: "6286",
    published_on: "2025-10-31T00:00:00",
  }, {
    gameId: "game-uuid",
    setTypeIdByCode: new Map([["MAIN_SET", "set-type-uuid"]]),
  });

  assert.equal(normalized.externalSetId, "OGN");
  assert.equal(normalized.providerSetId, "69bc5bf6e195be3e561d1eb1");
  assert.equal(normalized.tcgplayerId, "24344");
  assert.equal(normalized.slug, "riftbound-ogn");
  assert.equal(normalized.setTypeCode, "MAIN_SET");
  assert.equal(normalized.dbRow.game_id, "game-uuid");
  assert.equal(normalized.dbRow.name, "Origins");
  assert.equal(normalized.dbRow.series, "Riftbound");
  assert.equal(normalized.dbRow.year, 2025);
  assert.equal(normalized.dbRow.set_type_id, "set-type-uuid");
  assert.deepEqual(validateNormalizedSet(normalized), []);
});

test("maps Riftbound set codes into set type taxonomy codes", () => {
  assert.equal(setTypeCode({ set_id: "OGN" }), "MAIN_SET");
  assert.equal(setTypeCode({ set_id: "SFD" }), "MAIN_SET");
  assert.equal(setTypeCode({ set_id: "UNL" }), "MAIN_SET");
  assert.equal(setTypeCode({ set_id: "OGS" }), "PROVING_GROUNDS");
  assert.equal(setTypeCode({ set_id: "OPP" }), "ORGANIZED_PLAY_PROMO");
  assert.equal(setTypeCode({ set_id: "PR" }), "PROMO");
  assert.equal(setTypeCode({ set_id: "JDG" }), "JUDGE_PROMO");
});

test("uses riftbound_id as stable card identity and suppresses images by default", () => {
  const normalized = normalizeRiftcodexCard(baseCard, {
    gameId: "game-uuid",
    setIdByExternalId: new Map([["OGN", "set-uuid"]]),
    rarityIdByCode: new Map([["COMMON", "rarity-uuid"]]),
    variantIdByCode: new Map([["BASE", "variant-uuid"]]),
  });

  assert.equal(cardImageId(baseCard), "riftbound:ogn-011-298");
  assert.equal(publicCardNumber(baseCard), "OGN-011");
  assert.equal(normalized.externalCardId, "ogn-011-298");
  assert.equal(normalized.providerCardId, "69bc5bc7d308c64675ca86c1");
  assert.equal(normalized.rarityCode, "COMMON");
  assert.equal(normalized.variantCode, "BASE");
  assert.equal(normalized.dbRow.game_id, "game-uuid");
  assert.equal(normalized.dbRow.set_id, "set-uuid");
  assert.equal(normalized.dbRow.rarity_id, "rarity-uuid");
  assert.equal(normalized.dbRow.variant_id, "variant-uuid");
  assert.equal(normalized.dbRow.card_number, "OGN-011");
  assert.equal(normalized.dbRow.variant_label, null);
  assert.equal(normalized.dbRow.image_url, null);
  assert.equal(normalized.dbRow.game_payload.schema, "riftbound.card.v1");
  assert.equal(normalized.dbRow.game_payload.card.energy, 8);
  assert.equal(normalized.dbRow.game_payload.card.might, 8);
  assert.equal(normalized.dbRow.game_payload.card.variant_code, "BASE");
  assert.equal(normalized.dbRow.game_payload.media.image_url, null);
  assert.equal(normalized.dbRow.game_payload.media.image_url_deferred, true);
  assert.deepEqual(normalized.dbRow.color, ["Fury"]);
  assert.deepEqual(normalized.dbRow.types, ["Freljord"]);
  assert.deepEqual(validateNormalizedCard(normalized), []);
});

test("can opt into image URL mapping after asset approval", () => {
  const normalized = normalizeRiftcodexCard(baseCard, { includeImages: true });
  assert.equal(normalized.dbRow.image_url, "https://example.test/magma.png");
});

test("classifies alternate-art, overnumbered, and signature variants", () => {
  const alternateArt = {
    ...baseCard,
    name: "Fury Rune (Alternate Art)",
    riftbound_id: "ogn-007a-298",
    metadata: { ...baseCard.metadata, alternate_art: true },
  };
  const overnumbered = {
    ...baseCard,
    name: "Kai'Sa - Daughter of the Void (Overnumbered)",
    riftbound_id: "ogn-299-298",
    metadata: { ...baseCard.metadata, overnumbered: true },
  };
  const signature = {
    ...baseCard,
    name: "Kai'Sa - Daughter of the Void (Signature)",
    riftbound_id: "ogn-299*-298",
    metadata: { ...baseCard.metadata, signature: true },
  };

  assert.equal(variantSignature(alternateArt), "alternate-art");
  assert.equal(variantCode(alternateArt), "ALTERNATE_ART");
  assert.equal(variantLabel(alternateArt), "Alternate Art");
  assert.equal(publicCardNumber(alternateArt), "OGN-007a");
  assert.equal(variantSignature(overnumbered), "overnumbered");
  assert.equal(variantCode(overnumbered), "OVERNUMBERED");
  assert.equal(variantLabel(overnumbered), "Overnumbered");
  assert.equal(variantSignature(signature), "signature");
  assert.equal(variantCode(signature), "SIGNATURE");
  assert.equal(variantLabel(signature), "Signature");
  assert.equal(publicCardNumber(signature), "OGN-299*");
});

test("uses a deterministic metal suffix for duplicate Riftcodex promo printings", () => {
  const metal = {
    ...baseCard,
    name: "Annie - Dark Child (Metal)",
    riftbound_id: "opp-017-024",
    tcgplayer_id: "669265",
    set: { set_id: "OPP", label: "Riftbound Organized Play Promotional Cards" },
    collector_number: 17,
  };
  const standard = {
    ...metal,
    name: "Annie - Dark Child",
    tcgplayer_id: "680247",
  };

  assert.equal(variantSignature(metal), "metal");
  assert.equal(variantCode(metal), "METAL");
  assert.equal(variantLabel(metal), "Metal");
  assert.equal(externalCardId(metal), "opp-017-024:metal");
  assert.equal(cardImageId(metal), "riftbound:opp-017-024:metal");
  assert.equal(externalCardId(standard), "opp-017-024");
  assert.equal(cardImageId(standard), "riftbound:opp-017-024");
});

test("builds raw source records with explicit game and provider scope", () => {
  const record = rawSourceRecord({
    gameId: "game-uuid",
    recordType: "card",
    externalId: "ogn-011-298",
    parentExternalId: "OGN",
    sourceUpdatedAt: baseCard.metadata.updated_on,
    payload: baseCard,
    hash: "a".repeat(64),
  });

  assert.equal(record.game_id, "game-uuid");
  assert.equal(record.provider, "riftcodex");
  assert.equal(record.record_type, "card");
  assert.equal(record.external_id, "ogn-011-298");
  assert.equal(record.parent_external_id, "OGN");
  assert.equal(record.payload_hash, "a".repeat(64));
});

test("builds game-scoped external ID rows for sets and cards", () => {
  const normalizedSet = normalizeRiftcodexSet({
    id: "69bc5bf6e195be3e561d1eb1",
    name: "Origins",
    set_id: "OGN",
    card_count: 352,
    tcgplayer_id: "24344",
    cardmarket_id: "6286",
    published_on: "2025-10-31T00:00:00",
  });
  const setRows = setExternalIdRows(normalizedSet, { gameId: "game-uuid", setId: "set-uuid" });

  assert.deepEqual(
    setRows.map((row) => `${row.provider}:${row.external_type}:${row.external_id}`),
    [
      "riftcodex:set_code:OGN",
      "riftcodex:source_id:69bc5bf6e195be3e561d1eb1",
      "tcgplayer:set_id:24344",
      "cardmarket:set_id:6286",
    ]
  );

  const normalizedCard = normalizeRiftcodexCard(baseCard);
  const cardRows = cardExternalIdRows(normalizedCard, { gameId: "game-uuid", cardId: "card-uuid" });

  assert.deepEqual(
    cardRows.map((row) => `${row.provider}:${row.external_type}:${row.external_id}`),
    [
      "riftcodex:card_key:ogn-011-298",
      "riftcodex:source_id:69bc5bc7d308c64675ca86c1",
      "tcgplayer:product_id:652782",
    ]
  );
});

test("numbers additional Cardmarket set IDs to satisfy provider type uniqueness", () => {
  const normalizedSet = normalizeRiftcodexSet({
    id: "set-source-id",
    name: "Promo Set",
    set_id: "PR",
    card_count: 12,
    cardmarket_id: ["7001", "7002"],
  });

  const rows = setExternalIdRows(normalizedSet, { gameId: "game-uuid", setId: "set-uuid" });
  assert.deepEqual(
    rows
      .filter((row) => row.provider === "cardmarket")
      .map((row) => `${row.external_type}:${row.external_id}`),
    ["set_id:7001", "set_id_2:7002"]
  );
});
