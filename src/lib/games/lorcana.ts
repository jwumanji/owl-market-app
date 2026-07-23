import type { JustTCGCard, JustTCGSet, JustTCGVariant } from "@/lib/justtcg";

export const LORCANA_DB_SLUG = "lorcana";
export const LORCANA_ROUTE_SLUG = "lorcana";
export const LORCANAJSON_PROVIDER = "lorcanajson";
export const LORCANAJSON_ALL_CARDS_URL =
  "https://lorcanajson.org/files/current/en/allCards.json";
export const LORCANA_JUSTTCG_GAME_SLUG = "disney-lorcana";

export interface LorcanaJsonMetadata {
  formatVersion: string;
  generatedOn: string;
  language: string;
}

export interface LorcanaJsonFormatLegality {
  allowed: boolean;
  allowedUntilDate?: string;
  rotationGroup?: number;
  [key: string]: unknown;
}

export interface LorcanaJsonSet {
  name: string;
  type?: string;
  number?: number;
  prereleaseDate?: string;
  releaseDate?: string;
  hasAllCards?: boolean;
  allowedInFormats?: Record<string, LorcanaJsonFormatLegality>;
  allowedInTournamentsFromDate?: string | null;
  cardCounts?: {
    base?: number;
    nonBase?: number;
    promo?: number;
    total?: number;
  };
  [key: string]: unknown;
}

export interface LorcanaJsonExternalLinks {
  tcgPlayerId?: number | string;
  tcgPlayerUrl?: string;
  cardmarketId?: number | string;
  cardmarketUrl?: string;
  cardTraderId?: number | string;
  cardTraderUrl?: string;
  [key: string]: unknown;
}

export interface LorcanaJsonImages {
  full?: string;
  thumbnail?: string;
  foilMask?: string;
  [key: string]: unknown;
}

export interface LorcanaJsonCard {
  id: number | string;
  setCode: string;
  number: number | string;
  fullIdentifier: string;
  name: string;
  fullName?: string;
  simpleName?: string;
  version?: string;
  type?: string;
  rarity?: string;
  color?: string;
  colors?: string[];
  cost?: number;
  inkwell?: boolean;
  strength?: number;
  willpower?: number;
  lore?: number;
  story?: string;
  subtypes?: string[];
  subtypesText?: string;
  abilities?: unknown[];
  fullText?: string;
  fullTextSections?: string[];
  flavorText?: string;
  artists?: string[];
  artistsText?: string;
  foilTypes?: string[];
  allowedInFormats?: Record<string, LorcanaJsonFormatLegality>;
  allowedInTournamentsFromDate?: string | null;
  externalLinks?: LorcanaJsonExternalLinks;
  images?: LorcanaJsonImages;
  baseId?: number | string;
  promoGrouping?: string;
  promoSource?: string;
  promoSourceCategory?: string;
  [key: string]: unknown;
}

export interface LorcanaJsonDocument {
  metadata: LorcanaJsonMetadata;
  sets: Record<string, LorcanaJsonSet>;
  cards: LorcanaJsonCard[];
}

export interface NormalizedLorcanaCard {
  sourceProvider: typeof LORCANAJSON_PROVIDER;
  sourceExternalId: string;
  sourceLanguage: string;
  printingKey: string;
  setCode: string;
  collectorNumber: string;
  fullIdentifier: string;
  name: string;
  fullName: string;
  simpleName: string | null;
  version: string | null;
  type: string | null;
  rarity: string | null;
  colorRaw: string | null;
  colors: string[];
  isPromo: boolean;
  promo: {
    grouping: string | null;
    source: string | null;
    sourceCategory: string | null;
    baseSourceId: string | null;
  };
  gameplay: {
    cost: number | null;
    inkwell: boolean | null;
    strength: number | null;
    willpower: number | null;
    lore: number | null;
    story: string | null;
    subtypes: string[];
    abilities: unknown[];
    fullText: string | null;
    fullTextSections: string[];
    flavorText: string | null;
  };
  legalities: Record<string, LorcanaJsonFormatLegality>;
  allowedInTournamentsFromDate: string | null;
  artists: string[];
  foilTypes: string[];
  externalIds: {
    tcgplayer: string | null;
    cardmarket: string | null;
    cardtrader: string | null;
  };
  externalUrls: {
    tcgplayer: string | null;
    cardmarket: string | null;
    cardtrader: string | null;
  };
  imageUrls: {
    full: string | null;
    thumbnail: string | null;
    foilMask: string | null;
  };
  assetWritesAllowed: false;
  sourcePayload: LorcanaJsonCard;
}

export interface LorcanaCatalogSet {
  code: string;
  name: string;
}

