import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);
const mathPath = path.resolve("src/lib/centering-math.ts");
const mathJavaScript = ts.transpileModule(fs.readFileSync(mathPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadMath() {
  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  vm.runInContext(
    mathJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: mathPath }
  );
  return moduleStub.exports as {
    constrainedCornerDrag: (
      corners: QuadCorners,
      draggedCorner: keyof QuadCorners,
      newPos: Point,
      bounds: { width: number; height: number }
    ) => QuadCorners;
    freeCornerDrag: (
      corners: QuadCorners,
      draggedCorner: keyof QuadCorners,
      newPos: Point,
      bounds: { width: number; height: number }
    ) => QuadCorners;
    isConvexQuad: (corners: QuadCorners) => boolean;
    overlayHasInnerInsideOuter: (overlay: { outer: QuadCorners; inner: QuadCorners }) => boolean;
    pointInConvexQuad: (point: Point, corners: QuadCorners) => boolean;
    rotateCorners: (corners: QuadCorners, deltaDegrees: number, center: Point) => QuadCorners;
    computeMeasurements: (overlay: { outer: QuadCorners; inner: QuadCorners }) => {
      leftPct: number;
      rightPct: number;
      topPct: number;
      bottomPct: number;
      worstAxisMaxPct: number;
    };
  };
}

type Point = {
  x: number;
  y: number;
};

type QuadCorners = {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
};

const rect: QuadCorners = {
  tl: { x: 40, y: 40 },
  tr: { x: 200, y: 40 },
  br: { x: 200, y: 260 },
  bl: { x: 40, y: 260 },
};

const bounds = { width: 300, height: 360 };

test("constrainedCornerDrag preserves rectangle shape while moving a corner", () => {
  const math = loadMath();
  const next = math.constrainedCornerDrag(rect, "br", { x: 240, y: 300 }, bounds);

  assert.deepEqual(JSON.parse(JSON.stringify(next)), {
    tl: { x: 40, y: 40 },
    tr: { x: 240, y: 40 },
    br: { x: 240, y: 300 },
    bl: { x: 40, y: 300 },
  });
  assert.equal(math.isConvexQuad(next), true);
});

test("freeCornerDrag applies a valid per-corner move", () => {
  const math = loadMath();
  const next = math.freeCornerDrag(rect, "tl", { x: 52, y: 62 }, bounds);

  assert.deepEqual(JSON.parse(JSON.stringify(next.tl)), { x: 52, y: 62 });
  assert.deepEqual(JSON.parse(JSON.stringify(next.tr)), rect.tr);
  assert.equal(math.isConvexQuad(next), true);
});

test("freeCornerDrag rejects a self-intersecting quad", () => {
  const math = loadMath();
  const next = math.freeCornerDrag(rect, "tl", { x: 260, y: 300 }, bounds);

  assert.deepEqual(JSON.parse(JSON.stringify(next)), rect);
});

test("pointInConvexQuad requires a point to be strictly inside the quad", () => {
  const math = loadMath();

  assert.equal(math.pointInConvexQuad({ x: 120, y: 150 }, rect), true);
  assert.equal(math.pointInConvexQuad({ x: 40, y: 150 }, rect), false);
  assert.equal(math.pointInConvexQuad({ x: 24, y: 150 }, rect), false);
});

test("overlayHasInnerInsideOuter rejects inner corners outside the outer quad", () => {
  const math = loadMath();

  assert.equal(
    math.overlayHasInnerInsideOuter({
      outer: rect,
      inner: {
        tl: { x: 70, y: 70 },
        tr: { x: 170, y: 70 },
        br: { x: 170, y: 230 },
        bl: { x: 70, y: 230 },
      },
    }),
    true
  );
  assert.equal(
    math.overlayHasInnerInsideOuter({
      outer: rect,
      inner: {
        tl: { x: 70, y: 70 },
        tr: { x: 210, y: 70 },
        br: { x: 170, y: 230 },
        bl: { x: 70, y: 230 },
      },
    }),
    false
  );
});

test("rotateCorners rotates every corner around the supplied center", () => {
  const math = loadMath();
  const next = math.rotateCorners(rect, 90, { x: 120, y: 150 });

  assert.deepEqual(JSON.parse(JSON.stringify(next)), {
    tl: { x: 230, y: 70 },
    tr: { x: 230, y: 230 },
    br: { x: 10, y: 230 },
    bl: { x: 10, y: 70 },
  });
});

test("computeMeasurements updates ratios after overlay geometry changes", () => {
  const math = loadMath();
  const measurement = math.computeMeasurements({
    outer: rect,
    inner: {
      tl: { x: 70, y: 70 },
      tr: { x: 170, y: 70 },
      br: { x: 170, y: 230 },
      bl: { x: 70, y: 230 },
    },
  });

  assert.equal(measurement.leftPct, 50);
  assert.equal(measurement.rightPct, 50);
  assert.equal(measurement.topPct, 50);
  assert.equal(measurement.bottomPct, 50);
  assert.equal(measurement.worstAxisMaxPct, 50);
});
