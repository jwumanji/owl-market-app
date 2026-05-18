"use client";

import {
  computeMeasurements,
  constrainedCornerDrag,
  freeCornerDrag,
  overlayHasInnerInsideOuter,
  quadCentroid,
  rotateCorners,
  type OverlayGeometry,
  type QuadCornerKey,
  type QuadCorners,
  type QuadPoint,
} from "@/lib/centering-math";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type OverlayTarget = "outer" | "inner";
type OverlayMode = "review" | "edit" | "readonly";
type OverlayHandle = {
  target: OverlayTarget;
  corner: QuadCornerKey;
};

type CornerDragState = {
  kind: "corner";
  handle: OverlayHandle;
};

type RotationDragState = {
  kind: "rotation";
  center: QuadPoint;
  startAngle: number;
  startOverlay: OverlayGeometry;
};

type DragState = CornerDragState | RotationDragState;

type ImageOverlayPanelProps = {
  overlay: OverlayGeometry;
  imageSize: { width: number; height: number };
  imageUrl?: string | null;
  freeCorners: boolean;
  mode?: OverlayMode;
  adjusted?: boolean;
  onOverlayChange: (overlay: OverlayGeometry) => void;
};

const CORNERS: QuadCornerKey[] = ["tl", "tr", "br", "bl"];
const TARGET_LABELS: Record<OverlayTarget, string> = {
  outer: "outer",
  inner: "inner",
};
const AFFECTED_SIDES: Record<QuadCornerKey, Array<"left" | "right" | "top" | "bottom">> = {
  tl: ["left", "top"],
  tr: ["right", "top"],
  br: ["right", "bottom"],
  bl: ["left", "bottom"],
};

function points(corners: QuadCorners) {
  return `${corners.tl.x},${corners.tl.y} ${corners.tr.x},${corners.tr.y} ${corners.br.x},${corners.br.y} ${corners.bl.x},${corners.bl.y}`;
}

function midpoint(a: QuadPoint, b: QuadPoint): QuadPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function averagePoint(a: QuadPoint, b: QuadPoint): QuadPoint {
  return midpoint(a, b);
}

function topEdgeAngle(corners: QuadCorners) {
  return (Math.atan2(corners.tr.y - corners.tl.y, corners.tr.x - corners.tl.x) * 180) / Math.PI;
}

function normalizeDegrees(value: number) {
  let next = value;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
}

function angleFromCenter(point: QuadPoint, center: QuadPoint) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function labelPosition(side: "left" | "right" | "top" | "bottom", overlay: OverlayGeometry): QuadPoint {
  if (side === "left") {
    return averagePoint(midpoint(overlay.outer.tl, overlay.outer.bl), midpoint(overlay.inner.tl, overlay.inner.bl));
  }
  if (side === "right") {
    return averagePoint(midpoint(overlay.outer.tr, overlay.outer.br), midpoint(overlay.inner.tr, overlay.inner.br));
  }
  if (side === "top") {
    return averagePoint(midpoint(overlay.outer.tl, overlay.outer.tr), midpoint(overlay.inner.tl, overlay.inner.tr));
  }
  return averagePoint(midpoint(overlay.outer.bl, overlay.outer.br), midpoint(overlay.inner.bl, overlay.inner.br));
}

function rotationHandlePosition(outer: QuadCorners) {
  const center = quadCentroid(outer);
  const topMid = midpoint(outer.tl, outer.tr);
  const dx = topMid.x - center.x;
  const dy = topMid.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const handle = {
    x: topMid.x + (dx / length) * 44,
    y: topMid.y + (dy / length) * 44,
  };

  return { center, topMid, handle };
}

function clampToImage(point: QuadPoint, imageSize: { width: number; height: number }): QuadPoint {
  return {
    x: Math.min(imageSize.width, Math.max(0, point.x)),
    y: Math.min(imageSize.height, Math.max(0, point.y)),
  };
}

function pointFromEvent(event: PointerEvent, svg: SVGSVGElement, imageSize: { width: number; height: number }): QuadPoint {
  const matrix = svg.getScreenCTM();
  if (!matrix) {
    return clampToImage({ x: 0, y: 0 }, imageSize);
  }

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const svgPoint = point.matrixTransform(matrix.inverse());
  return { x: svgPoint.x, y: svgPoint.y };
}

