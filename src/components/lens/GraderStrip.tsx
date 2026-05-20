import type { TagCategory } from "@/lib/centering-math";
import { gradeTierAccentStyleForGrade, graderResultsFromFaces } from "./grading";

type GraderStripProps = {
  worstMax?: number;
  frontWorstMax?: number;
  backWorstMax?: number | null;
  category?: TagCategory;
};

export default function GraderStrip({
  worstMax,
  frontWorstMax,
  backWorstMax = null,
  category = "tcg",
}: GraderStripProps) {
  const front = frontWorstMax ?? worstMax;
  if (typeof front !== "number") return null;

  const results = graderResultsFromFaces({
    front: { worstMax: front },
    back: typeof backWorstMax === "number" ? { worstMax: backWorstMax } : null,
    category,
  });

  return (
    <div className="mt-3">
      <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-text-2">
        Also reads as
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {results.map((result) => (
          <div
            key={result.name}
            className="rounded-md border px-3 py-3 text-center"
            style={gradeTierAccentStyleForGrade(result.ceiling)}
          >
            <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-2">
              {result.name}
            </div>
            <div className="mt-1.5 font-mono text-[22px] font-bold leading-none">{result.value}</div>
            {result.subLabel && <div className="mt-1.5 font-mono text-[11px] leading-tight text-text-2">{result.subLabel}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
