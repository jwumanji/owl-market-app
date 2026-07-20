import type { RarityRankItem } from "@/lib/types";

export interface RarityIndexCardSource {
  name: string;
  avg: number;
  tcg?: number;
  cardImageId?: string;
  imageSmall?: string | null;
  imagePreview?: string | null;
}

export interface RarityIndexSource {
  slug: string;
  code: string;
  name: string;
  indexValue: number;
  cardCount: number;
  chg7d: number | null;
  chg30d: number | null;
  topCards: RarityIndexCardSource[];
}

function marketPrice(card: RarityIndexCardSource) {
  return card.avg > 0 ? card.avg : card.tcg ?? 0;
}

function topMarketCard(cards: RarityIndexCardSource[]) {
  return [...cards]
    .filter((card) => Number.isFinite(marketPrice(card)) && marketPrice(card) > 0)
    .sort((a, b) =>
      marketPrice(b) - marketPrice(a)
      || (b.tcg ?? 0) - (a.tcg ?? 0)
      || a.name.localeCompare(b.name),
    )[0];
}

export function marketRarityRanking(
  rarities: RarityIndexSource[],
  limit = 5,
  includedSlugs?: readonly string[],
): RarityRankItem[] {
  const included = includedSlugs ? new Set(includedSlugs) : null;

  return rarities
    .flatMap((rarity) => {
      if (included && !included.has(rarity.slug)) return [];

      const topCard = topMarketCard(rarity.topCards);
      const topCardMarket = topCard ? marketPrice(topCard) : 0;

      return topCard && topCardMarket > 0
        ? [{ rarity, topCard, topCardMarket }]
        : [];
    })
    .sort((a, b) =>
      b.topCardMarket - a.topCardMarket || a.rarity.name.localeCompare(b.rarity.name),
    )
    .slice(0, limit)
    .map(({ rarity, topCard, topCardMarket }) => {
      return {
        slug: rarity.slug,
        code: rarity.code,
        name: rarity.name,
        index_value: +rarity.indexValue.toFixed(2),
        card_count: rarity.cardCount,
        top_card_name: topCard?.name ?? null,
        top_card_image_id: topCard?.cardImageId ?? null,
        top_card_market: +topCardMarket.toFixed(2),
        image_url: topCard.imagePreview ?? topCard.imageSmall ?? null,
        image_url_small: topCard.imageSmall ?? null,
        image_url_preview: topCard.imagePreview ?? null,
        changes: {
          "7D": rarity.chg7d,
          "30D": rarity.chg30d,
        },
      };
    });
}
