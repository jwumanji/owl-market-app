import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);
const statsPath = path.resolve("src/lib/ebay-stats.ts");
const statsJavaScript = ts.transpileModule(fs.readFileSync(statsPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type SaleInput = {
  sale_price: number | null;
  sale_type: string | null;
  grader: string | null;
};

type StatsModule = {
  isGradedSale: (sale: Pick<SaleInput, "sale_type" | "grader">) => boolean;
  computeEbayAvgStats: (rows: SaleInput[]) => {
    rawAvg: number | null;
    rawCount: number;
    gradedAvg: number | null;
    gradedCount: number;
  };
};

function loadStats() {
  const moduleStub = { exports: {} as Record<string, unknown> };
  vm.runInContext(
    statsJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: statsPath }
  );
  return moduleStub.exports as StatsModule;
}

test("raw and graded averages never blend — a PSA 10 cannot skew the raw avg", () => {
  const { computeEbayAvgStats } = loadStats();

  const stats = computeEbayAvgStats([
    { sale_price: 10, sale_type: "raw", grader: null },
    { sale_price: 20, sale_type: "raw", grader: null },
    { sale_price: 500, sale_type: "graded", grader: "PSA" },
  ]);

  assert.equal(stats.rawAvg, 15);
  assert.equal(stats.rawCount, 2);
  assert.equal(stats.gradedAvg, 500);
  assert.equal(stats.gradedCount, 1);
});

test("grader presence marks a sale graded even when sale_type is missing", () => {
  const { isGradedSale, computeEbayAvgStats } = loadStats();

  // Older rows predate the sale_type column.
  assert.equal(isGradedSale({ sale_type: null, grader: "BGS" }), true);
  assert.equal(isGradedSale({ sale_type: "graded", grader: null }), true);
  assert.equal(isGradedSale({ sale_type: "raw", grader: null }), false);
  assert.equal(isGradedSale({ sale_type: null, grader: null }), false);

  const stats = computeEbayAvgStats([
    { sale_price: 100, sale_type: null, grader: "BGS" },
    { sale_price: 10, sale_type: null, grader: null },
  ]);
  assert.equal(stats.gradedCount, 1);
  assert.equal(stats.rawCount, 1);
});

test("null, zero, and non-finite prices are excluded from both populations", () => {
  const { computeEbayAvgStats } = loadStats();

  const stats = computeEbayAvgStats([
    { sale_price: null, sale_type: "raw", grader: null },
    { sale_price: 0, sale_type: "raw", grader: null },
    { sale_price: -5, sale_type: "graded", grader: "PSA" },
    { sale_price: Number.NaN, sale_type: "raw", grader: null },
  ]);

  assert.equal(stats.rawAvg, null);
  assert.equal(stats.rawCount, 0);
  assert.equal(stats.gradedAvg, null);
  assert.equal(stats.gradedCount, 0);
});

test("empty input yields null averages with zero counts", () => {
  const { computeEbayAvgStats } = loadStats();
  // Field-wise asserts: the vm-realm object has a foreign Object.prototype,
  // which deepStrictEqual rejects.
  const stats = computeEbayAvgStats([]);
  assert.equal(stats.rawAvg, null);
  assert.equal(stats.rawCount, 0);
  assert.equal(stats.gradedAvg, null);
  assert.equal(stats.gradedCount, 0);
});
