import {
  psaCeilingBack,
  psaCeilingFront,
  type ComputedCenteringMeasurement,
  type OverlayGeometry,
} from "@/lib/centering-math";
import type { KeyboardEvent } from "react";
import AxisRatioCard from "./AxisRatioCard";
import { axisTone, bareGradeLabel, gradeTierAccentStyleFromLabel } from "./grading";

type FaceResultCardProps = {
  face: "front" | "back";
  measurement: ComputedCenteringMeasurement;
  overlay?: OverlayGeometry | null;
  imageSize?: { width: number; height: number } | null;
  imageUrl?: string | null;
  isWorst?: boolean;
  isActive: boolean;
  onSelect?: () => void;
};

function polygonPoints(corners: OverlayGeometry["outer"]) {
  return `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;
}

export default function FaceResultCard({
  face,
  measurement,
  overlay,
  imageSize,
  imageUrl,
  isWorst = false,
  isActive,
  onSelect,
}: FaceResultCardProps) {
  const ceiling = bareGradeLabel(
    face === "back"
      ? psaCeilingBack(measurement.worstAxisMaxPct)
      : psaCeilingFront(measurement.worstAxisMaxPct)
  );
  const worstAxis = measurement.worstAxis === "leftRight" ? "L/R" : "T/B";
  const leftRightTone = axisTone(measurement.leftPct, measurement.rightPct);
  const topBottomTone = axisTone(measurement.topPct, measurement.bottomPct);
  const interactive = Boolean(onSelect);
  const cardClassName = [
    "rounded-lg border bg-surface p-4",
    isActive ? "border-owl" : "border-border",
    interactive
      ? "cursor-pointer outline-none transition-colors hover:border-border-2 focus-visible:border-owl focus-visible:ring-2 focus-visible:ring-owl/30"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect();
  }

  return (
    <article
      className={cardClassName}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Switch to ${face} face` : undefined}
      aria-pressed={interactive ? isActive : undefined}
      data-active={isActive ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-2">{face}</span>
        <span
          className="rounded-md border px-2.5 py-1.5 font-mono text-xs font-bold"
          style={gradeTierAccentStyleFromLabel(ceiling)}
        >
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
          <svg
            viewBox={`0 0 ${imageSize?.width ?? 420} ${imageSize?.height ?? 580}`}
            className="h-36 w-full"
          >
            {imageUrl && (
              <image
                href={imageUrl}
                width={imageSize?.width ?? 420}
                height={imageSize?.height ?? 580}
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            <polygon points={polygonPoints(overlay.outer)} fill="none" stroke="var(--owl)" strokeWidth="4" />
            <polygon points={polygonPoints(overlay.inner)} fill="none" stroke="var(--green)" strokeWidth="4" />
          </svg>
        </div>
      )}
    </article>
  );
}
