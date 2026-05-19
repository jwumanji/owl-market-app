"use client";

import { useMemo, useState } from "react";
import { computeMeasurements, psaCeilingFront, type OverlayGeometry } from "@/lib/centering-math";
import AxisRatioCard from "./AxisRatioCard";
import FaceTabs, { type LensFace } from "./FaceTabs";
import FaceResultCard from "./FaceResultCard";
import FreeCornersToggle from "./FreeCornersToggle";
import GraderStrip from "./GraderStrip";
import ImageOverlayPanel from "./ImageOverlayPanel";
import { axisTone, bareGradeLabel } from "./grading";
import { SAMPLE_BACK_OVERLAY, SAMPLE_FRONT_OVERLAY, SAMPLE_IMAGE, SAMPLE_IMAGE_SIZE } from "./sample-data";

export default function ImageOverlayDev() {
  const [activeFace, setActiveFace] = useState<LensFace>("front");
  const [overlays, setOverlays] = useState<Record<LensFace, OverlayGeometry>>({
    front: SAMPLE_FRONT_OVERLAY,
    back: SAMPLE_BACK_OVERLAY,
  });
  const [freeCorners, setFreeCorners] = useState<Record<LensFace, boolean>>({
    front: false,
    back: false,
  });
  const [adjustedFaces, setAdjustedFaces] = useState<Record<LensFace, boolean>>({
    front: false,
    back: false,
  });
  const overlay = overlays[activeFace];
  const measurement = useMemo(() => computeMeasurements(overlay), [overlay]);
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <FaceTabs
          activeFace={activeFace}
          adjustedFaces={adjustedFaces}
          unviewedFaces={{ back: activeFace !== "back" }}
          onChange={setActiveFace}
        />
        <ImageOverlayPanel
          overlay={overlay}
          imageSize={SAMPLE_IMAGE_SIZE}
          imageUrl={SAMPLE_IMAGE}
          freeCorners={freeCorners[activeFace]}
          adjusted={adjustedFaces[activeFace]}
          onOverlayChange={(nextOverlay) => {
            setOverlays((current) => ({
              ...current,
              [activeFace]: nextOverlay,
            }));
            setAdjustedFaces((current) => ({
              ...current,
              [activeFace]: true,
            }));
          }}
        />
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-2">
            Combined ceiling
          </div>
          <div className="mt-2 font-mono text-4xl font-bold text-owl">
            {bareGradeLabel(psaCeilingFront(measurement.worstAxisMaxPct))}
          </div>
          <div className="mt-1 font-mono text-[10px] text-text-2">front only (back not measured)</div>
          <GraderStrip worstMax={measurement.worstAxisMaxPct} />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
        <FreeCornersToggle
          enabled={freeCorners[activeFace]}
          onChange={(enabled) =>
            setFreeCorners((current) => ({
              ...current,
              [activeFace]: enabled,
            }))
          }
        />
        <FaceResultCard
          face={activeFace}
          measurement={measurement}
          overlay={overlay}
          imageUrl={SAMPLE_IMAGE}
          isWorst
          isActive
        />
      </aside>
    </div>
  );
}
