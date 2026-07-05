/** Raw-vs-graded eBay sale averages and grade parsing. Kept as a pure module
 *  so the logic is unit-testable — a PSA 10 blended into a raw average would
 *  skew it badly, so the two populations must never mix. */

/** Graders recognized in listing titles. ARS is the Japanese grading house
 *  (titles often read "ARS10" with no space — the pattern allows it). */
export const KNOWN_GRADERS = [
  "PSA",
  "BGS",
  "CGC",
  "SGC",
  "TAG",
  "ACE",
  "ARS",
] as const;

// Grade is 1–10 in half steps; "10.0" normalizes to 10. The trailing \b
// rejects run-ons like "PSA 100".
const GRADE_PATTERN = new RegExp(
  `\\b(${KNOWN_GRADERS.join("|")})\\s*[- ]?\\s*(10(?:\\.0)?|\\d(?:\\.5)?)\\b`,
  "i"
);

export interface ParsedGrade {
  grader: string | null;
  grade: number | null;
  sale_type: string;
}

// Extract grader + numeric grade from a listing title, e.g.
//   "2023 PSA 10 Monkey D Luffy OP01-024"   → { grader: "PSA", grade: 10 }
//   "One Piece BGS 9.5 Shanks Manga Rare"    → { grader: "BGS", grade: 9.5 }
//   "Luffy OP01-024 Alt Art NM"              → { grader: null, grade: null }
export function parseGrade(title: string): ParsedGrade {
  const match = title.match(GRADE_PATTERN);
  if (match) {
    return {
      grader: match[1].toUpperCase(),
      grade: Number(match[2]),
      sale_type: "graded",
    };
  }
  return { grader: null, grade: null, sale_type: "raw" };
}

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
