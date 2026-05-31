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

export type QuadCornerKey = keyof QuadCorners;

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

export type CenteringFace = "front" | "back";
export type TagCategory = "tcg" | "sports";
export type PsaGrade =
  | "PSA_10"
  | "PSA_9"
  | "PSA_8"
  | "PSA_7"
  | "PSA_6"
  | "PSA_5"
  | "PSA_4"
  | "PSA_3_OR_LESS"
  | "PSA_2_OR_LESS";
export type LegacyPsaCeiling = "BELOW_PSA_7";
export type PsaCeiling = PsaGrade | LegacyPsaCeiling;
export type BgsGrade =
  | "BGS_10"
  | "BGS_9_5"
  | "BGS_9"
  | "BGS_8_5"
  | "BGS_8"
  | "BGS_7_5"
  | "BGS_7"
  | "BGS_6_5"
  | "BGS_6_OR_LESS";
export type TagGrade =
  | "TAG_10_PRISTINE"
  | "TAG_10_GEM_MINT"
  | "TAG_9"
  | "TAG_8"
  | "TAG_7"
  | "TAG_6"
  | "TAG_5"
  | "TAG_4_OR_LESS"
  | "TAG_7_OR_LESS"
  | "TAG_6_OR_LESS";
export type GraderGrade = PsaCeiling | BgsGrade | TagGrade;
export type CombinedCeilingResult<TGrade extends GraderGrade> = {
  ceiling: TGrade;
  front: TGrade;
  back: TGrade | null;
  frontOnly: boolean;
};

const GRADE_RANK: Record<GraderGrade, number> = {
  PSA_10: 10,
  PSA_9: 9,
  PSA_8: 8,
  PSA_7: 7,
  PSA_6: 6,
  PSA_5: 5,
  PSA_4: 4,
  PSA_3_OR_LESS: 3,
  PSA_2_OR_LESS: 2,
  BELOW_PSA_7: 6,
  BGS_10: 10,
  BGS_9_5: 9.5,
  BGS_9: 9,
  BGS_8_5: 8.5,
  BGS_8: 8,
  BGS_7_5: 7.5,
  BGS_7: 7,
  BGS_6_5: 6.5,
  BGS_6_OR_LESS: 6,
  TAG_10_PRISTINE: 10.1,
  TAG_10_GEM_MINT: 10,
  TAG_9: 9,
  TAG_8: 8,
  TAG_7: 7,
  TAG_6: 6,
  TAG_5: 5,
  TAG_4_OR_LESS: 4,
  TAG_7_OR_LESS: 7,
  TAG_6_OR_LESS: 6,
};

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

function ceilingFromTable<TGrade extends GraderGrade>(
  worstMax: number,
  thresholds: Array<{ max: number; ceiling: TGrade }>,
  fallback: TGrade
) {
  for (const threshold of thresholds) {
    if (worstMax <= threshold.max) return threshold.ceiling;
  }
  return fallback;
}

export function gradeRank(grade: GraderGrade) {
  return GRADE_RANK[grade];
}

export function combinedCeiling<TGrade extends GraderGrade>(
  front: TGrade,
  back: TGrade | null
): CombinedCeilingResult<TGrade> {
  if (!back) {
    return {
      ceiling: front,
      front,
      back: null,
      frontOnly: true,
    };
  }

  return {
    ceiling: gradeRank(front) <= gradeRank(back) ? front : back,
    front,
    back,
    frontOnly: false,
  };
}

/**
 * PSA front-centering thresholds for a Gem-Mint 10, expressed as the worst
 * side's share of an axis (e.g. 55 == a 55/45 split).
 *
 * PSA publishes the 10 as a *range*, not a hard line: 55/45-or-better is a
 * confident 10, while 55–60 is grader-dependent ("could come back 10 or 9").
 * So the front 10 boundary is two numbers, not one:
 *   worst ≤ confidentMaxPct                     → confident PSA 10
 *   confidentMaxPct < worst ≤ borderlineMaxPct  → likely PSA 9, possible 10
 *   worst > borderlineMaxPct                    → PSA 9 or lower (table below)
 *
 * This is the single place to edit if PSA revises the standard: change these
 * two numbers and psaCeilingFront, the tone bands (toneFromWorstMax), and the
 * borderline note all follow. Back centering uses a separate, looser standard
 * (see psaCeilingBack) and has no borderline band.
 */
