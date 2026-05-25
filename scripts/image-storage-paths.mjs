export const ONE_PIECE_GAME_SLUG = "one-piece";
export const OPTCGAPI_IMAGE_PROVIDER = "optcgapi";
export const DEFAULT_CARD_IMAGE_EXTENSION = "jpg";

export function normalizeStoragePathSegment(value) {
  const normalized = String(value ?? "")
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
}) {
  const ext = normalizeStoragePathSegment(extension).replace(/^\.+/, "");

  return [
    "cards",
    normalizeStoragePathSegment(gameSlug),
    normalizeStoragePathSegment(provider),
    `${normalizeStoragePathSegment(cardKey)}.${ext}`,
  ].join("/");
}

export function buildOnePieceCardImageStoragePath(cardKey) {
  return buildCardImageStoragePath({
    gameSlug: ONE_PIECE_GAME_SLUG,
    provider: OPTCGAPI_IMAGE_PROVIDER,
    cardKey,
  });
}
