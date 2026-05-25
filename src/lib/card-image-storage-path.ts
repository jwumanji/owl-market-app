export interface CardImageStoragePathInput {
  gameSlug: string;
  provider: string;
  cardKey: string;
  extension?: string;
}

export const ONE_PIECE_GAME_SLUG = "one-piece";
export const OPTCGAPI_IMAGE_PROVIDER = "optcgapi";
export const DEFAULT_CARD_IMAGE_EXTENSION = "jpg";

export function normalizeStoragePathSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  if (!normalized) {
    throw new Error("Storage path segment cannot be empty.");
  }

  return normalized;
}

export function buildCardImageStoragePath({
  gameSlug,
  provider,
  cardKey,
  extension = DEFAULT_CARD_IMAGE_EXTENSION,
}: CardImageStoragePathInput): string {
  const ext = normalizeStoragePathSegment(extension).replace(/^\.+/, "");

  return [
    "cards",
    normalizeStoragePathSegment(gameSlug),
    normalizeStoragePathSegment(provider),
    `${normalizeStoragePathSegment(cardKey)}.${ext}`,
  ].join("/");
}

export function buildOnePieceCardImageStoragePath(cardKey: string): string {
  return buildCardImageStoragePath({
    gameSlug: ONE_PIECE_GAME_SLUG,
    provider: OPTCGAPI_IMAGE_PROVIDER,
    cardKey,
  });
}
