export type DatedPrice = {
  price: number;
  price_date: string;
};

const DAY_MS = 86_400_000;

function utcDay(value: Date | string) {
  if (value instanceof Date) {
    return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / DAY_MS);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

export function historicalPriceChange(
  currentPrice: number,
  rows: DatedPrice[],
  days: number,
  now: Date,
) {
  const currentDay = utcDay(now);
  if (currentDay == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const targetDay = currentDay - days;
  const toleranceDays = days === 1 ? 0 : 2;
  const closest = rows
    .flatMap((row) => {
      const rowDay = utcDay(row.price_date);
      const price = Number(row.price);
      if (rowDay == null || !Number.isFinite(price) || price <= 0) return [];
      return [{ row, rowDay, distance: Math.abs(rowDay - targetDay) }];
    })
    .filter(({ distance }) => distance <= toleranceDays)
    .sort((a, b) => a.distance - b.distance || Number(a.rowDay > targetDay) - Number(b.rowDay > targetDay))[0]?.row;

  if (!closest) return null;
  return +(((currentPrice - Number(closest.price)) / Number(closest.price)) * 100).toFixed(2);
}
