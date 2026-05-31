import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
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
    if (specifier === "next/link") {
      return { __esModule: true, default: () => null };
    }
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

type ResultScreenModule = {
  default: (props: Record<string, unknown>) => React.ReactElement;
};

function walkElements(node: React.ReactNode, elements: React.ReactElement[] = []) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    elements.push(child);
    walkElements(child.props.children, elements);
  });
  return elements;
}

const overlay = {
  outer: { tl: { x: 0, y: 0 }, tr: { x: 100, y: 0 }, br: { x: 100, y: 140 }, bl: { x: 0, y: 140 } },
  inner: { tl: { x: 24, y: 28 }, tr: { x: 74, y: 28 }, br: { x: 74, y: 108 }, bl: { x: 24, y: 108 } },
};

const faces = {
  front: { face: "front" as LensFace, overlay, imageUrl: null, imageSize: { width: 100, height: 140 } },
};

function screenProps(overrides: Record<string, unknown> = {}) {
  return {
    faces,
    activeFace: "front" as LensFace,
    resultMode: "view",
    saved: false,
    cardIdentity: "Zoro OP01",
    cardSessionId: null,
    onActiveFaceChange: () => undefined,
    onEnterAdjust: () => undefined,
    onExitAdjust: () => undefined,
    onOverlayChange: () => undefined,
    onFreeCornersChange: () => undefined,
    onResetFace: () => undefined,
    onAddBack: () => undefined,
    onSave: () => undefined,
    onCardIdentityChange: () => undefined,
    onReMeasure: () => undefined,
    onMeasureAnother: () => undefined,
    ...overrides,
  };
}

function render(overrides: Record<string, unknown> = {}) {
  const mod = loadModule<ResultScreenModule>("src/components/lens/ResultScreen.tsx");
  const element = mod.default(screenProps(overrides)) as React.ReactElement;
  return { element, all: walkElements(element) };
}

function hasData(all: React.ReactElement[], attr: string) {
  return all.some((el) => el.props?.[attr] === "true");
}

function overlayPanel(all: React.ReactElement[]) {
  // ImageOverlayPanel is the element that receives both an overlay and a mode.
  return all.find((el) => el.props?.overlay && typeof el.props?.mode === "string");
}

test("ResultScreen shows the report and Save in pre-save view mode", () => {
  const { element, all } = render({ resultMode: "view", saved: false });

  assert.equal(element.props["data-result-screen"], "true");
  assert.equal(element.props["data-result-mode"], "view");
  // Report is visible pre-save: the combined ceiling card receives the grader data.
  assert.ok(all.some((el) => el.props?.combined));
  // View mode: overlay is non-interactive, "Adjust borders" is offered, Save is available.
  assert.equal(overlayPanel(all)?.props.mode, "readonly");
  assert.ok(hasData(all, "data-adjust-borders"));
  assert.ok(hasData(all, "data-save-to-inventory"));
  assert.ok(!hasData(all, "data-re-measure"));
  assert.ok(!hasData(all, "data-done-adjusting"));
});

test("ResultScreen swaps in the editor and Done in adjust mode", () => {
  const { element, all } = render({ resultMode: "adjust", saved: false });

  assert.equal(element.props["data-result-mode"], "adjust");
  // Adjust mode: the same panel becomes interactive (review for an unsaved draft).
  assert.equal(overlayPanel(all)?.props.mode, "review");
  assert.ok(hasData(all, "data-done-adjusting"));
  assert.ok(!hasData(all, "data-adjust-borders"));
  // Save is still reachable while adjusting (commits the current overlay).
  assert.ok(hasData(all, "data-save-to-inventory"));
});

test("ResultScreen post-save view offers Re-measure / Measure another and hides Save", () => {
  const { all } = render({ resultMode: "view", saved: true, cardSessionId: "11111111-1111-4111-8111-111111111111" });

  assert.ok(hasData(all, "data-re-measure"));
  assert.ok(hasData(all, "data-measure-another"));
  assert.ok(!hasData(all, "data-save-to-inventory"));
});

test("ResultScreen post-save adjust uses edit mode and an Update label", () => {
  const { all } = render({ resultMode: "adjust", saved: true, cardSessionId: "11111111-1111-4111-8111-111111111111" });

  // Editing a saved session keeps the saved baseline (edit mode) and Save reappears as an update.
  assert.equal(overlayPanel(all)?.props.mode, "edit");
  assert.ok(hasData(all, "data-save-to-inventory"));
});
