import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
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
      exports: moduleStub.exports,
      module: moduleStub,
      require: localRequire,
    }),
    { filename: absolutePath }
  );

  cache.set(absolutePath, moduleStub.exports);
  return moduleStub.exports as T;
}

type GradingModule = {
  gradeTierColor: (grade: number) => string;
  gradeTierColorFromLabel: (label: string) => string;
  graderResultsFromWorstMax: (worstMax: number) => Array<{ name: string; value: string; subLabel?: string; tone: string }>;
  graderResultsFromFaces: (input: {
    front: { worstMax: number };
    back?: { worstMax: number } | null;
    category?: "tcg" | "sports";
  }) => Array<{
    name: string;
    value: string;
    subLabel?: string;
    tone: string;
    frontOnly: boolean;
    ceiling: string;
    breakdown: {
      front: { ceiling: string };
      back: { ceiling: string } | null;
    };
  }>;
};

function loadGrading() {
  return loadModule<GradingModule>("src/components/lens/grading.ts");
}

test("gradeTierColor maps grade ceilings to shared report colors", () => {
  const grading = loadGrading();

  assert.equal(grading.gradeTierColor(10), "var(--grade-10)");
  assert.equal(grading.gradeTierColor(9), "var(--grade-9)");
  assert.equal(grading.gradeTierColor(8.5), "var(--grade-8b)");
  assert.equal(grading.gradeTierColor(8), "var(--grade-8)");
  assert.equal(grading.gradeTierColor(7), "var(--grade-7)");
  assert.equal(grading.gradeTierColor(6.5), "var(--grade-low)");
  assert.equal(grading.gradeTierColor(4), "var(--grade-low)");
});

test("gradeTierColorFromLabel supports compact ceiling labels", () => {
  const grading = loadGrading();

  assert.equal(grading.gradeTierColorFromLabel("≤6"), "var(--grade-low)");
  assert.equal(grading.gradeTierColorFromLabel("<=3"), "var(--grade-low)");
  assert.equal(grading.gradeTierColorFromLabel("9.5"), "var(--grade-9)");
});

test("graderResultsFromWorstMax gives BGS 9.5 the second-tier owl tone", () => {
  const grading = loadGrading();
  const results = grading.graderResultsFromWorstMax(55);

  assert.deepEqual(
    JSON.parse(JSON.stringify(results.map((result) => ({ name: result.name, value: result.value, tone: result.tone })))),
    [
      { name: "PSA", value: "10", tone: "gain" },
      { name: "BGS", value: "9.5", tone: "owl" },
      { name: "TAG", value: "10", tone: "gain" },
    ]
  );
});

test("graderResultsFromWorstMax keeps BGS 10 Pristine as gain", () => {
  const grading = loadGrading();
  const bgs = grading.graderResultsFromWorstMax(51).find((result) => result.name === "BGS");

  assert.deepEqual(JSON.parse(JSON.stringify(bgs)), {
    name: "BGS",
    ceiling: "BGS_10",
    value: "10",
    subLabel: "Pristine",
    tone: "gain",
    frontOnly: true,
    breakdown: {
      front: { ceiling: "BGS_10", value: "10", subLabel: "Pristine", tone: "gain", worstMax: 51 },
      back: null,
    },
  });
});

test("graderResultsFromFaces combines front and back per grader", () => {
  const grading = loadGrading();
  const results = grading.graderResultsFromFaces({
    front: { worstMax: 70.26 },
    back: { worstMax: 62.71 },
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(results.map((result) => ({
      name: result.name,
      ceiling: result.ceiling,
      value: result.value,
      frontOnly: result.frontOnly,
      front: result.breakdown.front.ceiling,
      back: result.breakdown.back?.ceiling,
    })))),
    [
      { name: "PSA", ceiling: "PSA_7", value: "7", frontOnly: false, front: "PSA_7", back: "PSA_10" },
      { name: "BGS", ceiling: "BGS_7_5", value: "7.5", frontOnly: false, front: "BGS_7_5", back: "BGS_9" },
      { name: "TAG", ceiling: "TAG_4_OR_LESS", value: "≤4", frontOnly: false, front: "TAG_4_OR_LESS", back: "TAG_10_GEM_MINT" },
    ]
  );
});
