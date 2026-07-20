type BoosterBoxCandidate = {
  set_id: string | null;
  set_code: string | null;
  name: string;
  product_type: string | null;
  market_avg: number | null;
};

const TCGPLAYER_IMAGE_BASE = "https://product-images.tcgplayer.com/fit-in/1000x1000";

export function tcgPlayerProductImageUrl(productId: string | null | undefined) {
  const normalizedId = productId?.trim() ?? "";
  return /^\d+$/.test(normalizedId)
    ? `${TCGPLAYER_IMAGE_BASE}/${normalizedId}.jpg`
    : null;
}

export function rankBoosterBoxesByPrice<T extends BoosterBoxCandidate>(
  items: T[],
  limit = 5,
) {
  const seenSets = new Set<string>();

  return [...items]
    .filter((item) =>
      item.product_type === "booster_box"
      && item.market_avg != null
      && Number.isFinite(item.market_avg)
      && item.market_avg > 0,
    )
    .sort((a, b) =>
      (b.market_avg ?? Number.NEGATIVE_INFINITY) - (a.market_avg ?? Number.NEGATIVE_INFINITY)
      || a.name.localeCompare(b.name),
    )
    .filter((item) => {
      const setKey = item.set_id ?? item.set_code ?? item.name.trim().toLowerCase();
      if (seenSets.has(setKey)) return false;
      seenSets.add(setKey);
      return true;
    })
    .slice(0, limit);
}
