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
// rejects run-ons like "PSA 100". Label words may sit between grader and
// number ("TAG Pristine 10", "BGS Black Label 10") — the optional middle
// group steps over them.
const GRADE_PATTERN = new RegExp(
  `\\b(${KNOWN_GRADERS.join("|")})\\s*[- ]?\\s*(?:(?:PRISTINE|BLACK\\s*LABEL|BL)\\s*[- ]?\\s*)?(10(?:\\.0)?|\\d(?:\\.5)?)\\b`,
  "i"
);

/** Grade tiers, best first. Plain 10s split by grader — a PSA 10 and a
 *  BGS 10 are different markets; CGC/SGC/TAG/ACE/ARS 10s pool as OTHER_10
 *  (too thin to stand alone). Sub-9 grades belong to no tier — they trade
 *  in their own long tail and would drag every average they touched. */
export const GRADE_TIERS = [
  "BLACK_LABEL",
  "PRISTINE_10",
  "PSA_10",
  "BGS_10",
  "OTHER_10",
  "GRADE_9",
] as const;

export type GradeTier = (typeof GRADE_TIERS)[number];

export const GRADE_TIER_LABELS: Record<GradeTier, string> = {
  BLACK_LABEL: "Black Label",
  PRISTINE_10: "Pristine 10",
  PSA_10: "PSA 10",
  BGS_10: "BGS 10",
  OTHER_10: "Other Grader 10",
  GRADE_9: "Grade 9–9.5",
};

export function gradeLabelForTier(tier: GradeTier | null): string | null {
  return tier ? GRADE_TIER_LABELS[tier] : null;
}

export interface ParsedGrade {
  grader: string | null;
  grade: number | null;
  sale_type: string;
  tier: GradeTier | null;
}

function hasBlackLabel(title: string): boolean {
  return /black\s*label/i.test(title);
}

function tierForTenByGrader(grader: string | null): GradeTier {
  if (grader === "PSA") return "PSA_10";
  if (grader === "BGS") return "BGS_10";
  return "OTHER_10";
}

function tierForTitle(title: string, grader: string, grade: number): GradeTier | null {
  // Black Label outranks Pristine when both appear — it's the stricter claim.
  // "BL" is kept uppercase-only and BGS-scoped so ordinary words can't match.
  if (hasBlackLabel(title) || (grader === "BGS" && /\bBL\b/.test(title))) {
    return "BLACK_LABEL";
  }
  // Pristine needs the grader+grade parse to have succeeded (we're inside
  // that branch) — bare "pristine condition" puffery on raw listings must
  // not mint a graded tier.
  if (/pristine/i.test(title)) return "PRISTINE_10";
  if (grade === 10) return tierForTenByGrader(grader);
  if (grade >= 9) return "GRADE_9";
  return null;
}

// Extract grader + numeric grade + tier from a listing title, e.g.
//   "2023 PSA 10 Monkey D Luffy OP01-024" → { grader: "PSA", grade: 10, tier: "PSA_10" }
//   "BGS 10 Black Label Shanks"           → { grader: "BGS", grade: 10, tier: "BLACK_LABEL" }
//   "Pristine TAG 10 Zoro OP01-025"       → { grader: "TAG", grade: 10, tier: "PRISTINE_10" }
//   "Luffy OP01-024 Alt Art NM"           → { grader: null, grade: null, tier: null }
export function parseGrade(title: string): ParsedGrade {
  const match = title.match(GRADE_PATTERN);
  if (match) {
    const grader = match[1].toUpperCase();
    const grade = Number(match[2]);
    return {
      grader,
      grade,
      sale_type: "graded",
      tier: tierForTitle(title, grader, grade),
    };
  }
  // "Black Label" is BGS-exclusive and definitionally a 10, so it classifies
  // even when the title never spells out "BGS 10" (real listings do this:
  // "... Low Pop Black Label"). Without it such sales would pollute the raw
  // average with Black Label prices.
  if (hasBlackLabel(title)) {
    return { grader: "BGS", grade: 10, sale_type: "graded", tier: "BLACK_LABEL" };
  }
  return { grader: null, grade: null, sale_type: "raw", tier: null };
}

export interface EbaySaleForStats {
  sale_price: number | null;
  sale_type: string | null;
  grader: string | null;
  grade?: number | null;
  title?: string | null;
}

export interface TierStat {
  avg: number | null;
  count: number;
}

export interface EbayAvgStats {
  rawAvg: number | null;
  rawCount: number;
  tiers: Record<GradeTier, TierStat>;
}

/** A sale counts as graded when the sync tagged it, or when a grader was
 *  parsed from the title (older rows predate the sale_type column). */
export function isGradedSale(sale: Pick<EbaySaleForStats, "sale_type" | "grader">): boolean {
  return sale.sale_type === "graded" || sale.grader != null;
}

/** Tier for a stored sale row. The title is authoritative (labels like
 *  Black Label / Pristine only exist there, and stored columns may predate
 *  the current parser); rows without a parseable title fall back to the
 *  stored numeric grade, where labels are unknowable. */
export function saleTier(sale: EbaySaleForStats): GradeTier | null {
  if (sale.title) {
    const parsed = parseGrade(sale.title);
    if (parsed.sale_type === "graded") return parsed.tier;
  }
  if (!isGradedSale(sale)) return null;
  const grade = sale.grade == null ? null : Number(sale.grade);
  if (grade === 10) return tierForTenByGrader(sale.grader);
  if (grade != null && grade >= 9 && grade < 10) return "GRADE_9";
  return null;
}

/** Graded-ness for stats bucketing: the title re-parse wins (it sees labels
 *  and post-hoc parser fixes the stored columns may lack), stored fields
 *  cover title-less rows. */
function saleIsGraded(sale: EbaySaleForStats): boolean {
  if (sale.title && parseGrade(sale.title).sale_type === "graded") return true;
  return isGradedSale(sale);
}

export function computeEbayAvgStats(rows: EbaySaleForStats[]): EbayAvgStats {
  let rawSum = 0;
  let rawCount = 0;
  const tierSums = new Map<GradeTier, number>();
  const tierCounts = new Map<GradeTier, number>();

  for (const row of rows) {
    const price = row.sale_price;
    if (price == null || !isFinite(price) || price <= 0) continue;
    if (saleIsGraded(row)) {
      // Sub-9 graded sales land in no bucket: not raw, not a tier.
      const tier = saleTier(row);
      if (tier) {
        tierSums.set(tier, (tierSums.get(tier) ?? 0) + price);
        tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
      }
    } else {
      rawSum += price;
      rawCount += 1;
    }
  }

  const tiers = Object.fromEntries(
    GRADE_TIERS.map((tier) => {
      const count = tierCounts.get(tier) ?? 0;
      return [tier, { avg: count > 0 ? (tierSums.get(tier) ?? 0) / count : null, count }];
    })
  ) as Record<GradeTier, TierStat>;

  return {
    rawAvg: rawCount > 0 ? rawSum / rawCount : null,
    rawCount,
    tiers,
  };
}
