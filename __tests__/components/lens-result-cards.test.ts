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

type GraderStripModule = {
  default: (props: {
    worstMax?: number;
    frontWorstMax?: number;
    backWorstMax?: number | null;
    category?: "tcg" | "sports";
  }) => React.ReactElement | null;
};

type ResultsPanelModule = {
  default: (props: {
    faces: Partial<Record<LensFace, FaceState>>;
    activeFace?: LensFace;
    cardIdentity?: string | null;
    cardSessionId?: string | null;
    onActiveFaceChange?: (face: LensFace) => void;
    onCardIdentityChange?: (value: string) => void;
    onReMeasure: () => void;
    onMeasureAnother: () => void;
  }) => React.ReactElement;
  reportCardNameDisplay: (cardIdentity?: string | null) => string;
  reportCardNameKeyAction: (key: string) => "commit" | "cancel" | null;
  saveReportCardIdentity: (input: {
    sessionId?: string | null;
    cardIdentity: string;
    fetchImpl: typeof fetch;
  }) => Promise<unknown>;
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

test("FaceResultCard ceiling badge uses grade tier color", () => {
  const card = loadModule<FaceResultCardModule>("src/components/lens/FaceResultCard.tsx");
  const html = renderToStaticMarkup(
    React.createElement(card.default, {
      face: "front",
      measurement: { ...measurement, worstAxisMaxPct: 82 },
      isWorst: true,
      isActive: false,
    })
  );

  assert.match(html, /color:var\(--coral\)/);
  assert.match(html, /border-color:var\(--coral\)/);
  assert.doesNotMatch(html, /tinted-loss text-loss/);
});

test("GraderStrip applies tier colors to grader grade badges", () => {
  const strip = loadModule<GraderStripModule>("src/components/lens/GraderStrip.tsx");
  const html = renderToStaticMarkup(React.createElement(strip.default, { worstMax: 70 }));

  assert.match(html, /color:var\(--owl\)/);
  assert.match(html, /color:var\(--coral\)/);
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
    onReMeasure: () => undefined,
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

test("ResultsPanel renders saved report hero and large face cards", () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      faces: {
        front: { ...faces.front, imageUrl: "https://example.test/front.jpg" },
        back: { ...faces.back, imageUrl: "https://example.test/back.jpg" },
      },
      activeFace: "front",
      cardIdentity: "OP01-001",
      onActiveFaceChange: () => undefined,
      onReMeasure: () => undefined,
      onMeasureAnother: () => undefined,
    })
  );

  assert.match(html, /data-results-report="true"/);
  assert.match(html, /data-report-card-name="true"/);
  assert.match(html, /OP01-001/);
  assert.match(html, /data-report-combined-hero="true"/);
  assert.match(html, /worse of front · back/);
  assert.match(html, /data-report-face-card="front"/);
  assert.match(html, /data-report-face-card="back"/);
  assert.match(html, /aspect-\[2\.5\/3\.5\]/);
  assert.match(html, /Re-measure/);
  assert.match(html, /Measure another/);
  assert.doesNotMatch(html, /Download report/);
  assert.match(html, /href="\/admin\/lens\/pregrade\/history"/);
  assert.match(html, /aria-label="Back to pre-grade summary"/);
  assert.match(html, /Back to pre-grade summary/);

  const actionBlock = html.match(/<div(?=[^>]*data-report-actions="true")[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.notEqual(actionBlock, "");
  assert.equal(actionBlock.match(/<button/g)?.length ?? 0, 2);
  assert.match(actionBlock, /Re-measure/);
  assert.match(actionBlock, /Measure another/);
  assert.doesNotMatch(actionBlock, /Download report/);
});

test("ResultsPanel front-only report uses untitled fallback and omits back card", () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      faces: { front: faces.front },
      activeFace: "front",
      cardIdentity: "",
      onActiveFaceChange: () => undefined,
      onReMeasure: () => undefined,
      onMeasureAnother: () => undefined,
    })
  );

  assert.match(html, /Untitled card/);
  assert.match(html, /front only \(back not measured\)/);
  assert.match(html, /data-report-face-card="front"/);
  assert.doesNotMatch(html, /data-report-face-card="back"/);
});

test("ResultsPanel card name renders editable affordance and display fallback", () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      faces: { front: faces.front },
      activeFace: "front",
      cardIdentity: null,
      cardSessionId: "11111111-1111-4111-8111-111111111111",
      onCardIdentityChange: () => undefined,
      onReMeasure: () => undefined,
      onMeasureAnother: () => undefined,
    })
  );

  assert.equal(panel.reportCardNameDisplay("  Nami  "), "Nami");
  assert.equal(panel.reportCardNameDisplay("  "), "Untitled card");
  assert.match(html, /aria-label="Edit card name"/);
  assert.match(html, /data-card-name-edit-button="true"/);
  assert.match(html, /Untitled card/);
  assert.doesNotMatch(html, />Edit</);
});

test("ResultsPanel card name keyboard helper commits Enter and cancels Escape", () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");

  assert.equal(panel.reportCardNameKeyAction("Enter"), "commit");
  assert.equal(panel.reportCardNameKeyAction("Escape"), "cancel");
  assert.equal(panel.reportCardNameKeyAction("Tab"), null);
});

test("saveReportCardIdentity PATCHes card_identity on the saved session", async () => {
  const panel = loadModule<ResultsPanelModule>("src/components/lens/ResultsPanel.tsx");
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ session: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await panel.saveReportCardIdentity({
    sessionId: "session-id",
    cardIdentity: "  Nami  ",
    fetchImpl,
  });
  await panel.saveReportCardIdentity({
    sessionId: "session-id",
    cardIdentity: "",
    fetchImpl,
  });

  assert.equal(calls[0].url, "/api/centering/session/session-id");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { card_identity: "Nami" });
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { card_identity: null });
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
