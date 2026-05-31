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

type MathModule = {
  psaCeilingFront: (worstMax: number) => string;
  psaCeilingBack: (worstMax: number) => string;
  isPsaFrontTenBorderline: (worstMax: number) => boolean;
  bgsCeilingFront: (worstMax: number) => string;
  bgsCeilingBack: (worstMax: number) => string;
  tagCeilingFront: (worstMax: number, category?: "tcg" | "sports") => string;
  tagCeilingBack: (worstMax: number, category?: "tcg" | "sports") => string;
  combinedCeiling: <TGrade extends string>(front: TGrade, back: TGrade | null) => {
    ceiling: TGrade;
    front: TGrade;
    back: TGrade | null;
    frontOnly: boolean;
  };
};

function loadMath() {
  const moduleStub = { exports: {} as Record<string, unknown> };
  vm.runInContext(
    mathJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: mathPath }
  );
  return moduleStub.exports as MathModule;
}

test("PSA threshold tables apply front and back boundaries independently", () => {
  const math = loadMath();

  assert.equal(math.psaCeilingFront(55), "PSA_10");
  assert.equal(math.psaCeilingFront(55.01), "PSA_9");
  assert.equal(math.psaCeilingFront(70.26), "PSA_7");
  assert.equal(math.psaCeilingFront(75.01), "PSA_6");
  assert.equal(math.psaCeilingBack(75), "PSA_10");
  assert.equal(math.psaCeilingBack(75.01), "PSA_9");
  assert.equal(math.psaCeilingBack(90.01), "PSA_2_OR_LESS");
});

test("PSA front 10 uses a 55/45 confident cutoff with a 55–60 borderline band", () => {
  const math = loadMath();

  // 55/45 or better is a confident 10; the 55–60 band falls to a conservative 9.
  assert.equal(math.psaCeilingFront(55), "PSA_10");
  assert.equal(math.psaCeilingFront(57), "PSA_9");
  assert.equal(math.psaCeilingFront(60), "PSA_9");

  // The borderline band is the open-closed interval (55, 60].
  assert.equal(math.isPsaFrontTenBorderline(55), false);
  assert.equal(math.isPsaFrontTenBorderline(55.01), true);
  assert.equal(math.isPsaFrontTenBorderline(60), true);
  assert.equal(math.isPsaFrontTenBorderline(60.01), false);
});

test("BGS threshold tables apply front and back boundaries independently", () => {
  const math = loadMath();

  assert.equal(math.bgsCeilingFront(51), "BGS_10");
  assert.equal(math.bgsCeilingFront(51.01), "BGS_9_5");
  assert.equal(math.bgsCeilingFront(70.26), "BGS_7_5");
  assert.equal(math.bgsCeilingBack(60), "BGS_9_5");
  assert.equal(math.bgsCeilingBack(60.01), "BGS_9");
  assert.equal(math.bgsCeilingBack(95.01), "BGS_7_5");
});

test("TAG thresholds use TCG by default and support Sports back tolerances", () => {
  const math = loadMath();

  assert.equal(math.tagCeilingFront(62.5), "TAG_8");
  assert.equal(math.tagCeilingFront(62.51), "TAG_7");
  assert.equal(math.tagCeilingFront(70.01), "TAG_4_OR_LESS");
  assert.equal(math.tagCeilingBack(68), "TAG_9");
  assert.equal(math.tagCeilingBack(68, "tcg"), "TAG_9");
  assert.equal(math.tagCeilingBack(68, "sports"), "TAG_10_GEM_MINT");
  assert.equal(math.tagCeilingBack(96, "tcg"), "TAG_6_OR_LESS");
  assert.equal(math.tagCeilingBack(96, "sports"), "TAG_7_OR_LESS");
});

test("combinedCeiling returns the worse grade and preserves front-only state", () => {
  const math = loadMath();

  assert.deepEqual(JSON.parse(JSON.stringify(math.combinedCeiling("PSA_7", "PSA_10"))), {
    ceiling: "PSA_7",
    front: "PSA_7",
    back: "PSA_10",
    frontOnly: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(math.combinedCeiling("TAG_10_GEM_MINT", null))), {
    ceiling: "TAG_10_GEM_MINT",
    front: "TAG_10_GEM_MINT",
    back: null,
    frontOnly: true,
  });
});
