import { ceilingFromWorstMax, type ComputedCenteringMeasurement } from "@/lib/centering-math";

export type GraderTone = "gain" | "owl" | "loss";

export type GraderResult = {
  name: "PSA" | "BGS" | "TAG";
  value: string;
  subLabel?: string;
  tone: GraderTone;
};

export const TINTED_TONE_CLASSES: Record<GraderTone, string> = {
  gain: "tinted-gain text-gain",
  owl: "tinted-owl text-owl",
  loss: "tinted-loss text-loss",
};

export const TONE_TEXT_CLASSES: Record<GraderTone, string> = {
  gain: "text-gain",
  owl: "text-owl",
  loss: "text-loss",
};

export function toneFromWorstMax(worstMax: number): GraderTone {
  if (worstMax <= 55) return "gain";
  if (worstMax <= 60) return "owl";
  return "loss";
}

export function axisTone(firstPct: number, secondPct: number): GraderTone {
  return toneFromWorstMax(Math.max(firstPct, secondPct));
}

export function bareGradeLabel(psaCeiling: ReturnType<typeof ceilingFromWorstMax>) {
  if (psaCeiling === "PSA_10") return "10";
  if (psaCeiling === "PSA_9") return "9";
  if (psaCeiling === "PSA_8") return "8";
  if (psaCeiling === "PSA_7") return "7";
  return "≤6";
}

export function graderResultsFromWorstMax(worstMax: number): GraderResult[] {
  const tone = toneFromWorstMax(worstMax);

  if (worstMax <= 51) {
    return [
      { name: "PSA", value: "10", tone },
      { name: "BGS", value: "10", subLabel: "Pristine", tone },
      { name: "TAG", value: "10", subLabel: "Pristine ≥990", tone },
    ];
  }

  if (worstMax <= 55) {
    return [
      { name: "PSA", value: "10", tone },
      { name: "BGS", value: "9.5", subLabel: "Gem Mint", tone: "owl" },
      { name: "TAG", value: "10", subLabel: "Gem Mint 950-989", tone },
    ];
  }

  if (worstMax <= 60) {
    return [
      { name: "PSA", value: "9", tone },
      { name: "BGS", value: "9", subLabel: "Mint", tone },
      { name: "TAG", value: "9", subLabel: "Mint 900-949", tone },
    ];
  }

  if (worstMax <= 65) {
    return [
      { name: "PSA", value: "8", tone },
      { name: "BGS", value: "8.5", subLabel: "NM-MT+", tone },
      { name: "TAG", value: "8", subLabel: "NM-MT 800-899", tone },
    ];
  }

  if (worstMax <= 70) {
    return [
      { name: "PSA", value: "7", tone },
      { name: "BGS", value: "8", subLabel: "NM-MT", tone },
      { name: "TAG", value: "7", subLabel: "NM 700-799", tone },
    ];
  }

  return [
    { name: "PSA", value: "≤6", tone },
    { name: "BGS", value: "≤7.5", tone },
    { name: "TAG", value: "≤6", tone },
  ];
}

export function measurementTone(measurement: ComputedCenteringMeasurement) {
  return toneFromWorstMax(measurement.worstAxisMaxPct);
}
