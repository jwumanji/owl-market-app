export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function flattenPriceStatsCardRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const card = firstRelation(row.cards as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!card) return null;

  const priceStats = { ...row };
  delete priceStats.cards;
  return {
    ...card,
    price_stats: priceStats,
  };
}
