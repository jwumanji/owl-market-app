import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);
const gradingPath = path.resolve("src/components/lens/grading.ts");
const gradingJavaScript = ts.transpileModule(fs.readFileSync(gradingPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadGrading() {
  const moduleStub = {
    exports: {} as Record<string, unknown>,
  };
  vm.runInContext(
    gradingJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: (specifier: string) => {
        if (specifier === "@/lib/centering-math") {
          return {
            ceilingFromWorstMax: () => "PSA_10",
          };
        }
        return requireFromTest(specifier);
      },
    }),
    { filename: gradingPath }
  );
  return moduleStub.exports as {
    graderResultsFromWorstMax: (worstMax: number) => Array<{ name: string; value: string; tone: string }>;
  };
}

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

  assert.deepEqual(JSON.parse(JSON.stringify(bgs)), { name: "BGS", value: "10", subLabel: "Pristine", tone: "gain" });
});
