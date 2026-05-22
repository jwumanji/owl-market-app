/** Format price: '$1,234.56', '$1.2K' for 1000+, '—' for null/undefined */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "—";
  if (price >= 1000) {
    return `$${(price / 1000).toFixed(1)}K`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format percent change: '+8.2%' or '-3.1%', '—' for null */
export function formatPct(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Return Tailwind color class based on percent change.
 *  Zero / null / undefined → neutral (ink-3), NOT green. */
export function pctColor(pct: number | null | undefined): string {
  if (pct == null) return "text-ink-3";
  if (pct > 0) return "text-gain-2";
  if (pct < 0) return "text-loss-2";
  return "text-ink-3";
}

/** Human-readable time ago: '5m ago', '2h ago', '3d ago' */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const now = Date.now();
  const then = new Date(date).getTime();
  const secs = Math.floor((now - then) / 1000);

  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Calculate spread % between a sale price and an average price */
export function spreadPct(
  salePrice: number | null | undefined,
  avgPrice: number | null | undefined
): number | null {
  if (salePrice == null || avgPrice == null || avgPrice === 0) return null;
  return ((salePrice - avgPrice) / avgPrice) * 100;
}
