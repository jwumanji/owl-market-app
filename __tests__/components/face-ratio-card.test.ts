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
    vm.createContext({ console, exports: moduleStub.exports, module: moduleStub, process, require: localRequire }),
    { filename: absolutePath }
  );

  cache.set(absolutePath, moduleStub.exports);
  return moduleStub.exports as T;
}

type FaceRatioCardModule = {
  default: (props: Record<string, unknown>) => React.ReactElement;
};

function load() {
  return loadModule<FaceRatioCardModule>("src/components/lens/FaceRatioCard.tsx");
}

// L/R worst 52 → gain · T/B worst 57 → owl (borderline) · front worst 57 → PSA_9.
const measurement = {
  leftPct: 52,
  rightPct: 48,
  topPct: 57,
  bottomPct: 43,
  worstAxis: "topBottom" as const,
  worstAxisMaxPct: 57,
  gaps: { leftPx: 26, rightPx: 24, topPx: 57, bottomPx: 43 },
};

test("FaceRatioCard exposes selectable button semantics and keyboard activation", () => {
  const mod = load();
  let selected = 0;
  let prevented = 0;
  const element = mod.default({
    face: "front",
    measurement,
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
  assert.match(element.props.className, /border-coral/);

  element.props.onClick();
  element.props.onKeyDown({ key: "Enter", preventDefault: () => { prevented += 1; } });
  element.props.onKeyDown({ key: " ", preventDefault: () => { prevented += 1; } });
  element.props.onKeyDown({ key: "Tab", preventDefault: () => { prevented += 1; } });

  assert.equal(selected, 3); // click + Enter + Space (Tab ignored)
  assert.equal(prevented, 2);
});

test("FaceRatioCard is non-interactive without onSelect", () => {
  const mod = load();
  const element = mod.default({ face: "back", measurement, isActive: false }) as React.ReactElement;

  assert.equal(element.props.role, undefined);
  assert.equal(element.props.tabIndex, undefined);
  assert.equal(element.props.onKeyDown, undefined);
  assert.doesNotMatch(element.props.className, /cursor-pointer/);
});

test("FaceRatioCard ceiling badge uses grade tier color and can be hidden", () => {
  const mod = load();
  // Front worst 82 → PSA_5 → grade-low band; the badge style carries the inline color var.
  const withBadge = renderToStaticMarkup(
    React.createElement(mod.default, { face: "front", measurement: { ...measurement, worstAxisMaxPct: 82 }, isActive: false })
  );
  const withoutBadge = renderToStaticMarkup(
    React.createElement(mod.default, {
      face: "front",
      measurement: { ...measurement, worstAxisMaxPct: 82 },
      isActive: false,
      showCeiling: false,
    })
  );

  assert.match(withBadge, /color:var\(--grade-low\)/);
  assert.doesNotMatch(withoutBadge, /color:var\(--grade-low\)/);
});

test("FaceRatioCard renders axis tones and the worst-face marker", () => {
  const mod = load();
  const html = renderToStaticMarkup(
    React.createElement(mod.default, { face: "front", measurement, isActive: true, isWorst: true })
  );

  // L/R is comfortable (gain → grade-10 green); T/B is borderline (owl → grade-8b amber).
  assert.match(html, /text-grade-10/);
  assert.match(html, /text-grade-8b/);
  assert.match(html, /Worst axis/);
  assert.match(html, /T\/B @ 57%/);
  assert.match(html, /worst face/);
  assert.match(html, /data-face-ratio-card="front"/);
});

test("FaceRatioCard back face uses the looser back PSA standard", () => {
  const mod = load();
  // Back worst 70 is well inside the 75/25 back gem-mint window → PSA 10 (grade-10 band).
  const html = renderToStaticMarkup(
    React.createElement(mod.default, { face: "back", measurement: { ...measurement, worstAxisMaxPct: 70 }, isActive: false })
  );

  assert.match(html, /color:var\(--grade-10\)/);
});
