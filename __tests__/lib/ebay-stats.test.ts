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
  KNOWN_GRADERS: readonly string[];
  parseGrade: (title: string) => {
    grader: string | null;
    grade: number | null;
    sale_type: string;
  };
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

test("parseGrade recognizes every known grader, including CGC, TAG, and ARS", () => {
  const { KNOWN_GRADERS, parseGrade } = loadStats();

  for (const grader of ["CGC", "TAG", "ARS"]) {
    assert.ok(KNOWN_GRADERS.includes(grader), `${grader} missing from KNOWN_GRADERS`);
  }

  const cases: Array<[string, string, number]> = [
    ["2023 PSA 10 Monkey D Luffy OP01-024", "PSA", 10],
    ["One Piece BGS 9.5 Shanks Manga Rare", "BGS", 9.5],
    ["CGC 9.5 Nami OP01-016 Alt Art", "CGC", 9.5],
    ["TAG 10 Roronoa Zoro OP01-025", "TAG", 10],
    ["ARS 10 Portgas D Ace OP02-013", "ARS", 10],
    ["ARS10 Yamato OP06-118 Japanese", "ARS", 10], // no-space form common on JP listings
    ["SGC 8.5 Kaido OP04-044", "SGC", 8.5],
    ["ACE 10 Sanji OP03-076", "ACE", 10],
    ["psa 10 lowercase title", "PSA", 10],
    ["Luffy PSA-10 hyphenated", "PSA", 10],
  ];

  for (const [title, grader, grade] of cases) {
    const parsed = parseGrade(title);
    assert.equal(parsed.grader, grader, title);
    assert.equal(parsed.grade, grade, title);
    assert.equal(parsed.sale_type, "graded", title);
  }
});

test("parseGrade falls back to raw on ungraded or malformed titles", () => {
  const { parseGrade } = loadStats();

  for (const title of [
    "Luffy OP01-024 Alt Art NM",
    "PSA 100 nonsense run-on", // trailing \b must reject three-digit grades
    "Case for PSA submission",
    "TCG card lot",
    "",
  ]) {
    const parsed = parseGrade(title);
    assert.equal(parsed.grader, null, title);
    assert.equal(parsed.grade, null, title);
    assert.equal(parsed.sale_type, "raw", title);
  }
});

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
