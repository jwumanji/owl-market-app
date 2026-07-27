const TCGPLAYER_IMAGE_BASE = "https://product-images.tcgplayer.com/fit-in/1000x1000";

export type ImageHealthCard = {
  id: string;
  image_source_url?: string | null;
  image_url?: string | null;
  image_url_preview?: string | null;
  image_url_small?: string | null;
};

export type ImageProbeClassification =
  | { healthy: true; reason: "ok" }
  | { healthy: false; reason: "http_error" | "not_image" };

function uniqueUrls(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() ?? "")
    .filter((value) => /^https?:\/\//i.test(value))
    .filter((value, index, urls) => urls.indexOf(value) === index);
}

function tcgPlayerProductImageUrl(productId: string | null | undefined) {
  const normalizedId = productId?.trim() ?? "";
  return /^\d+$/.test(normalizedId)
    ? `${TCGPLAYER_IMAGE_BASE}/${normalizedId}.jpg`
    : null;
}

export function cardImageHealthCandidates(
  card: ImageHealthCard,
  tcgplayerProductId?: string | null,
) {
  return uniqueUrls([
    card.image_url_preview,
    card.image_url,
    card.image_url_small,
    card.image_source_url,
    tcgPlayerProductImageUrl(tcgplayerProductId),
  ]);
}

export function imageSourceProvider(url: string) {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "invalid-url";
  }
  if (hostname === "product-images.tcgplayer.com" || hostname.endsWith(".tcgplayer.com")) {
    return "tcgplayer";
  }
  if (hostname.includes("supabase")) return "owl-storage";
  if (hostname === "optcgapi.com" || hostname.endsWith(".optcgapi.com")) return "optcgapi";
  if (hostname.includes("limitlesstcg")) return "limitless";
  return hostname;
}

export function classifyImageProbe(
  status: number,
  contentType: string | null,
): ImageProbeClassification {
  if (status < 200 || status >= 300) {
    return { healthy: false, reason: "http_error" };
  }
  if (!(contentType ?? "").toLowerCase().startsWith("image/")) {
    return { healthy: false, reason: "not_image" };
  }
  return { healthy: true, reason: "ok" };
}

export function selectImageHealthSample<T extends ImageHealthCard>(
  cards: T[],
  priceByCard: ReadonlyMap<string, number>,
  limit: number,
  rotationSeed: number,
) {
  const sampleLimit = Math.max(0, Math.min(Math.floor(limit), cards.length));
  if (sampleLimit === 0) return [];

  const priced = cards
    .filter((card) => (priceByCard.get(card.id) ?? 0) > 0)
    .sort((left, right) =>
      (priceByCard.get(right.id) ?? 0) - (priceByCard.get(left.id) ?? 0)
      || left.id.localeCompare(right.id)
    );
  const priorityCount = Math.min(Math.ceil(sampleLimit / 2), priced.length);
  const selected = priced.slice(0, priorityCount);
  const selectedIds = new Set(selected.map((card) => card.id));
  const rotationPool = [...cards]
    .filter((card) => !selectedIds.has(card.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const rotationCount = sampleLimit - selected.length;

  if (rotationPool.length === 0 || rotationCount === 0) return selected;

  const start = (
    Math.abs(Math.floor(rotationSeed)) * Math.max(1, rotationCount)
  ) % rotationPool.length;
  for (let index = 0; index < rotationCount; index += 1) {
    selected.push(rotationPool[(start + index) % rotationPool.length]);
  }

  return selected;
}