export const PSA_FRONT_TEN = {
  /** Worst side ≤ this → confident PSA 10 (e.g. 55 == a 55/45 split). */
  confidentMaxPct: 55,
  /** Worst side in (confidentMaxPct, this] → borderline: likely 9, possible 10. */
  borderlineMaxPct: 60,
} as const;

/**
 * PSA front centering ceiling. The 10 cutoff is the confident end of PSA's
 * published range (PSA_FRONT_TEN.confidentMaxPct); cards in the 55–60 borderline
 * band resolve to a conservative PSA 9 here and are flagged separately via
 * isPsaFrontTenBorderline so the UI can surface the 10 upside.
 * Source: PSA grading standards, https://www.psacard.com/gradingstandards
 */
export function psaCeilingFront(worstMax: number): PsaGrade {
  return ceilingFromTable(
    worstMax,
    [
      { max: PSA_FRONT_TEN.confidentMaxPct, ceiling: "PSA_10" },
      { max: 65, ceiling: "PSA_9" },
      { max: 70, ceiling: "PSA_8" },
      { max: 75, ceiling: "PSA_7" },
      { max: 80, ceiling: "PSA_6" },
      { max: 85, ceiling: "PSA_5" },
      { max: 90, ceiling: "PSA_4" },
    ],
    "PSA_3_OR_LESS"
  );
}

/**
 * True when a FRONT worst-side max sits in the PSA-10 borderline band — a likely
 * 9 with genuine 10 upside that depends on the grader. Back centering has no
 * equivalent band, so this is front-only by design.
 */
export function isPsaFrontTenBorderline(worstMax: number): boolean {
  return (
    worstMax > PSA_FRONT_TEN.confidentMaxPct &&
    worstMax <= PSA_FRONT_TEN.borderlineMaxPct
  );
}

/**
 * PSA back centering thresholds.
 * Source: PSA grading standards, https://www.psacard.com/gradingstandards
 */
export function psaCeilingBack(worstMax: number): PsaGrade {
  return ceilingFromTable(
    worstMax,
    [
      { max: 75, ceiling: "PSA_10" },
      { max: 90, ceiling: "PSA_9" },
    ],
    "PSA_2_OR_LESS"
  );
}

/**
 * BGS front centering sub-grade thresholds.
 * Source: Beckett grading scale, https://www.beckett.com/grading/scale
 */
export function bgsCeilingFront(worstMax: number): BgsGrade {
  return ceilingFromTable(
    worstMax,
    [
      { max: 51, ceiling: "BGS_10" },
      { max: 55, ceiling: "BGS_9_5" },
      { max: 60, ceiling: "BGS_9" },
      { max: 65, ceiling: "BGS_8_5" },
      { max: 70, ceiling: "BGS_8" },
      { max: 75, ceiling: "BGS_7_5" },
      { max: 80, ceiling: "BGS_7" },
      { max: 85, ceiling: "BGS_6_5" },
    ],
    "BGS_6_OR_LESS"
  );
}

/**
 * BGS back centering sub-grade thresholds.
 * Source: Beckett grading scale, https://www.beckett.com/grading/scale
 */
export function bgsCeilingBack(worstMax: number): BgsGrade {
  return ceilingFromTable(
    worstMax,
    [
      { max: 55, ceiling: "BGS_10" },
      { max: 60, ceiling: "BGS_9_5" },
      { max: 80, ceiling: "BGS_9" },
      { max: 90, ceiling: "BGS_8_5" },
      { max: 95, ceiling: "BGS_8" },
    ],
    "BGS_7_5"
  );
}

/**
 * TAG front centering thresholds.
 * Sources: TAG grading rubric, https://taggrading.com/pages/rubric and
 * TAG conversion table, https://taggrading.com/pages/conversion
 */
export function tagCeilingFront(worstMax: number, category: TagCategory = "tcg"): TagGrade {
  void category;
  return ceilingFromTable(
    worstMax,
    [
      { max: 51, ceiling: "TAG_10_PRISTINE" },
      { max: 55, ceiling: "TAG_10_GEM_MINT" },
      { max: 60, ceiling: "TAG_9" },
      { max: 62.5, ceiling: "TAG_8" },
      { max: 65, ceiling: "TAG_7" },
      { max: 67.5, ceiling: "TAG_6" },
      { max: 70, ceiling: "TAG_5" },
    ],
    "TAG_4_OR_LESS"
  );
}

