export const RIFTBOUND_GAME_SLUG = "riftbound";
export const RIFTCODEX_PROVIDER = "riftcodex";
export const RIFTBOUND_CARD_PAYLOAD_SCHEMA = "riftbound.card.v1";

export function nullIfEmpty(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /^null$/i.test(text) || /^n\/?a$/i.test(text)) return null;
  return text;
}

export function toInt(value) {
  const text = nullIfEmpty(value);
  if (!text) return null;
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

export function dateOnly(value) {
  const text = nullIfEmpty(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function yearFromDate(value) {
  const date = dateOnly(value);
  return date ? Number.parseInt(date.slice(0, 4), 10) : null;
}

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function taxonomyCode(value) {
  const text = nullIfEmpty(value);
  if (!text) return null;
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function sourceSetCode(rawSet) {
  return nullIfEmpty(rawSet?.set_id)?.toUpperCase() ?? null;
}

export function setSlug(rawSet) {
  const code = sourceSetCode(rawSet);
  if (!code) return null;
  return `${RIFTBOUND_GAME_SLUG}-${slugify(code)}`;
}

export function setTypeCode(rawSet) {
  const code = sourceSetCode(rawSet);
  if (code === "OPP") return "ORGANIZED_PLAY_PROMO";
  if (code === "PR") return "PROMO";
  if (code === "JDG") return "JUDGE_PROMO";
  if (code === "OGS") return "PROVING_GROUNDS";
  return "MAIN_SET";
}

function textList(value) {
  if (Array.isArray(value)) {
    const items = value.map(nullIfEmpty).filter(Boolean);
    return items.length > 0 ? items : null;
  }
  const item = nullIfEmpty(value);
  return item ? [item] : null;
}

function idForCode(map, code) {
  if (!map || !code) return null;
  return map.get(code) ?? null;
}

export function normalizeRiftcodexSet(rawSet, options = {}) {
  const code = sourceSetCode(rawSet);
  const slug = setSlug(rawSet);
  const name = nullIfEmpty(rawSet?.name);
  const typeCode = setTypeCode(rawSet);

  return {
    gameSlug: RIFTBOUND_GAME_SLUG,
    provider: RIFTCODEX_PROVIDER,
    externalSetId: code,
    providerSetId: nullIfEmpty(rawSet?.id),
    tcgplayerId: nullIfEmpty(rawSet?.tcgplayer_id),
    cardmarketIds: textList(rawSet?.cardmarket_id) ?? [],
    setTypeCode: typeCode,
    slug,
    name,
    releaseDate: dateOnly(rawSet?.published_on),
    dbRow: {
      game_id: options.gameId ?? null,
      slug,
      code,
      name,
      series: "Riftbound",
      year: yearFromDate(rawSet?.published_on),
      release_date: dateOnly(rawSet?.published_on),
      card_count: toInt(rawSet?.card_count) ?? 0,
      color: null,
      tcg_set_id: nullIfEmpty(rawSet?.tcgplayer_id),
      set_type_id: idForCode(options.setTypeIdByCode, typeCode),
    },
  };
}

export function publicCardNumber(rawCard) {
  const riftboundId = nullIfEmpty(rawCard?.riftbound_id);
  if (riftboundId) {
    const parts = riftboundId.split("-");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0].toUpperCase()}-${parts[1]}`;
    }
  }

  const setCode = nullIfEmpty(rawCard?.set?.set_id)?.toUpperCase();
  const collectorNumber = toInt(rawCard?.collector_number);
  if (!setCode || collectorNumber === null) return null;
  return `${setCode}-${String(collectorNumber).padStart(3, "0")}`;
}

export function cardImageId(rawCard) {
  const externalId = externalCardId(rawCard);
  return externalId ? `${RIFTBOUND_GAME_SLUG}:${externalId.toLowerCase()}` : null;
}

function hasAlternateArtSuffix(rawCard) {
  const riftboundId = nullIfEmpty(rawCard?.riftbound_id);
  return Boolean(riftboundId?.match(/-\d+[a-z]-/i));
}

function isMetalPrinting(rawCard) {
  return /\(metal\)/i.test(nullIfEmpty(rawCard?.name) ?? "");
}

export function variantSignature(rawCard) {
  const metadata = rawCard?.metadata ?? {};
  const riftboundId = nullIfEmpty(rawCard?.riftbound_id) ?? "";
  if (isMetalPrinting(rawCard)) return "metal";
  if (metadata.signature === true || riftboundId.includes("*")) return "signature";
  if (metadata.overnumbered === true) return "overnumbered";
  if (metadata.alternate_art === true || hasAlternateArtSuffix(rawCard)) return "alternate-art";
  return "base";
}

export function externalCardId(rawCard) {
  const riftboundId = nullIfEmpty(rawCard?.riftbound_id);
  if (!riftboundId) return null;
  const signature = variantSignature(rawCard);
  return signature === "metal" ? `${riftboundId}:metal` : riftboundId;
}

export function variantLabel(rawCard) {
  const signature = variantSignature(rawCard);
  if (signature === "metal") return "Metal";
  if (signature === "signature") return "Signature";
  if (signature === "overnumbered") return "Overnumbered";
  if (signature === "alternate-art") return "Alternate Art";
  return null;
}

export function variantCode(rawCard) {
  const signature = variantSignature(rawCard);
  if (signature === "metal") return "METAL";
  if (signature === "signature") return "SIGNATURE";
  if (signature === "overnumbered") return "OVERNUMBERED";
  if (signature === "alternate-art") return "ALTERNATE_ART";
  return "BASE";
}

export function rarityCode(rawCard) {
  return taxonomyCode(rawCard?.classification?.rarity);
}

function textArray(value) {
  if (!Array.isArray(value)) return null;
  const items = value.map(nullIfEmpty).filter(Boolean);
  return items.length > 0 ? items : null;
}

export function riftboundGamePayload(rawCard, options = {}) {
  const includeImages = options.includeImages === true;
  const imageUrl = nullIfEmpty(rawCard?.media?.image_url);

  return {
    schema: RIFTBOUND_CARD_PAYLOAD_SCHEMA,
    card: {
      provider_card_id: nullIfEmpty(rawCard?.id),
      riftbound_id: nullIfEmpty(rawCard?.riftbound_id),
      durable_external_id: externalCardId(rawCard),
      collector_number: toInt(rawCard?.collector_number),
      type: nullIfEmpty(rawCard?.classification?.type),
      supertype: nullIfEmpty(rawCard?.classification?.supertype),
      rarity: nullIfEmpty(rawCard?.classification?.rarity),
      rarity_code: rarityCode(rawCard),
      domains: textArray(rawCard?.classification?.domain),
      tags: textArray(rawCard?.tags),
      energy: toInt(rawCard?.attributes?.energy),
      might: toInt(rawCard?.attributes?.might),
      power: toInt(rawCard?.attributes?.power),
      orientation: nullIfEmpty(rawCard?.orientation),
      variant_signature: variantSignature(rawCard),
      variant_code: variantCode(rawCard),
    },
    text: {
      plain: nullIfEmpty(rawCard?.text?.plain),
      rich: nullIfEmpty(rawCard?.text?.rich),
      flavour: nullIfEmpty(rawCard?.text?.flavour),
    },
    media: {
      artist: nullIfEmpty(rawCard?.media?.artist),
      accessibility_text: nullIfEmpty(rawCard?.media?.accessibility_text),
      image_url: includeImages ? imageUrl : null,
      image_url_deferred: Boolean(imageUrl && !includeImages),
    },
    source: {
      provider: RIFTCODEX_PROVIDER,
      updated_on: nullIfEmpty(rawCard?.metadata?.updated_on),
      tcgplayer_id: nullIfEmpty(rawCard?.tcgplayer_id),
      alternate_art: rawCard?.metadata?.alternate_art === true,
      overnumbered: rawCard?.metadata?.overnumbered === true,
      signature: rawCard?.metadata?.signature === true,
    },
  };
}

export function normalizeRiftcodexCard(rawCard, options = {}) {
  const includeImages = options.includeImages === true;
  const setIdByExternalId = options.setIdByExternalId ?? new Map();
  const externalSetId = nullIfEmpty(rawCard?.set?.set_id)?.toUpperCase() ?? null;
  const sourceRiftboundId = nullIfEmpty(rawCard?.riftbound_id);
  const durableExternalCardId = externalCardId(rawCard);
  const cleanName = nullIfEmpty(rawCard?.metadata?.clean_name);
  const domains = textArray(rawCard?.classification?.domain);
  const tags = textArray(rawCard?.tags);
  const normalizedRarityCode = rarityCode(rawCard);
  const normalizedVariantCode = variantCode(rawCard);

  return {
    gameSlug: RIFTBOUND_GAME_SLUG,
    provider: RIFTCODEX_PROVIDER,
    externalCardId: durableExternalCardId,
    sourceRiftboundId,
    providerCardId: nullIfEmpty(rawCard?.id),
    tcgplayerId: nullIfEmpty(rawCard?.tcgplayer_id),
    externalSetId,
    variantSignature: variantSignature(rawCard),
    rarityCode: normalizedRarityCode,
    variantCode: normalizedVariantCode,
    dbRow: {
      game_id: options.gameId ?? null,
      card_image_id: cardImageId(rawCard),
      card_number: publicCardNumber(rawCard),
      name: nullIfEmpty(rawCard?.name),
      name_base: cleanName ?? nullIfEmpty(rawCard?.name),
      variant_label: variantLabel(rawCard),
      set_id: externalSetId ? setIdByExternalId.get(externalSetId) ?? null : null,
      rarity: nullIfEmpty(rawCard?.classification?.rarity),
      rarity_id: idForCode(options.rarityIdByCode, normalizedRarityCode),
      variant_id: idForCode(options.variantIdByCode, normalizedVariantCode),
      card_type: nullIfEmpty(rawCard?.classification?.type),
      color: domains,
      power: toInt(rawCard?.attributes?.power),
      counter: null,
      life: null,
      cost: toInt(rawCard?.attributes?.energy),
      attribute: nullIfEmpty(rawCard?.classification?.supertype),
      types: tags,
      effect: nullIfEmpty(rawCard?.text?.plain),
      trigger: null,
      artist: nullIfEmpty(rawCard?.media?.artist),
      image_url: includeImages ? nullIfEmpty(rawCard?.media?.image_url) : null,
      tcg_product_id: nullIfEmpty(rawCard?.tcgplayer_id),
      game_payload: riftboundGamePayload(rawCard, { includeImages }),
    },
  };
}

export function validateNormalizedSet(normalized) {
  const errors = [];
  if (!normalized.externalSetId) errors.push("missing externalSetId");
  if (!normalized.slug) errors.push("missing slug");
  if (!normalized.name) errors.push("missing name");
  return errors;
}

export function validateNormalizedCard(normalized) {
  const errors = [];
  if (!normalized.externalCardId) errors.push("missing externalCardId");
  if (!normalized.externalSetId) errors.push("missing externalSetId");
  if (!normalized.dbRow.card_image_id) errors.push("missing card_image_id");
  if (!normalized.dbRow.card_number) errors.push("missing card_number");
  if (!normalized.dbRow.name) errors.push("missing name");
  return errors;
}

export function rawSourceRecord({ gameId = null, recordType, externalId, parentExternalId = null, sourceUpdatedAt = null, payload, hash }) {
  return {
    game_id: gameId,
    provider: RIFTCODEX_PROVIDER,
    record_type: recordType,
    external_id: externalId,
    parent_external_id: parentExternalId,
    source_updated_at: sourceUpdatedAt,
    payload_hash: hash,
    payload,
  };
}

function externalIdRow({ gameId, ownerId, ownerKey, provider, externalType, externalId, metadata }) {
  const cleanExternalId = nullIfEmpty(externalId);
  if (!gameId || !ownerId || !cleanExternalId) return null;
  return {
    game_id: gameId,
    [ownerKey]: ownerId,
    provider,
    external_id: cleanExternalId,
    external_type: externalType,
    metadata: metadata ?? {},
  };
}

export function setExternalIdRows(normalizedSet, { gameId, setId }) {
  return [
    externalIdRow({
      gameId,
      ownerId: setId,
      ownerKey: "set_id",
      provider: RIFTCODEX_PROVIDER,
      externalType: "set_code",
      externalId: normalizedSet.externalSetId,
      metadata: {
        name: normalizedSet.name,
        source: "riftcodex.set_id",
      },
    }),
    externalIdRow({
      gameId,
      ownerId: setId,
      ownerKey: "set_id",
      provider: RIFTCODEX_PROVIDER,
      externalType: "source_id",
      externalId: normalizedSet.providerSetId,
      metadata: {
        set_code: normalizedSet.externalSetId,
      },
    }),
    externalIdRow({
      gameId,
      ownerId: setId,
      ownerKey: "set_id",
      provider: "tcgplayer",
      externalType: "set_id",
      externalId: normalizedSet.tcgplayerId,
      metadata: {
        set_code: normalizedSet.externalSetId,
        source: "riftcodex.tcgplayer_id",
      },
    }),
    ...normalizedSet.cardmarketIds.map((cardmarketId, index) => externalIdRow({
      gameId,
      ownerId: setId,
      ownerKey: "set_id",
      provider: "cardmarket",
      externalType: index === 0 ? "set_id" : `set_id_${index + 1}`,
      externalId: cardmarketId,
      metadata: {
        set_code: normalizedSet.externalSetId,
        source: "riftcodex.cardmarket_id",
      },
    })),
  ].filter(Boolean);
}

export function cardExternalIdRows(normalizedCard, { gameId, cardId }) {
  return [
    externalIdRow({
      gameId,
      ownerId: cardId,
      ownerKey: "card_id",
      provider: RIFTCODEX_PROVIDER,
      externalType: "card_key",
      externalId: normalizedCard.externalCardId,
      metadata: {
        source_riftbound_id: normalizedCard.sourceRiftboundId,
        variant_signature: normalizedCard.variantSignature,
      },
    }),
    externalIdRow({
      gameId,
      ownerId: cardId,
      ownerKey: "card_id",
      provider: RIFTCODEX_PROVIDER,
      externalType: "source_id",
      externalId: normalizedCard.providerCardId,
      metadata: {
        card_key: normalizedCard.externalCardId,
        set_code: normalizedCard.externalSetId,
      },
    }),
    externalIdRow({
      gameId,
      ownerId: cardId,
      ownerKey: "card_id",
      provider: "tcgplayer",
      externalType: "product_id",
      externalId: normalizedCard.tcgplayerId,
      metadata: {
        card_key: normalizedCard.externalCardId,
        set_code: normalizedCard.externalSetId,
        source: "riftcodex.tcgplayer_id",
      },
    }),
  ].filter(Boolean);
}