function isEditable(mode: OverlayMode) {
  return mode === "review" || mode === "edit";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function cornerLabel(handle: OverlayHandle) {
  return `${TARGET_LABELS[handle.target]} ${handle.corner}`;
}

export default function ImageOverlayPanel({
  overlay,
  imageSize,
  imageUrl = null,
  freeCorners,
  mode = "review",
  adjusted = false,
  onOverlayChange,
}: ImageOverlayPanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const overlayRef = useRef(overlay);
  const dragRef = useRef<DragState | null>(null);
  const initialRotationRef = useRef<number | null>(null);
  const activeHandleRef = useRef<OverlayHandle | null>(null);
  const selectedHandleRef = useRef<OverlayHandle | null>(null);
  const freeCornersRef = useRef(freeCorners);
  const updateCornerRef = useRef<((handle: OverlayHandle, point: QuadPoint, useFreeDrag: boolean) => void) | null>(null);
  const [activeHandle, setActiveHandle] = useState<OverlayHandle | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<OverlayHandle | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const editable = isEditable(mode);
  const measurement = useMemo(() => computeMeasurements(overlay), [overlay]);

  useEffect(() => {
    overlayRef.current = overlay;
    if (initialRotationRef.current === null) {
      initialRotationRef.current = topEdgeAngle(overlay.outer);
    }
  }, [overlay]);

  useEffect(() => {
    selectedHandleRef.current = selectedHandle;
  }, [selectedHandle]);

  useEffect(() => {
    freeCornersRef.current = freeCorners;
  }, [freeCorners]);

  const rotationDegrees = normalizeDegrees(topEdgeAngle(overlay.outer) - (initialRotationRef.current ?? topEdgeAngle(overlay.outer)));
  const affectedSides = activeHandle ? AFFECTED_SIDES[activeHandle.corner] : [];
  const rotation = rotationHandlePosition(overlay.outer);
  const viewBoxTop = -64;
  const viewBoxHeight = imageSize.height - viewBoxTop;
  const degreeDial = {
    x: Math.min(imageSize.width - 84, Math.max(6, rotation.handle.x + 14)),
    y: Math.min(imageSize.height - 34, Math.max(viewBoxTop + 6, rotation.handle.y - 16)),
  };

  const updateCorner = useCallback(
    (handle: OverlayHandle, point: QuadPoint, useFreeDrag: boolean) => {
      const current = overlayRef.current;
      const currentCorners = current[handle.target];
      const nextCorners = useFreeDrag
        ? freeCornerDrag(currentCorners, handle.corner, point, imageSize)
        : constrainedCornerDrag(currentCorners, handle.corner, point, imageSize);

      if (nextCorners === currentCorners) return;
      const nextOverlay = {
        ...current,
        [handle.target]: nextCorners,
      };

      if (!overlayHasInnerInsideOuter(nextOverlay)) return;
      onOverlayChange(nextOverlay);
    },
    [imageSize, onOverlayChange]
  );

  useEffect(() => {
    updateCornerRef.current = updateCorner;
  }, [updateCorner]);

  const setActiveDragHandle = useCallback((handle: OverlayHandle | null) => {
    activeHandleRef.current = handle;
    setActiveHandle(handle);
  }, []);

  const selectKeyboardHandle = useCallback((handle: OverlayHandle | null) => {
    selectedHandleRef.current = handle;
    setSelectedHandle(handle);
  }, []);

  const beginCornerDrag = useCallback(
    (event: PointerEvent<SVGCircleElement>, handle: OverlayHandle) => {
      if (!editable) return;
      event.preventDefault();
      event.stopPropagation();
      svgRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = { kind: "corner", handle };
      setActiveDragHandle(handle);
      selectKeyboardHandle(handle);
    },
    [editable, selectKeyboardHandle, setActiveDragHandle]
  );

  const beginRotationDrag = useCallback(
    (event: PointerEvent<SVGCircleElement>) => {
      if (!editable || freeCorners || !svgRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      svgRef.current.setPointerCapture(event.pointerId);
      const current = overlayRef.current;
      const center = quadCentroid(current.outer);
      dragRef.current = {
        kind: "rotation",
        center,
        startAngle: angleFromCenter(pointFromEvent(event, svgRef.current, imageSize), center),
        startOverlay: current,
      };
      setIsRotating(true);
      setActiveDragHandle(null);
    },
    [editable, freeCorners, imageSize, setActiveDragHandle]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || !svgRef.current || !editable) return;

      if (dragRef.current.kind === "corner") {
        const active = activeHandleRef.current;
        if (
          !active ||
          active.target !== dragRef.current.handle.target ||
          active.corner !== dragRef.current.handle.corner
        ) {
          return;
        }

        updateCorner(dragRef.current.handle, pointFromEvent(event, svgRef.current, imageSize), freeCorners || event.shiftKey);
        return;
      }

      const drag = dragRef.current;
      const delta = normalizeDegrees(angleFromCenter(pointFromEvent(event, svgRef.current, imageSize), drag.center) - drag.startAngle);
      const nextOverlay = {
        outer: rotateCorners(drag.startOverlay.outer, delta, drag.center),
        inner: rotateCorners(drag.startOverlay.inner, delta, drag.center),
      };

      if (!overlayHasInnerInsideOuter(nextOverlay)) return;
      onOverlayChange(nextOverlay);
    },
    [editable, freeCorners, imageSize, onOverlayChange, updateCorner]
  );

  const finishDrag = useCallback(
    (pointerId?: number) => {
      if (typeof pointerId === "number" && svgRef.current?.hasPointerCapture(pointerId)) {
        svgRef.current.releasePointerCapture(pointerId);
      }
      dragRef.current = null;
      setActiveDragHandle(null);
      setIsRotating(false);
    },
    [setActiveDragHandle]
  );

  const endDrag = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      finishDrag(event.pointerId);
    },
    [finishDrag]
  );

  useEffect(() => {
    function onPointerEnd(event: globalThis.PointerEvent) {
      finishDrag(event.pointerId);
    }

    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
    };
  }, [finishDrag]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const handle = selectedHandleRef.current;
      const nudgeCorner = updateCornerRef.current;
      if (!handle || !nudgeCorner || isTypingTarget(event.target)) return;

      const step = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else return;

      event.preventDefault();
      const point = overlayRef.current[handle.target][handle.corner];
      nudgeCorner(handle, { x: point.x + dx, y: point.y + dy }, freeCornersRef.current);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const status = activeHandle
    ? `Dragging ${cornerLabel(activeHandle)}`
    : selectedHandle
      ? "Selected · arrows nudge · Shift ×10"
      : adjusted
        ? "Adjusted manually"
        : "CV-detected";

  const labels = [
    {
      key: "left" as const,
      text: `${Math.round(measurement.gaps.leftPx)}px · ${measurement.leftPct}%`,
      position: labelPosition("left", overlay),
    },
    {
      key: "right" as const,
      text: `${Math.round(measurement.gaps.rightPx)}px · ${measurement.rightPct}%`,
      position: labelPosition("right", overlay),
    },
    {
      key: "top" as const,
      text: `${Math.round(measurement.gaps.topPx)}px · ${measurement.topPct}%`,
      position: labelPosition("top", overlay),
    },
    {
      key: "bottom" as const,
      text: `${Math.round(measurement.gaps.bottomPx)}px · ${measurement.bottomPct}%`,
      position: labelPosition("bottom", overlay),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <svg
        ref={svgRef}
        viewBox={`0 ${viewBoxTop} ${imageSize.width} ${viewBoxHeight}`}
        className="block max-h-[640px] w-full touch-none select-none rounded-md bg-void outline-none"
        role="img"
        aria-label="Owl Lens centering overlay"
        tabIndex={0}
        onPointerDown={(event) => {
          if (!editable) return;
          const target = event.target;
          if (target instanceof Element && target.closest("[data-overlay-interactive='true']")) return;
          selectKeyboardHandle(null);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect
          x="0"
          y="0"
          width={imageSize.width}
          height={imageSize.height}
          fill="transparent"
          onPointerDown={() => {
            if (editable) selectKeyboardHandle(null);
          }}
        />
        {imageUrl ? (
          <image href={imageUrl} x="0" y="0" width={imageSize.width} height={imageSize.height} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <g aria-hidden="true">
            <rect x="0" y="0" width={imageSize.width} height={imageSize.height} fill="#050916" />
            <rect x="38" y="38" width={imageSize.width - 76} height={imageSize.height - 76} rx="18" fill="#121d32" />
            <text x={imageSize.width / 2} y={imageSize.height / 2} textAnchor="middle" fill="#3d4d6a" className="font-mono text-[18px] uppercase tracking-widest">
              sample scan
            </text>
          </g>
        )}

        {!freeCorners && editable && (
          <g>
            <line
              x1={rotation.topMid.x}
              y1={rotation.topMid.y}
              x2={rotation.handle.x}
              y2={rotation.handle.y}
              stroke="var(--owl)"
              strokeDasharray="8 8"
              strokeOpacity="0.75"
              strokeWidth="2"
            />
            <circle
              cx={rotation.handle.x}
              cy={rotation.handle.y}
              r="8"
              fill="var(--owl)"
              stroke="var(--void)"
              strokeWidth="4"
              className="cursor-grab"
              data-overlay-interactive="true"
              onPointerDown={beginRotationDrag}
            />
          </g>
        )}

        <polygon points={points(overlay.outer)} fill="rgba(232,160,32,0.05)" stroke="var(--owl)" strokeWidth="4" strokeDasharray="6 8" />
        <polygon points={points(overlay.inner)} fill="rgba(0,214,143,0.04)" stroke="var(--green)" strokeWidth="4" strokeDasharray="6 8" />

        {labels.map((label) => {
          const active = affectedSides.includes(label.key);
          return (
            <g key={label.key} pointerEvents="none">
              <rect
                x={label.position.x - 43}
                y={label.position.y - 12}
                width="86"
                height="24"
                rx="4"
                fill={active ? "rgba(232,160,32,0.18)" : "rgba(3,5,13,0.74)"}
                stroke={active ? "rgba(232,160,32,0.6)" : "rgba(255,255,255,0.10)"}
              />
              <text
                x={label.position.x}
                y={label.position.y + 3.5}
                textAnchor="middle"
                fill={active ? "var(--owl)" : "var(--text2)"}
                className="font-mono text-[10px] font-bold"
              >
                {label.text}
              </text>
            </g>
          );
        })}

        {rotationDegrees !== 0 && Math.abs(rotationDegrees) >= 0.05 && (
          <g pointerEvents="none">
            <rect x={degreeDial.x} y={degreeDial.y} width="78" height="30" rx="5" fill="rgba(3,5,13,0.80)" stroke="rgba(232,160,32,0.5)" />
            <text x={degreeDial.x + 39} y={degreeDial.y + 20} textAnchor="middle" fill="var(--owl)" className="font-mono text-[12px] font-bold">
              {rotationDegrees > 0 ? "+" : ""}
              {rotationDegrees.toFixed(1)}°
            </text>
          </g>
        )}

        {(["outer", "inner"] as OverlayTarget[]).map((target) =>
          CORNERS.map((corner) => {
            const point = overlay[target][corner];
            const handle = { target, corner };
            const selected = selectedHandle?.target === target && selectedHandle.corner === corner;
            const active = activeHandle?.target === target && activeHandle.corner === corner;
            const color = target === "outer" ? "var(--owl)" : "var(--green)";
            return (
              <g key={`${target}-${corner}`}>
                {selected && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={active ? 24 : 22}
                    fill="none"
                    stroke="var(--owl)"
                    strokeOpacity="0.95"
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 20 : selected ? 18 : 11}
                  fill="none"
                  stroke={color}
                  strokeOpacity={active || selected ? "1" : "0.35"}
                  strokeWidth={active || selected ? "3" : "2"}
                />
                <circle cx={point.x} cy={point.y} r="7" fill={color} stroke="var(--void)" strokeWidth="3" />
                {editable && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="20"
                    fill="transparent"
                    className="cursor-move"
                    aria-label={`${target} ${corner} handle`}
                    data-overlay-interactive="true"
                    onPointerDown={(event) => beginCornerDrag(event, handle)}
                  />
                )}
              </g>
            );
          })
        )}
      </svg>

      <div className="flex items-center gap-4 px-1 pt-3 font-mono text-[10px] uppercase tracking-wider text-text-2">
        <span><span className="mr-1.5 inline-block h-[3px] w-3 bg-owl align-middle" />Outer</span>
        <span><span className="mr-1.5 inline-block h-[3px] w-3 bg-gain align-middle" />Inner</span>
        <span className="flex-1" />
        <span className="text-owl">{isRotating ? "Dragging rotation" : status}</span>
      </div>
    </div>
  );
}
