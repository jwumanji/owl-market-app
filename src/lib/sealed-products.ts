import { ONE_PIECE_JUSTTCG_SET_SLUG_MAP } from "@/lib/games/one-piece";
import type { JustTCGSealedProduct, JustTCGVariant } from "@/lib/justtcg";

export type SealedProductType =
  | "booster_box"
  | "booster_box_case"
  | "booster_pack"
  | "sleeved_booster_pack"
  | "starter_deck"
  | "starter_deck_display"
  | "double_pack"
  | "tournament_pack"
  | "promotion_pack"
  | "display"
  | "collection"
  | "bundle"
  | "deck_set"
  | "battle_kit"
  | "binder"
  | "case"
  | "pack"
  | "other";

export interface SealedSetTarget {
  id: string;
  code: string | null;
  name: string | null;
}

export interface SealedImportRow {
  game_id: string;
  set_id: string | null;
  name: string;
  product_type: SealedProductType;
  tcg_price: number | null;
  market_avg: number | null;
  chg_1d: number | null;
  chg_7d: number | null;
  chg_30d: number | null;
  ath: number | null;
  atl: number | null;
  image_url: string | null;
  tcg_product_id: string;
  provider: "justtcg";
  justtcg_id: string;
  tcg_sku_id: string | null;
  source_set_slug: string;
  source_set_name: string;
  product_url: string;
  price_updated_at: string | null;
  last_synced_at: string;
  updated_at: string;
  is_active: true;
  metadata: Record<string, unknown>;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function classifySealedProductType(name: string): SealedProductType {
  const value = normalizeText(name);

  if (/\bsleeved booster pack\b/.test(value)) return "sleeved_booster_pack";
  if (/\bbooster box case\b|\bbox case\b/.test(value)) return "booster_box_case";
  if (/\bbooster box\b|\bdisplay booster\b/.test(value)) return "booster_box";
  if (/\bextra booster\b.*\bbox\b/.test(value)) return "booster_box";
  if (/\bbooster pack\b/.test(value)) return "booster_pack";
  if (/\bdouble pack\b/.test(value)) return "double_pack";
  if (/\bstarter deck\b.*\bdisplay\b|\bdisplay\b.*\bstarter deck\b/.test(value)) {
    return "starter_deck_display";
  }
  if (/\bstarter deck\b|\bultra deck\b/.test(value)) return "starter_deck";
  if (/\btournament pack\b|\bchampionship pack\b|\bjudge pack\b/.test(value)) {
    return "tournament_pack";
  }
  if (/\bpromotion pack\b|\bpromo pack\b|\bpre release pack\b/.test(value)) {
    return "promotion_pack";
  }
  if (/\bdeck set\b/.test(value)) return "deck_set";
  if (/\bbattle kit\b/.test(value)) return "battle_kit";
  if (/\bbinder\b/.test(value)) return "binder";
  if (/\bdisplay\b/.test(value)) return "display";
  if (/\bcollection\b|\billustration box\b/.test(value)) return "collection";
  if (/\bbundle\b|\banniversary set\b/.test(value)) return "bundle";
  if (/\bcase\b/.test(value)) return "case";
  if (/\bpack\b/.test(value)) return "pack";
  return "other";
}

export function extractSealedSetCode(value: string | null | undefined): string | null {
  const source = value ?? "";
  const match = source.match(/\b(OP|EB|PRB|ST)[\s-]?(\d{1,2})\b/i);
  if (match) return `${match[1].toUpperCase()}${match[2].padStart(2, "0")}`;

  const starterDeckMatch = source.match(/\bstarter deck(?:\s+ex)?\s*[:#-]?\s*(\d{1,2})\b/i);
  if (starterDeckMatch) return `ST${starterDeckMatch[1].padStart(2, "0")}`;
  return null;
}

function baseProductSetSlug(sourceSlug: string): string | null {
  const suffixes = [
    /-(?:pre-release-cards|release-event-cards)-one-piece-card-game$/,
    /-\d+(?:st|nd|rd|th)-anniversary-tournament-cards-one-piece-card-game$/,
  ];
  for (const suffix of suffixes) {
    if (suffix.test(sourceSlug)) {
      return sourceSlug.replace(suffix, "-one-piece-card-game");
    }
  }
  return null;
}

export function resolveSealedSetTarget(
  product: Pick<JustTCGSealedProduct, "set" | "set_name" | "name">,
  sets: SealedSetTarget[]
): SealedSetTarget | null {
  const byCode = new Map(
    sets
      .filter((set): set is SealedSetTarget & { code: string } => Boolean(set.code))
      .map((set) => [set.code.toUpperCase(), set])
  );

  const mappedCode = ONE_PIECE_JUSTTCG_SET_SLUG_MAP[product.set];
  if (mappedCode && byCode.has(mappedCode)) return byCode.get(mappedCode) ?? null;

  const baseSlug = baseProductSetSlug(product.set);
  const baseMappedCode = baseSlug ? ONE_PIECE_JUSTTCG_SET_SLUG_MAP[baseSlug] : null;
  if (baseMappedCode && byCode.has(baseMappedCode)) {
    return byCode.get(baseMappedCode) ?? null;
  }

  const extractedCode =
    extractSealedSetCode(product.set_name) ??
    extractSealedSetCode(product.name) ??
    extractSealedSetCode(product.set);
  if (extractedCode && byCode.has(extractedCode)) return byCode.get(extractedCode) ?? null;

  const normalizedSourceName = normalizeText(product.set_name);
  const exactName = sets.find((set) => normalizeText(set.name) === normalizedSourceName);
  return exactName ?? null;
}

export function selectSealedVariant(product: JustTCGSealedProduct): JustTCGVariant | null {
  return (
    product.variants.find(
      (variant) => variant.condition === "Sealed" && (variant.language ?? "").toLowerCase() === "english"
    ) ??
    product.variants.find((variant) => variant.condition === "Sealed") ??
    null
  );
}

function unixSecondsToIso(value: number | null | undefined): string | null {
  if (!Number.isFinite(value)) return null;
  return new Date(Number(value) * 1000).toISOString();
}

export function buildSealedImportRow(
  product: JustTCGSealedProduct,
  gameId: string,
  sets: SealedSetTarget[],
  syncedAt: string
): SealedImportRow | null {
  if (!product.tcgplayerId) return null;

  const variant = selectSealedVariant(product);
  const set = resolveSealedSetTarget(product, sets);
  const price = finiteNumber(variant?.price);

  return {
    game_id: gameId,
    set_id: set?.id ?? null,
    name: product.name,
    product_type: classifySealedProductType(product.name),
    tcg_price: price,
    market_avg: price,
    chg_1d: finiteNumber(variant?.priceChange24hr),
    chg_7d: finiteNumber(variant?.priceChange7d),
    chg_30d: finiteNumber(variant?.priceChange30d),
    ath: finiteNumber(variant?.maxPriceAllTime),
    atl: finiteNumber(variant?.minPriceAllTime),
    image_url: null,
    tcg_product_id: product.tcgplayerId,
    provider: "justtcg",
    justtcg_id: product.id,
    tcg_sku_id: variant?.tcgplayerSkuId ?? null,
    source_set_slug: product.set,
    source_set_name: product.set_name,
    product_url: `https://www.tcgplayer.com/product/${product.tcgplayerId}`,
    price_updated_at: unixSecondsToIso(variant?.lastUpdated),
    last_synced_at: syncedAt,
    updated_at: syncedAt,
    is_active: true,
    metadata: {
      provider_uuid: product.uuid ?? null,
      provider_variant_id: variant?.id ?? null,
      provider_variant_uuid: variant?.uuid ?? null,
      language: variant?.language ?? null,
      printing: variant?.printing ?? null,
      details: product.details ?? null,
      average_7d: finiteNumber(variant?.avgPrice),
      average_30d: finiteNumber(variant?.avgPrice30d),
      average_90d: finiteNumber(variant?.avgPrice90d),
    },
  };
}

export function sealedProductTypeLabel(type: string | null | undefined) {
  const labels: Record<string, string> = {
    booster_box: "1× Booster Box",
    booster_box_case: "Booster Box Case",
    booster_pack: "Booster Pack",
    sleeved_booster_pack: "Sleeved Booster Pack",
    starter_deck: "Starter Deck",
    starter_deck_display: "Starter Deck Display",
    double_pack: "Double Pack",
    tournament_pack: "Tournament Pack",
    promotion_pack: "Promotion Pack",
    display: "Display",
    collection: "Collection",
    bundle: "Bundle",
    deck_set: "Deck Set",
    battle_kit: "Battle Kit",
    binder: "Binder",
    case: "Case",
    pack: "Pack",
    other: "Sealed Product",
  };
  return labels[type ?? ""] ?? "Sealed Product";
}