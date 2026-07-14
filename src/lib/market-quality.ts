export const MIN_MOVEMENT_CARD_PRICE_USD = 20;

/** Low-dollar cards create noisy percentage swings that are not useful market signals. */
export function isMeaningfulMovementPrice(price: number | null | undefined): boolean {
  return price != null && Number.isFinite(price) && price >= MIN_MOVEMENT_CARD_PRICE_USD;
}

// Some legacy Scrapingdog eBay rows were persisted in milli-dollars while
// ordinary rows were stored in dollars. The corrupted rows are extreme
// outliers (100,000+), so normalize only that range and leave legitimate
// four-figure sales untouched.
const LEGACY_EBAY_MILLI_DOLLAR_THRESHOLD = 100_000;

export function normalizeEbaySalePrice(price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return price >= LEGACY_EBAY_MILLI_DOLLAR_THRESHOLD ? price / 1_000 : price;
}

/** eBay sales always render as full USD amounts; never abbreviate with K. */
export function formatEbaySalePrice(price: number | null | undefined): string {
  const normalized = normalizeEbaySalePrice(price);
  if (normalized == null) return "—";
  return `$${normalized.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}