import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);

function resolveSourceModule(specifier: string, fromPath: string) {
  if (specifier.startsWith("@/")) {
    return resolveWithExtension(path.resolve("src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return resolveWithExtension(path.resolve(path.dirname(fromPath), specifier));
  }
  return null;
}

function resolveWithExtension(base: string) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function transpile(filePath: string) {
  return ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadModule<T>(filePath: string, cache = new Map<string, unknown>()): T {
  const absolutePath = path.resolve(filePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath) as T;

  const moduleStub = { exports: {} as Record<string, unknown> };
  cache.set(absolutePath, moduleStub.exports);

  function localRequire(specifier: string) {
    const sourcePath = resolveSourceModule(specifier, absolutePath);
    if (sourcePath) return loadModule(sourcePath, cache);
    return requireFromTest(specifier);
  }

  vm.runInContext(
    transpile(absolutePath),
    vm.createContext({
      console,
      exports: moduleStub.exports,
      module: moduleStub,
      process,
      require: localRequire,
    }),
    { filename: absolutePath }
  );

  cache.set(absolutePath, moduleStub.exports);
  return moduleStub.exports as T;
}

type LensFace = "front" | "back";

type Measurement = {
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

type OverlayGeometry = {
  outer: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  };
  inner: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  };
};

type FaceState = {
  face: LensFace;
  overlay: OverlayGeometry;
  imageSize: { width: number; height: number };
  imageUrl?: string | null;
  adjusted?: boolean;
  freeCorners?: boolean;
};

type FaceResultCardModule = {
  default: (props: {
    face: LensFace;
    measurement: Measurement;
    overlay?: OverlayGeometry | null;
    imageSize?: { width: number; height: number } | null;
    imageUrl?: string | null;
    isWorst?: boolean;
    isActive: boolean;
    onSelect?: () => void;
  }) => React.ReactElement;
};

type ResultsPanelModule = {
  default: (props: {
    faces: Partial<Record<LensFace, FaceState>>;
    activeFace?: LensFace;
    cardIdentity?: string | null;
    onActiveFaceChange?: (face: LensFace) => void;
    onDownloadReport: () => void;
    onMeasureAnother: () => void;
  }) => React.ReactElement;
};

type MeasurementNumbersPanelModule = {
  default: (props: {
    activeFace: LensFace;
    faces: Partial<Record<LensFace, FaceState>>;
    measurements: Partial<Record<LensFace, Measurement>>;
    freeCorners: boolean;
    adjusted: boolean;
    mode?: "review" | "edit";
    showAddBack?: boolean;
    saving?: boolean;
    onActiveFaceChange?: (face: LensFace) => void;
    onFreeCornersChange: (enabled: boolean) => void;
    onAddBack?: () => void;
    onSave: () => void;
    onReset: () => void;
    onCancel: () => void;
  }) => React.ReactElement;
};

type ReviewWorkspaceModule = {
  default: (props: {
    faces: Partial<Record<LensFace, FaceState>>;
    activeFace: LensFace;
    mode?: "review" | "edit";
    cardIdentity?: string | null;
    onActiveFaceChange: (face: LensFace) => void;
    onOverlayChange: (face: LensFace, overlay: OverlayGeometry) => void;
    onFreeCornersChange: (face: LensFace, enabled: boolean) => void;
    onAddBack?: () => void;
    onSave: () => void;
    onResetFace: (face: LensFace) => void;
    onCancel: () => void;
  }) => React.ReactElement;
};

const measurement: Measurement = {
  leftPct: 52,
  rightPct: 48,
  topPct: 57,
  bottomPct: 43,
  worstAxis: "topBottom",
  worstAxisMaxPct: 57,
  gaps: {
    leftPx: 26,
    rightPx: 24,
    topPx: 57,
    bottomPx: 43,
  },
};

const frontOverlay: OverlayGeometry = {
  outer: {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    br: { x: 100, y: 140 },
    bl: { x: 0, y: 140 },
  },
  inner: {
    tl: { x: 24, y: 28 },
    tr: { x: 74, y: 28 },
    br: { x: 74, y: 108 },
    bl: { x: 24, y: 108 },
  },
};

const backOverlay: OverlayGeometry = {
  outer: {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    br: { x: 100, y: 140 },
    bl: { x: 0, y: 140 },
  },
  inner: {
    tl: { x: 30, y: 30 },
    tr: { x: 70, y: 30 },
    br: { x: 70, y: 102 },
    bl: { x: 30, y: 102 },
  },
};

const faces: Record<LensFace, FaceState> = {
  front: {
    face: "front",
    overlay: frontOverlay,
    imageSize: { width: 100, height: 140 },
  },
  back: {
    face: "back",
    overlay: backOverlay,
    imageSize: { width: 100, height: 140 },
  },
};

function walkElements(node: React.ReactNode, elements: React.ReactElement[] = []) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    elements.push(child);
    walkElements(child.props.children, elements);
  });
  return elements;
}

