type BoosterBoxCandidate = {
  set_id: string | null;
  set_code: string | null;
  name: string;
  product_type: string | null;
  market_avg: number | null;
};

type ValuedBoosterBoxCandidate = BoosterBoxCandidate & {
  total_set_value: number;
};

type SealedImageCandidate = {
  set_id: string | null;
  product_type: string | null;
  market_avg: number | null;
  image_url: string | null;
  tcg_product_id: string | null;
};

const TCGPLAYER_IMAGE_BASE = "https://product-images.tcgplayer.com/fit-in/1000x1000";

export function tcgPlayerProductImageUrl(productId: string | null | undefined) {
  const normalizedId = productId?.trim() ?? "";
  return /^\d+$/.test(normalizedId)
    ? `${TCGPLAYER_IMAGE_BASE}/${normalizedId}.jpg`
    : null;
}

function normalizedProductBase(name: string) {
  return name
    .toLowerCase()
    .replace(/\bbooster\s+box\s+case\b/g, "")
    .replace(/\bbox\s+case\b/g, "")
    .replace(/\bbooster\s+box\b/g, "")
    .replace(/\bcase\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function setKey(item: BoosterBoxCandidate) {
  return item.set_id ?? item.set_code ?? normalizedProductBase(item.name);
}

function waveKey(name: string) {
  return name.toLowerCase().match(/\bwave\s*\d+\b/)?.[0].replace(/\s+/g, "") ?? null;
}

export function attachCasePrices<T extends BoosterBoxCandidate>(items: T[]) {
  const cases = items.filter((item) => item.product_type === "booster_box_case");

  return items
    .filter((item) => item.product_type === "booster_box")
    .map((box) => {
      const matchingCases = cases.filter((candidate) => setKey(candidate) === setKey(box));
      const boxWave = waveKey(box.name);
      const matchingWave = boxWave
        ? matchingCases.find((candidate) => waveKey(candidate.name) === boxWave)
        : null;
      const selectedCase = matchingWave ?? [...matchingCases].sort((a, b) =>
        (b.market_avg ?? Number.NEGATIVE_INFINITY) - (a.market_avg ?? Number.NEGATIVE_INFINITY),
      )[0];

      return {
        ...box,
        case_market_avg: selectedCase?.market_avg ?? null,
      };
    });
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
      const key = setKey(item);
      if (seenSets.has(key)) return false;
      seenSets.add(key);
      return true;
    })
    .slice(0, limit);
}

export function rankBoosterBoxesByTotalSetValue<T extends ValuedBoosterBoxCandidate>(
  items: T[],
  limit = 5,
) {
  const seenSets = new Set<string>();

  return [...items]
    .filter((item) =>
      item.product_type === "booster_box"
      && Number.isFinite(item.total_set_value)
      && item.total_set_value > 0,
    )
    .sort((a, b) =>
      b.total_set_value - a.total_set_value
      || a.name.localeCompare(b.name),
    )
    .filter((item) => {
      const key = setKey(item);
      if (seenSets.has(key)) return false;
      seenSets.add(key);
      return true;
    })
    .slice(0, limit);
}

export function sealedValueMultiple(
  totalSetValue: number | null | undefined,
  boosterBoxPrice: number | null | undefined,
) {
  if (
    totalSetValue == null
    || boosterBoxPrice == null
    || !Number.isFinite(totalSetValue)
    || !Number.isFinite(boosterBoxPrice)
    || totalSetValue <= 0
    || boosterBoxPrice <= 0
  ) {
    return null;
  }

  return totalSetValue / boosterBoxPrice;
}

const SET_IMAGE_PRODUCT_PRIORITY: Record<string, number> = {
  booster_box: 0,
  starter_deck_display: 1,
  starter_deck: 2,
  collection: 3,
  deck_set: 4,
  display: 5,
  bundle: 6,
};

export function representativeSealedImageBySet(items: SealedImageCandidate[]) {
  const imageBySetId = new Map<string, string>();
  const ranked = [...items]
    .filter((item) => item.set_id != null)
    .map((item) => ({
      ...item,
      resolvedImage: item.image_url ?? tcgPlayerProductImageUrl(item.tcg_product_id),
      priority: SET_IMAGE_PRODUCT_PRIORITY[item.product_type ?? ""] ?? 99,
    }))
    .filter((item) => item.resolvedImage != null)
    .sort((a, b) =>
      a.priority - b.priority
      || (b.market_avg ?? Number.NEGATIVE_INFINITY) - (a.market_avg ?? Number.NEGATIVE_INFINITY),
    );

  for (const item of ranked) {
    if (item.set_id && item.resolvedImage && !imageBySetId.has(item.set_id)) {
      imageBySetId.set(item.set_id, item.resolvedImage);
    }
  }

  return imageBySetId;
}
