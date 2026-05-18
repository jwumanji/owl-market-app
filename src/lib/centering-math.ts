export type QuadPoint = {
  x: number;
  y: number;
};

export type QuadCorners = {
  tl: QuadPoint;
  tr: QuadPoint;
  br: QuadPoint;
  bl: QuadPoint;
};

export type OverlayGeometry = {
  outer: QuadCorners;
  inner: QuadCorners;
};

export type ComputedCenteringMeasurement = {
  leftPct: number;
  rightPct: number;
  topPct: number;
  bottomPct: number;
  worstAxis: "leftRight" | "topBottom";
  worstAxisMaxPct: number;
  gaps: {
    leftPx: number;
    rightPx: number;
    topPx: number;
    bottomPx: number;
  };
};

export type PsaCeiling = "PSA_10" | "PSA_9" | "PSA_8" | "PSA_7" | "BELOW_PSA_7";

type LegacyRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberProperty(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return finiteNumber(value) ? value : null;
}

function normalizePoint(value: unknown): QuadPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = numberProperty(value, "x");
  const y = numberProperty(value, "y");
  if (x === null || y === null) return null;

  return {
    x,
    y,
  };
}

function normalizeCorners(value: unknown): QuadCorners | null {
  if (!isRecord(value)) return null;

  const tl = normalizePoint(value.tl);
  const tr = normalizePoint(value.tr);
  const br = normalizePoint(value.br);
  const bl = normalizePoint(value.bl);

  if (!tl || !tr || !br || !bl) return null;
  return { tl, tr, br, bl };
}

function normalizeRect(value: unknown): LegacyRect | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = numberProperty(value, "x");
  const y = numberProperty(value, "y");
  const width = numberProperty(value, "width");
  const height = numberProperty(value, "height");
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;

  return {
    x,
    y,
    width,
    height,
  };
}

function cornersFromRect(rect: LegacyRect): QuadCorners {
  return {
    tl: { x: rect.x, y: rect.y },
    tr: { x: rect.x + rect.width, y: rect.y },
    br: { x: rect.x + rect.width, y: rect.y + rect.height },
    bl: { x: rect.x, y: rect.y + rect.height },
  };
}

export function overlayGeometryFromUnknown(value: unknown): OverlayGeometry | null {
  if (!isRecord(value)) return null;

  const outer = normalizeCorners(value.outer);
  const inner = normalizeCorners(value.inner);
  if (outer && inner) {
    return { outer, inner };
  }

  const outerCard = normalizeRect(value.outerCard);
  const innerFrame = normalizeRect(value.innerFrame);
  if (outerCard && innerFrame) {
    return {
      outer: cornersFromRect(outerCard),
      inner: cornersFromRect(innerFrame),
    };
  }

  return null;
}

function distanceToLine(point: QuadPoint, lineStart: QuadPoint, lineEnd: QuadPoint) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const denominator = Math.hypot(dx, dy);

  if (denominator === 0) {
    return 0;
  }

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / denominator;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function ratioPair(firstGap: number, secondGap: number) {
  const total = firstGap + secondGap;
  if (total <= 0) {
    return { first: 50, second: 50 };
  }

  const first = round2((firstGap / total) * 100);
  return {
    first,
    second: round2(100 - first),
  };
}

export function quadGaps(overlay: OverlayGeometry) {
  const { outer, inner } = overlay;

  return {
    leftPx: round2(
      (distanceToLine(inner.tl, outer.tl, outer.bl) + distanceToLine(inner.bl, outer.tl, outer.bl)) / 2
    ),
    rightPx: round2(
      (distanceToLine(inner.tr, outer.tr, outer.br) + distanceToLine(inner.br, outer.tr, outer.br)) / 2
    ),
    topPx: round2(
      (distanceToLine(inner.tl, outer.tl, outer.tr) + distanceToLine(inner.tr, outer.tl, outer.tr)) / 2
    ),
    bottomPx: round2(
      (distanceToLine(inner.bl, outer.bl, outer.br) + distanceToLine(inner.br, outer.bl, outer.br)) / 2
    ),
  };
}

export function computeMeasurements(overlay: OverlayGeometry): ComputedCenteringMeasurement {
  const gaps = quadGaps(overlay);
  const horizontal = ratioPair(gaps.leftPx, gaps.rightPx);
  const vertical = ratioPair(gaps.topPx, gaps.bottomPx);
  const horizontalWorst = Math.max(horizontal.first, horizontal.second);
  const verticalWorst = Math.max(vertical.first, vertical.second);
  const worstAxis = horizontalWorst >= verticalWorst ? "leftRight" : "topBottom";

  return {
    leftPct: horizontal.first,
    rightPct: horizontal.second,
    topPct: vertical.first,
    bottomPct: vertical.second,
    worstAxis,
    worstAxisMaxPct: round2(Math.max(horizontalWorst, verticalWorst)),
    gaps,
  };
}

export function ceilingFromWorstMax(worstMax: number): PsaCeiling {
  if (worstMax <= 55) return "PSA_10";
  if (worstMax <= 60) return "PSA_9";
  if (worstMax <= 65) return "PSA_8";
  if (worstMax <= 70) return "PSA_7";
  return "BELOW_PSA_7";
}

function boundingRect(corners: QuadCorners): LegacyRect {
  const points = [corners.tl, corners.tr, corners.br, corners.bl];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

export function legacyOverlayFromGeometry(overlay: OverlayGeometry) {
  const measurement = computeMeasurements(overlay);

  return {
    coordinateSpace: "imagePixels" as const,
    outerCard: boundingRect(overlay.outer),
    innerFrame: boundingRect(overlay.inner),
    gaps: measurement.gaps,
  };
}

export function overlayImageBounds(overlay: OverlayGeometry) {
  const points = [
    overlay.outer.tl,
    overlay.outer.tr,
    overlay.outer.br,
    overlay.outer.bl,
    overlay.inner.tl,
    overlay.inner.tr,
    overlay.inner.br,
    overlay.inner.bl,
  ];

  return {
    width: Math.max(1, Math.ceil(Math.max(...points.map((point) => point.x)))),
    height: Math.max(1, Math.ceil(Math.max(...points.map((point) => point.y)))),
  };
}

function comparablePoint(point: QuadPoint) {
  return {
    x: round2(point.x),
    y: round2(point.y),
  };
}

function comparableCorners(corners: QuadCorners) {
  return {
    tl: comparablePoint(corners.tl),
    tr: comparablePoint(corners.tr),
    br: comparablePoint(corners.br),
    bl: comparablePoint(corners.bl),
  };
}

export function comparableOverlayGeometry(overlay: OverlayGeometry) {
  return {
    outer: comparableCorners(overlay.outer),
    inner: comparableCorners(overlay.inner),
  };
}

export function overlaysEquivalent(a: OverlayGeometry, b: OverlayGeometry) {
  return JSON.stringify(comparableOverlayGeometry(a)) === JSON.stringify(comparableOverlayGeometry(b));
}