/**
 * TAG back centering thresholds.
 * Sources: TAG grading rubric, https://taggrading.com/pages/rubric and
 * TAG conversion table, https://taggrading.com/pages/conversion
 */
export function tagCeilingBack(worstMax: number, category: TagCategory = "tcg"): TagGrade {
  if (category === "sports") {
    return ceilingFromTable(
      worstMax,
      [
        { max: 54.5, ceiling: "TAG_10_PRISTINE" },
        { max: 70, ceiling: "TAG_10_GEM_MINT" },
        { max: 90, ceiling: "TAG_9" },
        { max: 95, ceiling: "TAG_8" },
      ],
      "TAG_7_OR_LESS"
    );
  }

  return ceilingFromTable(
    worstMax,
    [
      { max: 52, ceiling: "TAG_10_PRISTINE" },
      { max: 65, ceiling: "TAG_10_GEM_MINT" },
      { max: 75, ceiling: "TAG_9" },
      { max: 85, ceiling: "TAG_8" },
      { max: 95, ceiling: "TAG_7" },
    ],
    "TAG_6_OR_LESS"
  );
}

export function ceilingFromWorstMax(worstMax: number): PsaCeiling {
  return psaCeilingFront(worstMax);
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

function addPoint(a: QuadPoint, b: QuadPoint): QuadPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtractPoint(a: QuadPoint, b: QuadPoint): QuadPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scalePoint(point: QuadPoint, scale: number): QuadPoint {
  return { x: point.x * scale, y: point.y * scale };
}

function dotPoint(a: QuadPoint, b: QuadPoint) {
  return a.x * b.x + a.y * b.y;
}

function crossPoint(a: QuadPoint, b: QuadPoint) {
  return a.x * b.y - a.y * b.x;
}

function normalizeVector(vector: QuadPoint): QuadPoint | null {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function clampPoint(point: QuadPoint, bounds: { width: number; height: number }): QuadPoint {
  return {
    x: Math.min(bounds.width, Math.max(0, point.x)),
    y: Math.min(bounds.height, Math.max(0, point.y)),
  };
}

function cornersWithinBounds(corners: QuadCorners, bounds: { width: number; height: number }) {
  return (Object.keys(corners) as QuadCornerKey[]).every((corner) => {
    const point = corners[corner];
    return point.x >= 0 && point.x <= bounds.width && point.y >= 0 && point.y <= bounds.height;
  });
}

function rectangleAxes(corners: QuadCorners) {
  const xAxis = normalizeVector(subtractPoint(corners.tr, corners.tl));
  const yAxis = normalizeVector(subtractPoint(corners.bl, corners.tl));
  if (!xAxis || !yAxis) return null;
  return { xAxis, yAxis };
}

function rectangleFromAnchor({
  anchor,
  xAxis,
  yAxis,
  width,
  height,
  draggedCorner,
}: {
  anchor: QuadPoint;
  xAxis: QuadPoint;
  yAxis: QuadPoint;
  width: number;
  height: number;
  draggedCorner: QuadCornerKey;
}): QuadCorners {
  const w = scalePoint(xAxis, width);
  const h = scalePoint(yAxis, height);

  if (draggedCorner === "tl") {
    return {
      tl: addPoint(addPoint(anchor, scalePoint(w, -1)), scalePoint(h, -1)),
      tr: addPoint(anchor, scalePoint(h, -1)),
      br: anchor,
      bl: addPoint(anchor, scalePoint(w, -1)),
    };
  }

  if (draggedCorner === "tr") {
    return {
      tl: addPoint(anchor, scalePoint(h, -1)),
      tr: addPoint(addPoint(anchor, w), scalePoint(h, -1)),
      br: addPoint(anchor, w),
      bl: anchor,
    };
  }

  if (draggedCorner === "bl") {
    return {
      tl: addPoint(anchor, scalePoint(w, -1)),
      tr: anchor,
      br: addPoint(anchor, h),
      bl: addPoint(addPoint(anchor, scalePoint(w, -1)), h),
    };
  }

  return {
    tl: anchor,
    tr: addPoint(anchor, w),
    br: addPoint(addPoint(anchor, w), h),
    bl: addPoint(anchor, h),
  };
}

export function quadCentroid(corners: QuadCorners): QuadPoint {
  return {
    x: (corners.tl.x + corners.tr.x + corners.br.x + corners.bl.x) / 4,
    y: (corners.tl.y + corners.tr.y + corners.br.y + corners.bl.y) / 4,
  };
}

export function isConvexQuad(corners: QuadCorners) {
  const points = [corners.tl, corners.tr, corners.br, corners.bl];
  let sign = 0;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = crossPoint(subtractPoint(b, a), subtractPoint(c, b));

    if (Math.abs(cross) < 0.000001) return false;

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
    } else if (nextSign !== sign) {
      return false;
    }
  }

  return true;
}

