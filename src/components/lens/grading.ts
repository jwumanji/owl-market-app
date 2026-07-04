import {
  bgsCeilingBack,
  bgsCeilingFront,
  combinedCeiling,
  gradeRank,
  isPsaFrontTenBorderline,
  PSA_FRONT_TEN,
  psaCeilingBack,
  psaCeilingFront,
  tagCeilingBack,
  tagCeilingFront,
  type BgsGrade,
  type ComputedCenteringMeasurement,
  type GraderGrade,
  type PsaCeiling,
  type PsaGrade,
  type TagCategory,
  type TagGrade,
} from "@/lib/centering-math";

export type GraderTone = "gain" | "owl" | "loss";

export type GraderFaceInput = {
  worstMax: number;
};

export type GraderFacesInput = {
  front: GraderFaceInput;
  back?: GraderFaceInput | null;
  category?: TagCategory;
};

export type GraderFaceBreakdown<TGrade extends GraderGrade = GraderGrade> = {
  ceiling: TGrade;
  value: string;
  subLabel?: string;
  tone: GraderTone;
  worstMax: number;
};

export type GraderResult<TGrade extends GraderGrade = GraderGrade> = {
  name: "PSA" | "BGS" | "TAG";
  ceiling: TGrade;
  value: string;
  subLabel?: string;
  tone: GraderTone;
  frontOnly: boolean;
  breakdown: {
    front: GraderFaceBreakdown<TGrade>;
    back: GraderFaceBreakdown<TGrade> | null;
  };
};

// The tone scale lives entirely on the grade-band tokens so the Result screen uses one green and
// one red everywhere: gain → --grade-10, loss → --grade-low, and the `owl` borderline tone →
// --grade-8b. `owl` is the PSA-10 borderline band (toneFromWorstMax → PSA_FRONT_TEN), so the
// borderline amber and the threshold logic share one source and can't drift.
export const TINTED_TONE_CLASSES: Record<GraderTone, string> = {
  gain: "tinted-gain text-grade-10",
  owl: "tinted-owl text-grade-8b",
  loss: "tinted-loss text-grade-low",
};

export const TONE_TEXT_CLASSES: Record<GraderTone, string> = {
  gain: "text-grade-10",
  owl: "text-grade-8b",
  loss: "text-grade-low",
};

// Maps a numeric grade to the Owl Lens band scale (--grade-*). Single source of color for grade
// badges, per-grader chips, and history pills. Color only — never feeds the centering math.
export function gradeTierColor(grade: number) {
  if (!Number.isFinite(grade)) return "var(--grade-low)";
  if (grade >= 10) return "var(--grade-10)";
  if (grade >= 9) return "var(--grade-9)";
  if (grade >= 8.5) return "var(--grade-8b)";
  if (grade >= 8) return "var(--grade-8)";
  if (grade >= 7) return "var(--grade-7)";
  return "var(--grade-low)";
}

export function gradeTierColorFromLabel(label: string) {
  const match = label.match(/\d+(?:\.\d+)?/);
  return gradeTierColor(match ? Number(match[0]) : 0);
}

export function gradeTierColorForGrade(grade: GraderGrade) {
  return gradeTierColor(gradeRank(grade));
}

export function gradeTierAccentStyle(color: string) {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
    borderColor: color,
    color,
  };
}

export function gradeTierAccentStyleFromLabel(label: string) {
  return gradeTierAccentStyle(gradeTierColorFromLabel(label));
}

export function gradeTierAccentStyleForGrade(grade: GraderGrade) {
  return gradeTierAccentStyle(gradeTierColorForGrade(grade));
}

export function toneFromWorstMax(worstMax: number): GraderTone {
  if (worstMax <= PSA_FRONT_TEN.confidentMaxPct) return "gain";
  if (worstMax <= PSA_FRONT_TEN.borderlineMaxPct) return "owl";
  return "loss";
}

/**
 * Amber "varies" note for the combined ceiling when the only thing keeping a
 * card off a PSA 10 is borderline front centering (worst side 55–60). Returns
 * null unless the headline actually lands on PSA 9 because of that band, so we
 * never imply 10 upside that the back — or another axis — has already ruled out.
 */
export function psaTenBorderlineNote(
  frontWorstMax: number,
  combinedPsaCeiling: PsaGrade
): string | null {
  if (combinedPsaCeiling === "PSA_9" && isPsaFrontTenBorderline(frontWorstMax)) {
    return "Possible 10 · likely 9 · grader-dependent";
  }
  return null;
}

export function toneFromGrade(grade: GraderGrade): GraderTone {
  const rank = gradeRank(grade);
  if (rank >= 10) return "gain";
  if (rank >= 9) return "owl";
  return "loss";
}

export function axisTone(firstPct: number, secondPct: number): GraderTone {
  return toneFromWorstMax(Math.max(firstPct, secondPct));
}

export function bareGradeLabel(psaCeiling: PsaCeiling) {
  if (psaCeiling === "PSA_10") return "10";
  if (psaCeiling === "PSA_9") return "9";
  if (psaCeiling === "PSA_8") return "8";
  if (psaCeiling === "PSA_7") return "7";
  if (psaCeiling === "PSA_6") return "6";
  if (psaCeiling === "PSA_5") return "5";
  if (psaCeiling === "PSA_4") return "4";
  if (psaCeiling === "PSA_3_OR_LESS") return "≤3";
  if (psaCeiling === "PSA_2_OR_LESS") return "≤2";
  return "≤6";
}

