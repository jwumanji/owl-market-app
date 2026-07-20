import type { RarityRankItem } from "@/lib/types";

export interface RarityIndexCardSource {
  name: string;
  avg: number;
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

export function marketRarityRanking(
  rarities: RarityIndexSource[],
  limit = 5,
  includedSlugs?: readonly string[],
): RarityRankItem[] {
  const included = includedSlugs ? new Set(includedSlugs) : null;

  return [...rarities]
    .filter((rarity) =>
      (!included || included.has(rarity.slug)) &&
      Number.isFinite(rarity.indexValue) &&
      rarity.indexValue > 0
    )
    .sort((a, b) => b.indexValue - a.indexValue || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((rarity) => {
      const topCard = rarity.topCards[0];

      return {
        slug: rarity.slug,
        code: rarity.code,
        name: rarity.name,
        index_value: +rarity.indexValue.toFixed(2),
        card_count: rarity.cardCount,
        top_card_name: topCard?.name ?? null,
        top_card_image_id: topCard?.cardImageId ?? null,
        top_card_market: topCard?.avg ?? null,
        image_url: topCard?.imagePreview ?? topCard?.imageSmall ?? null,
        image_url_small: topCard?.imageSmall ?? null,
        image_url_preview: topCard?.imagePreview ?? null,
        changes: {
          "7D": rarity.chg7d,
          "30D": rarity.chg30d,
        },
      };
    });
}
