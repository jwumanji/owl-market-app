export type RarityMarketCard = {
  avg?: number | string | null;
  tcg?: number | string | null;
  name?: string | null;
};

function positiveNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Canonical value used by rarity rankings and rarity-index totals.
 * Average market is the user-facing value; TCGPlayer market is only a fallback
 * when an average is unavailable.
 */
export function rarityMarketPrice(card: RarityMarketCard) {
  return positiveNumber(card.avg) || positiveNumber(card.tcg);
}

export function rankRarityCards<T extends RarityMarketCard>(cards: readonly T[]) {
  return [...cards].sort((a, b) => {
    const byMarketPrice = rarityMarketPrice(b) - rarityMarketPrice(a);
    if (byMarketPrice !== 0) return byMarketPrice;

    const byTcgPrice = positiveNumber(b.tcg) - positiveNumber(a.tcg);
    if (byTcgPrice !== 0) return byTcgPrice;

    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}
