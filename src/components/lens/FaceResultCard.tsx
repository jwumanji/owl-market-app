import { ceilingFromWorstMax, type ComputedCenteringMeasurement, type OverlayGeometry } from "@/lib/centering-math";
import AxisRatioCard from "./AxisRatioCard";
import { axisTone, bareGradeLabel, measurementTone, TINTED_TONE_CLASSES } from "./grading";

type FaceResultCardProps = {
  face: "front" | "back";
  measurement: ComputedCenteringMeasurement;
  overlay?: OverlayGeometry | null;
  imageUrl?: string | null;
  isWorst?: boolean;
};

function polygonPoints(corners: OverlayGeometry["outer"]) {
  return `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;
}

export default function FaceResultCard({
  face,
  measurement,
  overlay,
  imageUrl,
  isWorst = false,
}: FaceResultCardProps) {
  const tone = measurementTone(measurement);
  const ceiling = bareGradeLabel(ceilingFromWorstMax(measurement.worstAxisMaxPct));
  const worstAxis = measurement.worstAxis === "leftRight" ? "L/R" : "T/B";
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">{face}</span>
        <span className={`rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold ${TINTED_TONE_CLASSES[tone]}`}>
          {ceiling}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <AxisRatioCard
          label="L / R"
          firstLabel="L"
          firstValue={measurement.leftPct}
          secondLabel="R"
          secondValue={measurement.rightPct}
          tone={leftRightTone}
        />
        <AxisRatioCard
          label="T / B"
          firstLabel="T"
          firstValue={measurement.topPct}
          secondLabel="B"
          secondValue={measurement.bottomPct}
          tone={topBottomTone}
        />
      </div>
      <div className="mt-3 font-mono text-[11px] text-text-2">
        Worst: {worstAxis} @ {measurement.worstAxisMaxPct}%{isWorst && <span className="ml-2 text-owl">← worst</span>}
      </div>
      {overlay && (
        <div className="mt-4 overflow-hidden rounded-md border border-border bg-void">
          <svg viewBox="0 0 420 580" className="h-36 w-full">
            {imageUrl && <image href={imageUrl} width="420" height="580" preserveAspectRatio="xMidYMid meet" />}
            <polygon points={polygonPoints(overlay.outer)} fill="none" stroke="var(--owl)" strokeWidth="4" />
            <polygon points={polygonPoints(overlay.inner)} fill="none" stroke="var(--green)" strokeWidth="4" />
          </svg>
        </div>
      )}
    </article>
  );
}
