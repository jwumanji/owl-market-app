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

export function normalizeRiftboundSetName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Match provider sets only when their normalized name identifies exactly one
 * existing Riftcodex-owned Moon Market set. New sets remain raw-only until the
 * catalog source adds the Riftbound-specific gameplay fields Moon needs.
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

/** Join JustTCG cards to Riftcodex-owned cards by exact TCGplayer product ID. */
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
