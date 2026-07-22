import type { JustTCGCard, JustTCGSet } from "@/lib/justtcg";

export const RIFTBOUND_JUSTTCG_GAME_SLUG =
  "riftbound-league-of-legends-trading-card-game";

export interface RiftboundCatalogSet {
  id: string;
  code: string | null;
  name: string | null;
}

export interface RiftboundTcgplayerExternalId {
  card_id: string;
  external_id: string;
}

export interface RiftboundJustTcgCardMatch {
  cardId: string;
  justTcgCard: JustTCGCard;
}

export type RiftboundReconciliationStatus =
  | "official_new"
  | "official_preview"
  | "commercial_variant"
  | "provider_ahead"
  | "catalog_only"
  | "identity_conflict"
  | "sealed_product"
  | "resolved"
  | "ignored";

export interface KnownRiftboundSet {
  name: string;
  releaseDate: string;
  status: "preview" | "released";
}

const KNOWN_RIFTBOUND_SETS = new Map<string, Omit<KnownRiftboundSet, "status">>([
  [
    "vendetta",
    {
      name: "Vendetta",
      releaseDate: "2026-07-31",
    },
  ],
]);

export function normalizeRiftboundSetName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function knownRiftboundSet(
  value: string | null | undefined,
  asOf = new Date()
): KnownRiftboundSet | null {
  const known = KNOWN_RIFTBOUND_SETS.get(normalizeRiftboundSetName(value));
  if (!known) return null;
  return {
    ...known,
    status:
      asOf.toISOString().slice(0, 10) < known.releaseDate ? "preview" : "released",
  };
}

export function looksLikeSealedProduct(card: Pick<JustTCGCard, "name">): boolean {
  return /\b(booster box|booster display|case|starter deck|champion deck|playmat|bundle)\b/i.test(
    card.name
  );
}

export function classifyRiftboundUnmatchedCard(
  card: JustTCGCard,
  options: { hasCatalogSet: boolean; possibleCardId?: string | null }
): { status: RiftboundReconciliationStatus; reason: string } {
  if (looksLikeSealedProduct(card)) {
    return { status: "sealed_product", reason: "provider_record_is_not_a_single_card" };
  }
  if (!card.tcgplayerId?.trim()) {
    return { status: "identity_conflict", reason: "missing_tcgplayer_product_id" };
  }
  if (options.possibleCardId) {
    return {
      status: "identity_conflict",
      reason: "collector_number_matches_but_tcgplayer_product_id_differs",
    };
  }
  if (knownRiftboundSet(card.set_name)) {
    return {
      status: "provider_ahead",
      reason: "known_official_set_waiting_for_riot_card_confirmation",
    };
  }
  if (options.hasCatalogSet) {
    return {
      status: "provider_ahead",
      reason: "commercial_provider_card_missing_from_canonical_catalog",
    };
  }
  return {
    status: "provider_ahead",
    reason: "commercial_provider_set_missing_from_canonical_catalog",
  };
}

export function selectRiftboundMarketVariant(card: JustTCGCard) {
  const priced = card.variants.filter(
    (variant) =>
      typeof variant.price === "number" &&
      Number.isFinite(variant.price) &&
      variant.price >= 0 &&
      variant.condition.trim().toLowerCase() === "near mint" &&
      (!variant.language || variant.language.trim().toLowerCase().startsWith("english"))
  );
  return (
    priced.find((variant) => variant.printing.trim().toLowerCase() === "normal") ??
    priced.find((variant) => variant.printing.trim().toLowerCase() === "foil") ??
    priced[0] ??
    null
  );
}

/**
 * Match provider sets only when their normalized name identifies exactly one
 * existing canonical Moon Market set. New sets remain quarantined until Riot
 * confirms the Riftbound-specific gameplay fields Moon needs.
 */
export function matchRiftboundJustTcgSet(
  providerSet: JustTCGSet,
  catalogSets: readonly RiftboundCatalogSet[]
): RiftboundCatalogSet | null {
  const wanted = normalizeRiftboundSetName(providerSet.name);
  if (!wanted) return null;
  const matches = catalogSets.filter(
    (set) => normalizeRiftboundSetName(set.name) === wanted
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Join JustTCG cards to canonical cards by exact TCGplayer product ID. */
export function matchRiftboundJustTcgCards(
  cards: readonly JustTCGCard[],
  tcgplayerIds: readonly RiftboundTcgplayerExternalId[]
): { matches: RiftboundJustTcgCardMatch[]; unmatched: JustTCGCard[] } {
  const cardIdByProductId = new Map<string, string>();
  const duplicateProductIds = new Set<string>();

  for (const row of tcgplayerIds) {
    const productId = row.external_id.trim();
    if (!productId) continue;
    const existing = cardIdByProductId.get(productId);
    if (existing && existing !== row.card_id) {
      duplicateProductIds.add(productId);
      cardIdByProductId.delete(productId);
      continue;
    }
    if (!duplicateProductIds.has(productId)) {
      cardIdByProductId.set(productId, row.card_id);
    }
  }

  const matches: RiftboundJustTcgCardMatch[] = [];
  const unmatched: JustTCGCard[] = [];
  for (const card of cards) {
    const productId = card.tcgplayerId?.trim();
    const cardId = productId ? cardIdByProductId.get(productId) : null;
    if (cardId) matches.push({ cardId, justTcgCard: card });
    else unmatched.push(card);
  }
  return { matches, unmatched };
}

export function justTcgCardExternalId(card: JustTCGCard): string | null {
  return card.uuid?.trim() || card.id?.trim() || null;
}

export function justTcgSourceUpdatedAt(card: JustTCGCard): string | null {
  const timestamps = card.variants
    .map((variant) => variant.lastUpdated)
    .filter((value): value is number => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps) * 1000).toISOString();
}
