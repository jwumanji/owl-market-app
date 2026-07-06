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
  grade?: number | null;
  title?: string | null;
};

type Tier =
  | "BLACK_LABEL"
  | "PRISTINE_10"
  | "PSA_10"
  | "BGS_10"
  | "OTHER_10"
  | "GRADE_9";

type StatsModule = {
  KNOWN_GRADERS: readonly string[];
  parseGrade: (title: string) => {
    grader: string | null;
    grade: number | null;
    sale_type: string;
    tier: Tier | null;
  };
  isGradedSale: (sale: Pick<SaleInput, "sale_type" | "grader">) => boolean;
  saleTier: (sale: SaleInput) => Tier | null;
  computeEbayAvgStats: (rows: SaleInput[]) => {
    rawAvg: number | null;
    rawCount: number;
    tiers: Record<Tier, { avg: number | null; count: number }>;
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

test("tier detection: Black Label, Pristine, plain 10s, 9s, and lowercase forms", () => {
  const { parseGrade } = loadStats();

  const cases: Array<[string, Tier | null]> = [
    ["TAG Pristine 10 Monkey D. Dragon SP OP07-015", "PRISTINE_10"],
    ["Pristine Tag 10 Monkey D. Dragon SP OP07-015", "PRISTINE_10"],
    ["BGS 10 Black Label Shanks OP01-120", "BLACK_LABEL"],
    ["BGS 10 BL Shanks OP01-120", "BLACK_LABEL"],
    ["BGS 10 GEM MINT Shanks OP01-120", "BGS_10"],
    ["PSA 10 Luffy OP01-024", "PSA_10"],
    // CGC/SGC/TAG/ACE/ARS plain 10s pool as OTHER_10
    ["CGC 10 Nami OP01-016", "OTHER_10"],
    ["SGC 10 Kaido OP04-044", "OTHER_10"],
    ["TAG 10 GEM MINT Luffy OP13-118", "OTHER_10"],
    ["ACE 10 Sanji OP03-076", "OTHER_10"],
    ["ARS10 Yamato OP06-118", "OTHER_10"],
    // lowercase forms
    ["bgs 10 black label luffy op01-003", "BLACK_LABEL"],
    ["pristine tag 10 zoro op01-025", "PRISTINE_10"],
    ["psa 10 luffy op01-024", "PSA_10"],
    // 9–9.5 band and sub-9 exclusion
    ["PSA 9 MINT Luffy OP01-024", "GRADE_9"],
    ["BGS 9.5 Shanks Manga Rare", "GRADE_9"],
    ["BGS 8.5 Kaido OP04-044", null],
  ];

  for (const [title, tier] of cases) {
    assert.equal(parseGrade(title).tier, tier, title);
  }
});

test("Black Label outranks Pristine when both appear in a title", () => {
  const { parseGrade } = loadStats();
  assert.equal(
    parseGrade("BGS 10 Pristine Black Label Luffy OP01-024").tier,
    "BLACK_LABEL"
  );
  assert.equal(
    parseGrade("bgs 10 black label pristine luffy").tier,
    "BLACK_LABEL"
  );
});

test("lowercase 'bl' alone never triggers Black Label, and BL is BGS-scoped", () => {
  const { parseGrade } = loadStats();
  // "bl" as an ordinary lowercase fragment must not match.
  assert.equal(parseGrade("PSA 10 bl luffy").tier, "PSA_10");
  // Uppercase BL outside BGS doesn't count either.
  assert.equal(parseGrade("PSA 10 BL Luffy").tier, "PSA_10");
});

test("'Blue' and title-case 'Bl' never trigger BL detection, even on BGS", () => {
  const { parseGrade } = loadStats();
  // One Piece cards carry color words — "Blue" on a BGS 10 must stay BGS_10.
  assert.equal(parseGrade("BGS 10 Doflamingo Blue OP01-073").tier, "BGS_10");
  assert.equal(parseGrade("BGS 10 BLUE Luffy OP02-062").tier, "BGS_10");
  // Title-case "Bl" fails the case-sensitive match.
  assert.equal(parseGrade("BGS 10 Bl Luffy OP01-024").tier, "BGS_10");
  // And none of these flip a 9.5 upward.
  assert.equal(parseGrade("BGS 9.5 Blue Zoro OP01-025").tier, "GRADE_9");
});

test("'Black Label' classifies without a grader token; bare 'pristine' does not", () => {
  const { parseGrade } = loadStats();

  // Real listing shape: no "BGS", no number — Black Label is BGS-exclusive
  // and definitionally a 10, so it must not fall into the raw bucket.
  const bl = parseGrade("Monkey D. Dragon Parallel Leader OP07-001 Low Pop Black Label");
  assert.equal(bl.grader, "BGS");
  assert.equal(bl.grade, 10);
  assert.equal(bl.sale_type, "graded");
  assert.equal(bl.tier, "BLACK_LABEL");

  // "pristine" as condition puffery on an ungraded listing stays raw.
  const puffery = parseGrade("Luffy OP01-024 Alt Art pristine condition!");
  assert.equal(puffery.sale_type, "raw");
  assert.equal(puffery.tier, null);
});

test("raw and tier averages never blend — a PSA 10 cannot skew the raw avg", () => {
  const { computeEbayAvgStats } = loadStats();

  const stats = computeEbayAvgStats([
    { sale_price: 10, sale_type: "raw", grader: null, grade: null, title: "Luffy raw NM" },
    { sale_price: 20, sale_type: "raw", grader: null, grade: null, title: "Luffy raw LP" },
    { sale_price: 500, sale_type: "graded", grader: "PSA", grade: 10, title: "PSA 10 Luffy" },
  ]);

  assert.equal(stats.rawAvg, 15);
  assert.equal(stats.rawCount, 2);
  assert.equal(stats.tiers.PSA_10.avg, 500);
  assert.equal(stats.tiers.PSA_10.count, 1);
});

test("per-tier averages split Black Label / Pristine / 10 / 9, sub-9 in no bucket", () => {
  const { computeEbayAvgStats } = loadStats();

  const stats = computeEbayAvgStats([
    { sale_price: 1000, sale_type: "graded", grader: "BGS", grade: 10, title: "BGS 10 Black Label Luffy" },
    { sale_price: 400, sale_type: "graded", grader: "TAG", grade: 10, title: "TAG Pristine 10 Luffy" },
    { sale_price: 200, sale_type: "graded", grader: "PSA", grade: 10, title: "PSA 10 Luffy" },
    { sale_price: 100, sale_type: "graded", grader: "PSA", grade: 10, title: "PSA 10 Luffy alt" },
    { sale_price: 300, sale_type: "graded", grader: "BGS", grade: 10, title: "BGS 10 GEM MINT Luffy" },
    { sale_price: 120, sale_type: "graded", grader: "CGC", grade: 10, title: "CGC 10 Luffy" },
    { sale_price: 140, sale_type: "graded", grader: "ARS", grade: 10, title: "ARS10 Luffy Japanese" },
    { sale_price: 80, sale_type: "graded", grader: "BGS", grade: 9.5, title: "BGS 9.5 Luffy" },
    { sale_price: 50, sale_type: "graded", grader: "PSA", grade: 8, title: "PSA 8 Luffy" },
    { sale_price: 30, sale_type: "raw", grader: null, grade: null, title: "Luffy NM" },
  ]);

  assert.equal(stats.tiers.BLACK_LABEL.avg, 1000);
  assert.equal(stats.tiers.BLACK_LABEL.count, 1);
  assert.equal(stats.tiers.PRISTINE_10.avg, 400);
  assert.equal(stats.tiers.PRISTINE_10.count, 1);
  assert.equal(stats.tiers.PSA_10.avg, 150);
  assert.equal(stats.tiers.PSA_10.count, 2);
  assert.equal(stats.tiers.BGS_10.avg, 300);
  assert.equal(stats.tiers.BGS_10.count, 1);
  assert.equal(stats.tiers.OTHER_10.avg, 130);
  assert.equal(stats.tiers.OTHER_10.count, 2);
  assert.equal(stats.tiers.GRADE_9.avg, 80);
  assert.equal(stats.tiers.GRADE_9.count, 1);
  // The PSA 8 lands nowhere: not raw, not a tier.
  assert.equal(stats.rawAvg, 30);
  assert.equal(stats.rawCount, 1);
});

test("title re-parse outranks stale stored columns in the stats split", () => {
  const { computeEbayAvgStats } = loadStats();

  // Row stored as raw by an older parser, but the title says Black Label —
  // it must move to the BLACK_LABEL bucket, not pollute the raw average.
  const stats = computeEbayAvgStats([
    { sale_price: 900, sale_type: "raw", grader: null, grade: null, title: "Dragon OP07-001 Low Pop Black Label" },
    { sale_price: 30, sale_type: "raw", grader: null, grade: null, title: "Dragon OP07-001 NM" },
  ]);

  assert.equal(stats.tiers.BLACK_LABEL.count, 1);
  assert.equal(stats.tiers.BLACK_LABEL.avg, 900);
  assert.equal(stats.rawCount, 1);
  assert.equal(stats.rawAvg, 30);
});

test("grader presence marks a sale graded even when sale_type is missing", () => {
  const { isGradedSale, saleTier, computeEbayAvgStats } = loadStats();

  // Older rows predate the sale_type column.
  assert.equal(isGradedSale({ sale_type: null, grader: "BGS" }), true);
  assert.equal(isGradedSale({ sale_type: "graded", grader: null }), true);
  assert.equal(isGradedSale({ sale_type: "raw", grader: null }), false);
  assert.equal(isGradedSale({ sale_type: null, grader: null }), false);

  // Without a parseable title, the stored numeric grade + grader decide the
  // tier (label tiers are unknowable from numbers alone).
  assert.equal(
    saleTier({ sale_price: 1, sale_type: "graded", grader: "PSA", grade: 10, title: null }),
    "PSA_10"
  );
  assert.equal(
    saleTier({ sale_price: 1, sale_type: "graded", grader: "CGC", grade: 10, title: null }),
    "OTHER_10"
  );
  assert.equal(
    saleTier({ sale_price: 1, sale_type: "graded", grader: "BGS", grade: 9.5, title: null }),
    "GRADE_9"
  );

  const stats = computeEbayAvgStats([
    { sale_price: 100, sale_type: null, grader: "BGS", grade: 9, title: null },
    { sale_price: 10, sale_type: null, grader: null, grade: null, title: null },
  ]);
  assert.equal(stats.tiers.GRADE_9.count, 1);
  assert.equal(stats.rawCount, 1);
});

test("null, zero, and non-finite prices are excluded from both populations", () => {
  const { computeEbayAvgStats } = loadStats();

  const stats = computeEbayAvgStats([
    { sale_price: null, sale_type: "raw", grader: null },
    { sale_price: 0, sale_type: "raw", grader: null },
    { sale_price: -5, sale_type: "graded", grader: "PSA", grade: 10, title: "PSA 10 Luffy" },
    { sale_price: Number.NaN, sale_type: "raw", grader: null },
  ]);

  assert.equal(stats.rawAvg, null);
  assert.equal(stats.rawCount, 0);
  assert.equal(stats.tiers.PSA_10.avg, null);
  assert.equal(stats.tiers.PSA_10.count, 0);
});

test("empty input yields null averages with zero counts", () => {
  const { computeEbayAvgStats } = loadStats();
  // Field-wise asserts: the vm-realm object has a foreign Object.prototype,
  // which deepStrictEqual rejects.
  const stats = computeEbayAvgStats([]);
  assert.equal(stats.rawAvg, null);
  assert.equal(stats.rawCount, 0);
  for (const tier of [
    "BLACK_LABEL",
    "PRISTINE_10",
    "PSA_10",
    "BGS_10",
    "OTHER_10",
    "GRADE_9",
  ] as const) {
    assert.equal(stats.tiers[tier].avg, null);
    assert.equal(stats.tiers[tier].count, 0);
  }
});