test("FaceResultCard exposes selectable button semantics and keyboard activation", () => {
  const card = loadModule<FaceResultCardModule>("src/components/lens/FaceResultCard.tsx");
  let selected = 0;
  let prevented = false;
  const element = card.default({
    face: "front",
    measurement,
    isWorst: false,
    isActive: true,
    onSelect: () => {
      selected += 1;
    },
  }) as React.ReactElement;

  assert.equal(element.type, "article");
  assert.equal(element.props.role, "button");
  assert.equal(element.props.tabIndex, 0);
  assert.equal(element.props["aria-label"], "Switch to front face");
  assert.equal(element.props["aria-pressed"], true);
  assert.match(element.props.className, /cursor-pointer/);
  assert.match(element.props.className, /border-owl/);

  element.props.onClick();
  element.props.onKeyDown({
    key: "Enter",
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(selected, 2);
  assert.equal(prevented, true);
});

test("FaceResultCard renders active aria and hover styling", () => {
  const card = loadModule<FaceResultCardModule>("src/components/lens/FaceResultCard.tsx");
  const html = renderToStaticMarkup(
    React.createElement(card.default, {
      face: "back",
      measurement,
      isWorst: true,
      isActive: true,
      onSelect: () => undefined,
    })
  );

  assert.match(html, /role="button"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-label="Switch to back face"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-active="true"/);
  assert.match(html, /hover:border-border-2/);
});

test("ResultsPanel wires face card selection to the active face source of truth", () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");
  let selected: LensFace | null = null;
  const element = panel.default({
    faces,
    activeFace: "back",
    cardIdentity: "OP01-001",
    onActiveFaceChange: (face) => {
      selected = face;
    },
    onDownloadReport: () => undefined,
    onMeasureAnother: () => undefined,
  }) as React.ReactElement;
  const cards = walkElements(element).filter(
    (child) => child.props.face === "front" || child.props.face === "back"
  );
  const frontCard = cards.find((child) => child.props.face === "front");
  const backCard = cards.find((child) => child.props.face === "back");

  assert.ok(frontCard);
  assert.ok(backCard);
  assert.equal(frontCard.props.isActive, false);
  assert.equal(backCard.props.isActive, true);

  frontCard.props.onSelect();
  assert.equal(selected, "front");
});

test("ReviewWorkspace shares active face handler between FaceTabs and result cards", () => {
  const workspace = loadModule<ReviewWorkspaceModule>("src/components/lens/ReviewWorkspace.tsx");
  const selected: LensFace[] = [];
  const element = workspace.default({
    faces,
    activeFace: "back",
    cardIdentity: "OP01-001",
    onActiveFaceChange: (face) => {
      selected.push(face);
    },
    onOverlayChange: () => undefined,
    onFreeCornersChange: () => undefined,
    onSave: () => undefined,
    onResetFace: () => undefined,
    onCancel: () => undefined,
  }) as React.ReactElement;
  const elements = walkElements(element);
  const tabs = elements.find((child) => child.props.adjustedFaces && child.props.onChange);
  const numbersPanel = elements.find((child) => child.props.measurements && child.props.onActiveFaceChange);

  assert.ok(tabs);
  assert.ok(numbersPanel);
  assert.equal(tabs.props.activeFace, "back");
  assert.equal(numbersPanel.props.activeFace, "back");
  assert.equal(tabs.props.onChange, numbersPanel.props.onActiveFaceChange);

  numbersPanel.props.onActiveFaceChange("front");
  tabs.props.onChange("back");
  assert.deepEqual(selected, ["front", "back"]);
});

test("MeasurementNumbersPanel result cards click and keyboard switch faces", () => {
  const panel = loadModule<MeasurementNumbersPanelModule>("src/components/lens/MeasurementNumbersPanel.tsx");
  const selected: LensFace[] = [];
  const element = panel.default({
    activeFace: "back",
    faces,
    measurements: { front: measurement, back: { ...measurement, worstAxisMaxPct: 58 } },
    freeCorners: false,
    adjusted: false,
    onActiveFaceChange: (face) => {
      selected.push(face);
    },
    onFreeCornersChange: () => undefined,
    onSave: () => undefined,
    onReset: () => undefined,
    onCancel: () => undefined,
  }) as React.ReactElement;
  const cards = walkElements(element).filter(
    (child) => child.props.face === "front" || child.props.face === "back"
  );
  const frontCard = cards.find((child) => child.props.face === "front");
  const backCard = cards.find((child) => child.props.face === "back");

  assert.ok(frontCard);
  assert.ok(backCard);
  assert.equal(frontCard.props.active, false);
  assert.equal(backCard.props.active, true);

  frontCard.props.onSelect();
  backCard.props.onSelect();

  const renderedFront = (frontCard.type as (props: Record<string, unknown>) => React.ReactElement)(frontCard.props);
  let prevented = 0;
  renderedFront.props.onKeyDown({ key: "Enter", preventDefault: () => { prevented += 1; } });
  renderedFront.props.onKeyDown({ key: " ", preventDefault: () => { prevented += 1; } });

  assert.deepEqual(selected, ["front", "back", "front", "front"]);
  assert.equal(prevented, 2);
});

test("ReviewWorkspace ignores result-card switches to an unmeasured back face", () => {
  const workspace = loadModule<ReviewWorkspaceModule>("src/components/lens/ReviewWorkspace.tsx");
  const selected: LensFace[] = [];
  const element = workspace.default({
    faces: { front: faces.front },
    activeFace: "front",
    onActiveFaceChange: (face) => {
      selected.push(face);
    },
    onOverlayChange: () => undefined,
    onFreeCornersChange: () => undefined,
    onSave: () => undefined,
    onResetFace: () => undefined,
    onCancel: () => undefined,
  }) as React.ReactElement;
  const numbersPanel = walkElements(element).find((child) => child.props.measurements && child.props.onActiveFaceChange);

  assert.ok(numbersPanel);
  numbersPanel.props.onActiveFaceChange("back");
  numbersPanel.props.onActiveFaceChange("front");

  assert.deepEqual(selected, ["front"]);
});