export interface LorcanaJustTcgCardMatch {
  canonicalCard: NormalizedLorcanaCard;
  justTcgCard: JustTCGCard;
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function optionalFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeLorcanaSetName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function lorcanaTaxonomyCode(value: string | null | undefined): string | null {
  const normalized = optionalString(value);
  return normalized
    ? normalized
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    : null;
}

export function lorcanaSetSlug(setCode: string | null | undefined): string | null {
  const normalized = optionalString(setCode)?.toLowerCase();
  return normalized ? `${LORCANA_DB_SLUG}-${normalized.replace(/[^a-z0-9]+/g, "-")}` : null;
}

export function lorcanaDefinitionSourceId(
  card: Pick<LorcanaJsonCard, "id" | "baseId">
): string | null {
  return optionalString(card.baseId) ?? optionalString(card.id);
}

export function lorcanaVariantCode(
  card: Pick<
    LorcanaJsonCard,
    "baseId" | "fullIdentifier" | "promoGrouping" | "promoSource" | "promoSourceCategory"
  >
): "STANDARD" | "PROMO" | "ALTERNATE_ART" {
  if (isLorcanaPromo(card)) return "PROMO";
  return optionalString(card.baseId) ? "ALTERNATE_ART" : "STANDARD";
}

export function normalizeLorcanaColors(
  color: string | null | undefined,
  colors?: readonly string[]
): string[] {
  const values =
    colors && colors.length > 0
      ? colors
      : (color ?? "")
          .split("-")
          .map((value) => value.trim())
          .filter(Boolean);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function lorcanaJsonCardExternalId(card: Pick<LorcanaJsonCard, "id">): string | null {
  return optionalString(card.id);
}

export function lorcanaTcgplayerProductId(
  card: Pick<LorcanaJsonCard, "externalLinks">
): string | null {
  return optionalString(card.externalLinks?.tcgPlayerId);
}

export function isLorcanaPromo(
  card: Pick<
    LorcanaJsonCard,
    "fullIdentifier" | "promoGrouping" | "promoSource" | "promoSourceCategory"
  >
): boolean {
  return Boolean(
    optionalString(card.promoGrouping) ||
      optionalString(card.promoSource) ||
      optionalString(card.promoSourceCategory) ||
      /\/P\d+\b/i.test(card.fullIdentifier)
  );
}

/**
 * Normalize one LorcanaJSON printing without treating image URLs as permission
 * to copy or publish the associated assets.
 */
export function normalizeLorcanaJsonCard(
  card: LorcanaJsonCard,
  language = "en"
): NormalizedLorcanaCard {
  const sourceExternalId = lorcanaJsonCardExternalId(card);
  if (!sourceExternalId) throw new Error("LorcanaJSON card is missing id");

  const sourceLanguage = optionalString(language)?.toLowerCase() ?? "en";
  const fullName = optionalString(card.fullName) ?? optionalString(card.name);
  if (!fullName) throw new Error(`LorcanaJSON card ${sourceExternalId} is missing name`);

  const externalLinks = card.externalLinks ?? {};
  const images = card.images ?? {};

  return {
    sourceProvider: LORCANAJSON_PROVIDER,
    sourceExternalId,
    sourceLanguage,
    printingKey: `${LORCANAJSON_PROVIDER}:${sourceLanguage}:${sourceExternalId}`,
    setCode: optionalString(card.setCode) ?? "",
    collectorNumber: optionalString(card.number) ?? "",
    fullIdentifier: optionalString(card.fullIdentifier) ?? "",
    name: optionalString(card.name) ?? fullName,
    fullName,
    simpleName: optionalString(card.simpleName),
    version: optionalString(card.version),
    type: optionalString(card.type),
    rarity: optionalString(card.rarity),
    colorRaw: optionalString(card.color),
    colors: normalizeLorcanaColors(card.color, card.colors),
    isPromo: isLorcanaPromo(card),
    promo: {
      grouping: optionalString(card.promoGrouping),
      source: optionalString(card.promoSource),
      sourceCategory: optionalString(card.promoSourceCategory),
      baseSourceId: optionalString(card.baseId),
    },
    gameplay: {
      cost: optionalFiniteNumber(card.cost),
      inkwell: typeof card.inkwell === "boolean" ? card.inkwell : null,
      strength: optionalFiniteNumber(card.strength),
      willpower: optionalFiniteNumber(card.willpower),
      lore: optionalFiniteNumber(card.lore),
      story: optionalString(card.story),
      subtypes: [...(card.subtypes ?? [])],
      abilities: [...(card.abilities ?? [])],
      fullText: optionalString(card.fullText),
      fullTextSections: [...(card.fullTextSections ?? [])],
      flavorText: optionalString(card.flavorText),
    },
    legalities: { ...(card.allowedInFormats ?? {}) },
    allowedInTournamentsFromDate: optionalString(card.allowedInTournamentsFromDate),
    artists: [...(card.artists ?? [])],
    foilTypes: [...(card.foilTypes ?? [])],
    externalIds: {
      tcgplayer: optionalString(externalLinks.tcgPlayerId),
      cardmarket: optionalString(externalLinks.cardmarketId),
      cardtrader: optionalString(externalLinks.cardTraderId),
    },
    externalUrls: {
      tcgplayer: optionalString(externalLinks.tcgPlayerUrl),
      cardmarket: optionalString(externalLinks.cardmarketUrl),
      cardtrader: optionalString(externalLinks.cardTraderUrl),
    },
    imageUrls: {
      full: optionalString(images.full),
      thumbnail: optionalString(images.thumbnail),
      foilMask: optionalString(images.foilMask),
    },
    assetWritesAllowed: false,
    sourcePayload: card,
  };
}

/** Exact normalized-name matching only; ambiguous set names remain unmatched. */
export function matchLorcanaJustTcgSet(
  providerSet: JustTCGSet,
  catalogSets: readonly LorcanaCatalogSet[]
): LorcanaCatalogSet | null {
  const wanted = normalizeLorcanaSetName(providerSet.name);
  if (!wanted) return null;
  const matches = catalogSets.filter(
    (set) => normalizeLorcanaSetName(set.name) === wanted
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Join commercial records only when a TCGplayer product ID is unique on both
 * sides. Names, collector numbers, and fuzzy set matches never publish prices.
 */
export function matchLorcanaJustTcgCards(
  cards: readonly JustTCGCard[],
  canonicalCards: readonly NormalizedLorcanaCard[]
): {
  matches: LorcanaJustTcgCardMatch[];
  unmatched: JustTCGCard[];
  conflictingProductIds: string[];
} {
  const canonicalByProductId = new Map<string, NormalizedLorcanaCard>();
  const canonicalConflicts = new Set<string>();
  for (const card of canonicalCards) {
    const productId = card.externalIds.tcgplayer?.trim();
    if (!productId) continue;
    const existing = canonicalByProductId.get(productId);
    if (existing && existing.printingKey !== card.printingKey) {
      canonicalConflicts.add(productId);
      canonicalByProductId.delete(productId);
      continue;
    }
    if (!canonicalConflicts.has(productId)) canonicalByProductId.set(productId, card);
  }

  const providerCounts = new Map<string, number>();
  for (const card of cards) {
    const productId = card.tcgplayerId?.trim();
    if (productId) providerCounts.set(productId, (providerCounts.get(productId) ?? 0) + 1);
  }
  const providerConflicts = new Set(
    [...providerCounts].filter(([, count]) => count > 1).map(([productId]) => productId)
  );
  const conflictingProductIds = new Set([...canonicalConflicts, ...providerConflicts]);

  const matches: LorcanaJustTcgCardMatch[] = [];
  const unmatched: JustTCGCard[] = [];
  for (const card of cards) {
    const productId = card.tcgplayerId?.trim();
    const canonicalCard =
      productId && !conflictingProductIds.has(productId)
        ? canonicalByProductId.get(productId)
        : null;
    if (canonicalCard) matches.push({ canonicalCard, justTcgCard: card });
    else unmatched.push(card);
  }

  return {
    matches,
    unmatched,
    conflictingProductIds: [...conflictingProductIds].sort(),
  };
}

/**
 * Keep each eligible Lorcana finish as its own commercial variant. Lorcana
 * printings include Normal, Holofoil, and Cold Foil, so no single finish is
 * chosen as the universal card price.
 */
export function eligibleLorcanaMarketVariants(card: JustTCGCard): JustTCGVariant[] {
  return card.variants.filter(
    (variant) =>
      typeof variant.price === "number" &&
      Number.isFinite(variant.price) &&
      variant.price >= 0 &&
      variant.condition.trim().toLowerCase() === "near mint" &&
      (!variant.language || variant.language.trim().toLowerCase().startsWith("english"))
  );
}

export function justTcgLorcanaCardExternalId(card: JustTCGCard): string | null {
  return card.uuid?.trim() || card.id?.trim() || null;
}

export function justTcgLorcanaSourceUpdatedAt(card: JustTCGCard): string | null {
  const timestamps = card.variants
    .map((variant) => variant.lastUpdated)
    .filter((value): value is number => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps) * 1000).toISOString();
}
