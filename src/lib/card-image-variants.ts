export type CardImageSourceSize = "thumbnail" | "preview" | "display";

export type CardImageVariantUrls = {
  imageUrl?: string | null;
  imageUrlPreview?: string | null;
  imageUrlSmall?: string | null;
};

const SOURCE_ORDER: Record<CardImageSourceSize, Array<keyof CardImageVariantUrls>> = {
  thumbnail: ["imageUrlSmall", "imageUrlPreview", "imageUrl"],
  preview: ["imageUrlPreview", "imageUrl", "imageUrlSmall"],
  display: ["imageUrl", "imageUrlPreview", "imageUrlSmall"],
};

export function cardImageSources(
  variants: CardImageVariantUrls,
  sourceSize: CardImageSourceSize,
) {
  return SOURCE_ORDER[sourceSize]
    .map((key) => variants[key])
    .filter((src): src is string => Boolean(src))
    .filter((src, index, sources) => sources.indexOf(src) === index);
}

export function cardImageSourcesAcrossCards(
  cards: CardImageVariantUrls[],
  sourceSize: CardImageSourceSize,
) {
  return cards
    .flatMap((card) => cardImageSources(card, sourceSize))
    .filter((src, index, sources) => sources.indexOf(src) === index);
}