function bgsLabel(grade: BgsGrade) {
  if (grade === "BGS_10") return "10";
  if (grade === "BGS_9_5") return "9.5";
  if (grade === "BGS_9") return "9";
  if (grade === "BGS_8_5") return "8.5";
  if (grade === "BGS_8") return "8";
  if (grade === "BGS_7_5") return "7.5";
  if (grade === "BGS_7") return "7";
  if (grade === "BGS_6_5") return "6.5";
  return "≤6";
}

function bgsSubLabel(grade: BgsGrade) {
  if (grade === "BGS_10") return "Pristine";
  if (grade === "BGS_9_5") return "Gem Mint";
  if (grade === "BGS_9") return "Mint";
  return undefined;
}

function tagLabel(grade: TagGrade) {
  if (grade === "TAG_10_PRISTINE" || grade === "TAG_10_GEM_MINT") return "10";
  if (grade === "TAG_9") return "9";
  if (grade === "TAG_8") return "8";
  if (grade === "TAG_7") return "7";
  if (grade === "TAG_6") return "6";
  if (grade === "TAG_5") return "5";
  if (grade === "TAG_7_OR_LESS") return "≤7";
  if (grade === "TAG_6_OR_LESS") return "≤6";
  return "≤4";
}

function tagSubLabel(grade: TagGrade) {
  if (grade === "TAG_10_PRISTINE") return "Pristine ≥990";
  if (grade === "TAG_10_GEM_MINT") return "Gem Mint 950-989";
  if (grade === "TAG_9") return "Mint 900-949";
  if (grade === "TAG_8") return "NM-MT 800-899";
  if (grade === "TAG_7") return "NM 700-799";
  if (grade === "TAG_6") return "EX-MT 600-699";
  if (grade === "TAG_5") return "EX 500-599";
  return undefined;
}

function faceBreakdown<TGrade extends GraderGrade>(
  ceiling: TGrade,
  worstMax: number,
  label: (grade: TGrade) => string,
  subLabel: (grade: TGrade) => string | undefined
): GraderFaceBreakdown<TGrade> {
  return {
    ceiling,
    value: label(ceiling),
    subLabel: subLabel(ceiling),
    tone: toneFromGrade(ceiling),
    worstMax,
  };
}

function resultFromFaces<TGrade extends GraderGrade>({
  name,
  front,
  back,
  label,
  subLabel,
}: {
  name: GraderResult<TGrade>["name"];
  front: GraderFaceBreakdown<TGrade>;
  back: GraderFaceBreakdown<TGrade> | null;
  label: (grade: TGrade) => string;
  subLabel: (grade: TGrade) => string | undefined;
}): GraderResult<TGrade> {
  const combined = combinedCeiling(front.ceiling, back?.ceiling ?? null);
  return {
    name,
    ceiling: combined.ceiling,
    value: label(combined.ceiling),
    subLabel: subLabel(combined.ceiling),
    tone: toneFromGrade(combined.ceiling),
    frontOnly: combined.frontOnly,
    breakdown: {
      front,
      back,
    },
  };
}

export function graderResultsFromFaces({
  front,
  back = null,
  category = "tcg",
}: GraderFacesInput): GraderResult[] {
  const backWorstMax = back?.worstMax ?? null;
  const psaFront = faceBreakdown<PsaGrade>(psaCeilingFront(front.worstMax), front.worstMax, bareGradeLabel, () => undefined);
  const psaBack = backWorstMax === null
    ? null
    : faceBreakdown<PsaGrade>(psaCeilingBack(backWorstMax), backWorstMax, bareGradeLabel, () => undefined);
  const bgsFront = faceBreakdown<BgsGrade>(bgsCeilingFront(front.worstMax), front.worstMax, bgsLabel, bgsSubLabel);
  const bgsBack = backWorstMax === null
    ? null
    : faceBreakdown<BgsGrade>(bgsCeilingBack(backWorstMax), backWorstMax, bgsLabel, bgsSubLabel);
  const tagFront = faceBreakdown<TagGrade>(tagCeilingFront(front.worstMax, category), front.worstMax, tagLabel, tagSubLabel);
  const tagBack = backWorstMax === null
    ? null
    : faceBreakdown<TagGrade>(tagCeilingBack(backWorstMax, category), backWorstMax, tagLabel, tagSubLabel);

  return [
    resultFromFaces({ name: "PSA", front: psaFront, back: psaBack, label: bareGradeLabel, subLabel: () => undefined }),
    resultFromFaces({ name: "BGS", front: bgsFront, back: bgsBack, label: bgsLabel, subLabel: bgsSubLabel }),
    resultFromFaces({ name: "TAG", front: tagFront, back: tagBack, label: tagLabel, subLabel: tagSubLabel }),
  ];
}

export function graderResultsFromWorstMax(worstMax: number): GraderResult[] {
  return graderResultsFromFaces({ front: { worstMax }, back: null });
}

export function measurementTone(measurement: ComputedCenteringMeasurement, face: "front" | "back" = "front") {
  return toneFromGrade(face === "back"
    ? psaCeilingBack(measurement.worstAxisMaxPct)
    : psaCeilingFront(measurement.worstAxisMaxPct));
}