export function pointInConvexQuad(point: QuadPoint, corners: QuadCorners) {
  const points = [corners.tl, corners.tr, corners.br, corners.bl];
  let sign = 0;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const cross = crossPoint(subtractPoint(b, a), subtractPoint(point, a));

    if (Math.abs(cross) < 0.000001) return false;

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
    } else if (nextSign !== sign) {
      return false;
    }
  }

  return true;
}

export function overlayHasInnerInsideOuter(overlay: OverlayGeometry) {
  return (Object.keys(overlay.inner) as QuadCornerKey[]).every((corner) =>
    pointInConvexQuad(overlay.inner[corner], overlay.outer)
  );
}

export function freeCornerDrag(
  corners: QuadCorners,
  draggedCorner: QuadCornerKey,
  newPos: QuadPoint,
  bounds: { width: number; height: number }
) {
  const next = {
    ...corners,
    [draggedCorner]: clampPoint(newPos, bounds),
  };

  if (!isConvexQuad(next) || !cornersWithinBounds(next, bounds)) return corners;
  return next;
}

export function constrainedCornerDrag(
  corners: QuadCorners,
  draggedCorner: QuadCornerKey,
  newPos: QuadPoint,
  bounds: { width: number; height: number }
) {
  const axes = rectangleAxes(corners);
  if (!axes) return corners;

  const minSize = 8;
  const point = clampPoint(newPos, bounds);
  let anchor = corners.tl;
  let width = 0;
  let height = 0;

  if (draggedCorner === "tl") {
    anchor = corners.br;
    const delta = subtractPoint(anchor, point);
    width = Math.max(minSize, dotPoint(delta, axes.xAxis));
    height = Math.max(minSize, dotPoint(delta, axes.yAxis));
  } else if (draggedCorner === "tr") {
    anchor = corners.bl;
    const delta = subtractPoint(point, anchor);
    width = Math.max(minSize, dotPoint(delta, axes.xAxis));
    height = Math.max(minSize, -dotPoint(delta, axes.yAxis));
  } else if (draggedCorner === "bl") {
    anchor = corners.tr;
    const delta = subtractPoint(point, anchor);
    width = Math.max(minSize, -dotPoint(delta, axes.xAxis));
    height = Math.max(minSize, dotPoint(delta, axes.yAxis));
  } else {
    anchor = corners.tl;
    const delta = subtractPoint(point, anchor);
    width = Math.max(minSize, dotPoint(delta, axes.xAxis));
    height = Math.max(minSize, dotPoint(delta, axes.yAxis));
  }

  const next = rectangleFromAnchor({
    anchor,
    xAxis: axes.xAxis,
    yAxis: axes.yAxis,
    width,
    height,
    draggedCorner,
  });

  if (!isConvexQuad(next) || !cornersWithinBounds(next, bounds)) return corners;
  return next;
}

export function rotatePoint(point: QuadPoint, deltaDegrees: number, center: QuadPoint): QuadPoint {
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function rotateCorners(corners: QuadCorners, deltaDegrees: number, center: QuadPoint): QuadCorners {
  return {
    tl: rotatePoint(corners.tl, deltaDegrees, center),
    tr: rotatePoint(corners.tr, deltaDegrees, center),
    br: rotatePoint(corners.br, deltaDegrees, center),
    bl: rotatePoint(corners.bl, deltaDegrees, center),
  };
}
