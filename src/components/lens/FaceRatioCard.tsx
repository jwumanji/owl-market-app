"use client";

/**
 * The canonical per-face ratio card for Owl Lens.
 *
 * One renderer for "a face's L/R + T/B centering, its tones, worst axis, and PSA ceiling",
 * with optional media (image/overlay) and optional click-to-select. ResultScreen uses it
 * today; the legacy ReportFaceCard / FaceResultCard / FaceMeasurementCard are scheduled to
 * fold into this in the Phase 2.5 retirement so there is a single face-card, not four.
 */

import type { KeyboardEvent, ReactNode } from "react";
import {
  psaCeilingBack,
  psaCeilingFront,
  type ComputedCenteringMeasurement,
} from "@/lib/centering-math";
import { AxisRatioValue } from "./AxisRatioCard";
import { axisTone, bareGradeLabel, gradeTierAccentStyleForGrade, TONE_TEXT_CLASSES } from "./grading";
import type { LensFace } from "./lens-types";

type FaceRatioCardProps = {
  face: LensFace;
  measurement: ComputedCenteringMeasurement;
  isActive?: boolean;
  isWorst?: boolean;
  showCeiling?: boolean;
  media?: ReactNode;
  onSelect?: () => void;
  className?: string;
};

export default function FaceRatioCard({
  face,
  measurement,
  isActive = false,
  isWorst = false,
  showCeiling = true,
  media = null,
  onSelect,
  className = "",
}: FaceRatioCardProps) {
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);
  const worstAxis = measurement.worstAxis === "leftRight" ? "L/R" : "T/B";
  const worstAxisTone = measurement.worstAxis === "leftRight" ? leftRightTone : topBottomTone;
  const faceCeiling =
    face === "back" ? psaCeilingBack(measurement.worstAxisMaxPct) : psaCeilingFront(measurement.worstAxisMaxPct);
  const interactive = Boolean(onSelect);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect();
  }

  const classes = [
    "rounded-c-md border-[1.5px] bg-bg-2 p-3",
    isActive ? "border-coral" : "border-ink",
    interactive
      ? "cursor-pointer outline-none transition-colors hover:border-coral focus-visible:border-coral focus-visible:ring-2 focus-visible:ring-coral/30"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={classes}
      data-face-ratio-card={face}
      data-active={isActive ? "true" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Switch to ${face} face` : undefined}
      aria-pressed={interactive ? isActive : undefined}
      onClick={onSelect}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-2 text-[10px] font-bold uppercase tracking-widest text-ink-2">{face}</span>
        {showCeiling && (
          <span
            className="rounded-c-sm border-[1.5px] px-2 py-1 font-mono-2 text-[11px] font-bold"
            style={gradeTierAccentStyleForGrade(faceCeiling)}
          >
            {bareGradeLabel(faceCeiling)}
          </span>
        )}
      </div>

      {media}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-c-sm border-[1.5px] border-ink bg-bg-3 p-2">
          <div className="font-mono-2 text-[9px] font-bold uppercase tracking-wider text-ink-2">L / R</div>
          <AxisRatioValue
            firstLabel="L"
            firstValue={measurement.leftPct}
            secondLabel="R"
            secondValue={measurement.rightPct}
            tone={leftRightTone}
            size="md"
          />
        </div>
        <div className="rounded-c-sm border-[1.5px] border-ink bg-bg-3 p-2">
          <div className="font-mono-2 text-[9px] font-bold uppercase tracking-wider text-ink-2">T / B</div>
          <AxisRatioValue
            firstLabel="T"
            firstValue={measurement.topPct}
            secondLabel="B"
            secondValue={measurement.bottomPct}
            tone={topBottomTone}
            size="md"
          />
        </div>
      </div>

      <div className="mt-2 font-mono-2 text-[10px] font-bold uppercase tracking-wider text-ink-2">
        Worst axis
        <span className={`ml-2 ${TONE_TEXT_CLASSES[worstAxisTone]}`}>
          {worstAxis} @ {measurement.worstAxisMaxPct}%
        </span>
        {isWorst && <span className="ml-2 text-coral">worst face</span>}
      </div>
    </article>
  );
}
