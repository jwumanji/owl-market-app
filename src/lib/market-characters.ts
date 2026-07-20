type CharacterIndexCardSource = {
  imageUrlSmall?: string | null;
  imageUrlPreview?: string | null;
};

type CharacterIndexSource = {
  slug: string;
  name: string;
  indexValue: number;
  chg7d: number | null;
  topCards: CharacterIndexCardSource[];
};

export function characterIndexMarketRanking(
  characters: CharacterIndexSource[],
  limit = 5,
) {
  return [...characters]
    .filter((character) => Number.isFinite(character.indexValue) && character.indexValue > 0)
    .sort((a, b) => b.indexValue - a.indexValue || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((character) => {
      const representativeCard = character.topCards[0];

      return {
        name: character.name,
        slug: character.slug,
        index_value: +character.indexValue.toFixed(2),
        image_url: representativeCard?.imageUrlPreview ?? representativeCard?.imageUrlSmall ?? null,
        image_url_small: representativeCard?.imageUrlSmall ?? null,
        image_url_preview: representativeCard?.imageUrlPreview ?? null,
        changes: {
          "7D": character.chg7d,
        },
      };
    });
}
