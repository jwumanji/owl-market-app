"use client";

import { ceilingFromWorstMax, computeMeasurements } from "@/lib/centering-math";
import FaceResultCard from "./FaceResultCard";
import GraderStrip from "./GraderStrip";
import ImageOverlayPanel from "./ImageOverlayPanel";
import { bareGradeLabel, measurementTone, TINTED_TONE_CLASSES } from "./grading";
import type { LensFace, LensFaceState, LensMeasuredFace } from "./lens-types";

type ResultsPanelProps = {
  faces: Partial<Record<LensFace, LensFaceState>>;
  cardIdentity?: string | null;
  onDownloadReport: () => void;
  onMeasureAnother: () => void;
};

function measuredFaces(faces: Partial<Record<LensFace, LensFaceState>>) {
  return (["front", "back"] as LensFace[])
    .map((face) => faces[face])
    .filter((face): face is LensFaceState => Boolean(face))
    .map((face) => ({
      ...face,
      measurement: computeMeasurements(face.overlay),
    }));
}

function rank(measuredFace: LensMeasuredFace) {
  const ceiling = ceilingFromWorstMax(measuredFace.measurement.worstAxisMaxPct);
  if (ceiling === "PSA_10") return 10;
  if (ceiling === "PSA_9") return 9;
  if (ceiling === "PSA_8") return 8;
  if (ceiling === "PSA_7") return 7;
  return 6;
}

function worstFace(faces: LensMeasuredFace[]) {
  return faces.reduce((worst, face) => (rank(face) < rank(worst) ? face : worst));
}

function ActionButtons({
  onDownloadReport,
  onMeasureAnother,
}: {
  onDownloadReport: () => void;
  onMeasureAnother: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onDownloadReport}
        className="rounded-md border border-owl/40 bg-owl px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-void transition-colors hover:bg-owl-light"
      >
        Download report
      </button>
      <button
        type="button"
        onClick={onMeasureAnother}
        className="rounded-md border border-border bg-deep px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-border-2 hover:bg-surf2"
      >
        Measure another
      </button>
    </div>
  );
}

export default function ResultsPanel({
  faces,
  cardIdentity,
  onDownloadReport,
  onMeasureAnother,
}: ResultsPanelProps) {
  const measured = measuredFaces(faces);
  if (measured.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-text-2">
        No saved result is ready.
      </section>
    );
  }

  const worst = worstFace(measured);
  const worstTone = measurementTone(worst.measurement);
  const ceiling = ceilingFromWorstMax(worst.measurement.worstAxisMaxPct);
  const adjusted = measured.some((face) => face.adjusted);
  const single = measured.length === 1;

  if (!single) {
    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className={`rounded-lg border p-4 text-center ${TINTED_TONE_CLASSES[worstTone]}`}>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">
              Combined ceiling
            </div>
            <div className="mt-1 font-mono text-5xl font-bold leading-none">{bareGradeLabel(ceiling)}</div>
            <div className="mt-1 font-mono text-[10px] text-text-2">worse of front · back</div>
            <GraderStrip worstMax={worst.measurement.worstAxisMaxPct} />
          </div>
          <ActionButtons onDownloadReport={onDownloadReport} onMeasureAnother={onMeasureAnother} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {measured.map((face) => (
            <FaceResultCard
              key={face.face}
              face={face.face}
              measurement={face.measurement}
              overlay={face.overlay}
              imageUrl={face.imageUrl}
              isWorst={face.face === worst.face}
            />
          ))}
        </div>
        {adjusted && <div className="font-mono text-xs uppercase tracking-wider text-owl">Adjusted manually</div>}
      </section>
    );
  }

  const [face] = measured;
  const tone = measurementTone(face.measurement);

  return (
    <section className="space-y-4">
      {cardIdentity && <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-owl">{cardIdentity}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ImageOverlayPanel
          overlay={face.overlay}
          imageSize={face.imageSize}
          imageUrl={face.imageUrl}
          freeCorners={false}
          mode="readonly"
          adjusted={Boolean(face.adjusted)}
          onOverlayChange={() => undefined}
        />
        <aside className="space-y-3">
          <div className={`rounded-lg border p-4 text-center ${TINTED_TONE_CLASSES[tone]}`}>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">Ceiling</div>
            <div className="mt-1 font-mono text-4xl font-bold leading-none">
              {bareGradeLabel(ceilingFromWorstMax(face.measurement.worstAxisMaxPct))}
            </div>
            <div className="mt-1 font-mono text-[10px] text-text-2">front only (back not measured)</div>
            <GraderStrip worstMax={face.measurement.worstAxisMaxPct} />
          </div>
          <FaceResultCard
            face={face.face}
            measurement={face.measurement}
            overlay={face.overlay}
            imageUrl={face.imageUrl}
            isWorst
          />
          <ActionButtons onDownloadReport={onDownloadReport} onMeasureAnother={onMeasureAnother} />
        </aside>
      </div>
    </section>
  );
}
