/** Raw-vs-graded eBay sale averages. Kept as a pure module so the split
 *  logic is unit-testable — a PSA 10 blended into a raw average would skew
 *  it badly, so the two populations must never mix. */

export interface EbaySaleForStats {
  sale_price: number | null;
  sale_type: string | null;
  grader: string | null;
}

export interface EbayAvgStats {
  rawAvg: number | null;
  rawCount: number;
  gradedAvg: number | null;
  gradedCount: number;
}

/** A sale counts as graded when the sync tagged it, or when a grader was
 *  parsed from the title (older rows predate the sale_type column). */
export function isGradedSale(sale: Pick<EbaySaleForStats, "sale_type" | "grader">): boolean {
  return sale.sale_type === "graded" || sale.grader != null;
}

export function computeEbayAvgStats(rows: EbaySaleForStats[]): EbayAvgStats {
  let rawSum = 0;
  let rawCount = 0;
  let gradedSum = 0;
  let gradedCount = 0;

  for (const row of rows) {
    const price = row.sale_price;
    if (price == null || !isFinite(price) || price <= 0) continue;
    if (isGradedSale(row)) {
      gradedSum += price;
      gradedCount += 1;
    } else {
      rawSum += price;
      rawCount += 1;
    }
  }

  return {
    rawAvg: rawCount > 0 ? rawSum / rawCount : null,
    rawCount,
    gradedAvg: gradedCount > 0 ? gradedSum / gradedCount : null,
    gradedCount,
  };
}
