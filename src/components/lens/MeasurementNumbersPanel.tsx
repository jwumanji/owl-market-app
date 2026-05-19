"use client";

import { type ComputedCenteringMeasurement, type OverlayGeometry, type PsaGrade } from "@/lib/centering-math";
import { AxisRatioValue } from "./AxisRatioCard";
import FreeCornersToggle from "./FreeCornersToggle";
import GraderStrip from "./GraderStrip";
import {
  axisTone,
  bareGradeLabel,
  graderResultsFromFaces,
  measurementTone,
  TINTED_TONE_CLASSES,
  TONE_TEXT_CLASSES,
  type GraderResult,
} from "./grading";
import type { LensFace, LensFaceState } from "./lens-types";

type MeasurementNumbersPanelProps = {
  activeFace: LensFace;
  faces: Partial<Record<LensFace, LensFaceState>>;
  measurements: Partial<Record<LensFace, ComputedCenteringMeasurement>>;
  freeCorners: boolean;
  adjusted: boolean;
  mode?: "review" | "edit";
  showAddBack?: boolean;
  saveLabel?: string;
  resetLabel?: string;
  saving?: boolean;
  onFreeCornersChange: (enabled: boolean) => void;
  onAddBack?: () => void;
  onSave: () => void;
  onReset: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function polygonPoints(corners: OverlayGeometry["outer"]) {
  return `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;
}

function OverlayPreview({ faceState }: { faceState: LensFaceState }) {
  const { overlay, imageSize, imageUrl } = faceState;

  return (
    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-void">
      <svg viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} className="h-full w-full">
        {imageUrl ? (
          <image href={imageUrl} x="0" y="0" width={imageSize.width} height={imageSize.height} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <rect x="0" y="0" width={imageSize.width} height={imageSize.height} fill="var(--deep)" />
        )}
        <polygon points={polygonPoints(overlay.outer)} fill="none" stroke="var(--owl)" strokeWidth="6" strokeDasharray="6 8" />
        <polygon points={polygonPoints(overlay.inner)} fill="none" stroke="var(--green)" strokeWidth="6" strokeDasharray="6 8" />
      </svg>
    </div>
  );
}

function FaceMeasurementCard({
  face,
  faceState,
  measurement,
  active,
  showWorst,
  isWorst,
}: {
  face: LensFace;
  faceState: LensFaceState;
  measurement: ComputedCenteringMeasurement;
  active: boolean;
  showWorst: boolean;
  isWorst: boolean;
}) {
  const tone = measurementTone(measurement, face);
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);
  const worstAxis = measurement.worstAxis === "leftRight" ? "L/R" : "T/B";
  const cardClass = active
    ? "border-owl/40 bg-owl/10 shadow-[0_0_0_1px_rgba(232,160,32,0.16)]"
    : TINTED_TONE_CLASSES[tone];

  return (
    <div className={`relative rounded-lg border p-3 ${cardClass}`}>
      {showWorst && isWorst && (
        <span className="absolute right-2 top-2 rounded border border-owl/40 bg-owl/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-owl">
          worst
        </span>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-3">
        <div className="min-w-0">
          <div className={`font-mono text-[10px] font-bold uppercase tracking-widest text-text-2 ${showWorst && isWorst ? "pr-14" : ""}`}>
            {face}
          </div>
          <div className="mt-2 space-y-1.5">
            <AxisRatioValue
              firstLabel="L"
              firstValue={measurement.leftPct}
              secondLabel="R"
              secondValue={measurement.rightPct}
              tone={leftRightTone}
            />
            <AxisRatioValue
              firstLabel="T"
              firstValue={measurement.topPct}
              secondLabel="B"
              secondValue={measurement.bottomPct}
              tone={topBottomTone}
            />
          </div>
          <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">
            Worst axis
            <span className={`ml-2 ${TONE_TEXT_CLASSES[tone]}`}>
              {worstAxis} @ {measurement.worstAxisMaxPct}%
            </span>
          </div>
        </div>
        <OverlayPreview faceState={faceState} />
      </div>
    </div>
  );
}

function AddBackCard({ onAddBack }: { onAddBack?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-owl/40 bg-owl/10 p-3">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-owl">Back</div>
      <p className="mt-2 text-xs leading-5 text-text-2">
        Add the back of this card for a more accurate combined ceiling.
      </p>
      <button
        type="button"
        onClick={onAddBack}
        disabled={!onAddBack}
        className="mt-3 w-full rounded-md border border-owl/40 bg-owl px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-not-allowed disabled:opacity-45"
      >
        + Add back image
      </button>
    </div>
  );
}

export default function MeasurementNumbersPanel({
  activeFace,
  faces,
  measurements,
  freeCorners,
  adjusted,
  mode = "review",
  showAddBack = false,
  saveLabel,
  resetLabel,
  saving = false,
  onFreeCornersChange,
  onAddBack,
  onSave,
  onReset,
  onCancel,
  onDelete,
}: MeasurementNumbersPanelProps) {
  const activeMeasurement = measurements[activeFace];
  const frontMeasurement = measurements.front ?? activeMeasurement;
  const backMeasurement = measurements.front ? measurements.back ?? null : null;
  const hasBack = Boolean(measurements.back);

  if (!activeMeasurement || !frontMeasurement) {
    return (
      <aside className="rounded-lg border border-border bg-surface p-4 text-sm text-text-2">
        Measurement unavailable.
      </aside>
    );
  }

  const graderResults = graderResultsFromFaces({
    front: { worstMax: frontMeasurement.worstAxisMaxPct },
    back: backMeasurement ? { worstMax: backMeasurement.worstAxisMaxPct } : null,
  });
  const psaResult = graderResults[0] as GraderResult<PsaGrade>;
  const combinedTone = psaResult.tone;
  const combinedCeiling = psaResult.ceiling;
  const combinedFace: LensFace = psaResult.breakdown.back &&
    psaResult.ceiling === psaResult.breakdown.back.ceiling &&
    (psaResult.breakdown.front.ceiling !== psaResult.breakdown.back.ceiling ||
      psaResult.breakdown.back.worstMax > psaResult.breakdown.front.worstMax)
    ? "back"
    : "front";
  const primaryLabel = saveLabel ?? (hasBack ? "Save both faces" : "Save measurement");
  const secondaryLabel = resetLabel ?? `Reset ${activeFace}`;
  const showWorst = Boolean(measurements.front && measurements.back);

  return (
    <aside className="flex flex-col gap-2.5">
      <div className={`rounded-lg border p-4 text-center ${TINTED_TONE_CLASSES[combinedTone]}`}>
        <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-text-2">
          Combined ceiling
        </div>
        <div className="mt-1 font-mono text-[34px] font-bold leading-none">
          {bareGradeLabel(combinedCeiling)}
        </div>
        <div className="mt-1 font-mono text-[10px] text-text-2">
          {hasBack ? "worse of front · back" : "front only (back not measured)"}
        </div>
        <GraderStrip
          frontWorstMax={frontMeasurement.worstAxisMaxPct}
          backWorstMax={backMeasurement?.worstAxisMaxPct ?? null}
        />
      </div>

      <div className="space-y-2">
        {(["front", "back"] as LensFace[]).map((face) => {
          const faceState = faces[face];
          const measurement = measurements[face];

          if (!faceState || !measurement) {
            if (face === "back" && showAddBack) return <AddBackCard key={face} onAddBack={onAddBack} />;
            return null;
          }

          return (
            <FaceMeasurementCard
              key={face}
              face={face}
              faceState={faceState}
              measurement={measurement}
              active={face === activeFace}
              showWorst={showWorst}
              isWorst={combinedFace === face}
            />
          );
        })}
      </div>

      <FreeCornersToggle enabled={freeCorners} onChange={onFreeCornersChange} />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
          className="rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Saving..." : primaryLabel}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!adjusted || saving}
          className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:bg-surf2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-transparent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text-2 transition-colors hover:text-text"
        >
          Cancel
        </button>
        {mode === "edit" && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-transparent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-loss transition-colors hover:border-loss/40 hover:bg-loss/10"
          >
            Delete pre-grade
          </button>
        )}
      </div>
    </aside>
  );
}
