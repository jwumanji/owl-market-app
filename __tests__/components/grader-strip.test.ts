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
  if (specifier.startsWith("@/")) return resolveWithExtension(path.resolve("src", specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveWithExtension(path.resolve(path.dirname(fromPath), specifier));
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

type GraderStripModule = {
  default: (props: { worstMax?: number; frontWorstMax?: number; backWorstMax?: number | null }) => React.ReactElement | null;
};

test("GraderStrip applies grade-tier colors to the grader badges", () => {
  const strip = loadModule<GraderStripModule>("src/components/lens/GraderStrip.tsx");
  const html = renderToStaticMarkup(React.createElement(strip.default, { worstMax: 70 }));

  // worst 70 → PSA_8 / BGS_8 (grade-8) and TAG_5 (grade-low) on the band scale.
  assert.match(html, /color:var\(--grade-8\)/);
  assert.match(html, /color:var\(--grade-low\)/);
});

test("GraderStrip renders nothing without a worst-max input", () => {
  const strip = loadModule<GraderStripModule>("src/components/lens/GraderStrip.tsx");
  const element = strip.default({});
  assert.equal(element, null);
});
