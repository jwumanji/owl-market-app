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

type OverlayPanelModule = {
  default: React.ComponentType<{
    overlay: OverlayGeometry;
    imageSize: { width: number; height: number };
    imageUrl?: string | null;
    freeCorners: boolean;
    mode?: "review" | "edit" | "readonly";
    adjusted?: boolean;
    onOverlayChange: (overlay: OverlayGeometry) => void;
  }>;
  OVERLAY_SCREEN_TARGETS: {
    cornerHandle: number;
    rotationHandle: number;
    degreeDialFont: number;
    axisLabelFont: number;
    axisLabelPaddingX: number;
    axisLabelPaddingY: number;
    strokeWidth: number;
    focusRing: number;
    workspaceMinHeight: number;
    workspacePadding: number;
  };
  screenPxToSvgUnits: (screenPx: number, svgScale: number) => number;
};

type OverlayGeometry = {
  outer: QuadCorners;
  inner: QuadCorners;
};

type QuadCorners = {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
};

const overlay: OverlayGeometry = {
  outer: {
    tl: { x: 50, y: 40 },
    tr: { x: 450, y: 40 },
    br: { x: 450, y: 640 },
    bl: { x: 50, y: 640 },
  },
  inner: {
    tl: { x: 92, y: 100 },
    tr: { x: 408, y: 100 },
    br: { x: 408, y: 580 },
    bl: { x: 92, y: 580 },
  },
};

const toneThresholdOverlay: OverlayGeometry = {
  outer: {
    tl: { x: 0, y: 0 },
    tr: { x: 100, y: 0 },
    br: { x: 100, y: 100 },
    bl: { x: 0, y: 100 },
  },
  inner: {
    tl: { x: 20, y: 30 },
    tr: { x: 60, y: 30 },
    br: { x: 60, y: 80 },
    bl: { x: 20, y: 80 },
  },
};

test("overlay sizing helper preserves fixed screen pixels across SVG scales", () => {
  const panel = loadModule<OverlayPanelModule>("src/components/lens/ImageOverlayPanel.tsx");

  assert.equal(panel.screenPxToSvgUnits(panel.OVERLAY_SCREEN_TARGETS.cornerHandle, 0.5) * 0.5, 12);
  assert.equal(panel.screenPxToSvgUnits(panel.OVERLAY_SCREEN_TARGETS.cornerHandle, 2) * 2, 12);
  assert.equal(panel.screenPxToSvgUnits(panel.OVERLAY_SCREEN_TARGETS.degreeDialFont, 0), 14);
  assert.equal(panel.screenPxToSvgUnits(panel.OVERLAY_SCREEN_TARGETS.axisLabelFont, 2) * 2, 14);
  assert.equal(panel.OVERLAY_SCREEN_TARGETS.axisLabelPaddingX, 8);
  assert.equal(panel.OVERLAY_SCREEN_TARGETS.axisLabelPaddingY, 4);
  assert.equal(panel.OVERLAY_SCREEN_TARGETS.rotationHandle, 16);
  assert.equal(panel.OVERLAY_SCREEN_TARGETS.strokeWidth, 2);
  assert.equal(panel.OVERLAY_SCREEN_TARGETS.focusRing, 3);
});

test("ImageOverlayPanel renders fixed pixel handles and non-scaling strokes", () => {
  const panel = loadModule<OverlayPanelModule>("src/components/lens/ImageOverlayPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      overlay,
      imageSize: { width: 500, height: 700 },
      imageUrl: "https://example.test/card.jpg",
      freeCorners: false,
      onOverlayChange: () => undefined,
    })
  );

  assert.match(html, /data-screen-px="12"/);
  assert.match(html, /data-screen-px="16"/);
  assert.match(html, /vector-effect="non-scaling-stroke"/);
  assert.match(html, /stroke-width="2"/);
});

test("ImageOverlayPanel workspace enforces min height and 24px padding", () => {
  const panel = loadModule<OverlayPanelModule>("src/components/lens/ImageOverlayPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      overlay,
      imageSize: { width: 500, height: 700 },
      freeCorners: false,
      onOverlayChange: () => undefined,
    })
  );

  assert.match(html, /data-lens-workspace-panel="true"/);
  assert.match(html, /data-workspace-min-height="600"/);
  assert.match(html, /data-workspace-padding="24"/);
  assert.match(html, /min-h-\[600px\]/);
  assert.match(html, /p-6/);
});

test("ImageOverlayPanel renders 14px tone-colored axis labels", () => {
  const panel = loadModule<OverlayPanelModule>("src/components/lens/ImageOverlayPanel.tsx");
  const html = renderToStaticMarkup(
    React.createElement(panel.default, {
      overlay: toneThresholdOverlay,
      imageSize: { width: 100, height: 100 },
      freeCorners: false,
      mode: "readonly",
      onOverlayChange: () => undefined,
    })
  );

  assert.equal((html.match(/data-axis-label="/g) ?? []).length, 4);
  assert.equal((html.match(/data-screen-px="14"/g) ?? []).length, 4);
  assert.match(html, /font-size="14"/);
  assert.match(html, /stroke="var\(--ink\)"/);
  assert.match(html, /fill="var\(--grade-10\)"/);
  assert.match(html, /fill="var\(--grade-8b\)"/);
  assert.match(html, /fill="var\(--grade-low\)"/);
});
