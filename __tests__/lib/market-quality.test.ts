import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireFromTest = createRequire(import.meta.url);
const qualityPath = path.resolve("src/lib/market-quality.ts");
const qualityJavaScript = ts.transpileModule(fs.readFileSync(qualityPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

type QualityModule = {
  MIN_MOVEMENT_CARD_PRICE_USD: number;
  isMeaningfulMovementPrice: (price: number | null | undefined) => boolean;
  normalizeEbaySalePrice: (price: number | null | undefined) => number | null;
  formatEbaySalePrice: (price: number | null | undefined) => string;
};

function loadQuality() {
  const moduleStub = { exports: {} as Record<string, unknown> };
  vm.runInContext(
    qualityJavaScript,
    vm.createContext({
      exports: moduleStub.exports,
      module: moduleStub,
      require: requireFromTest,
    }),
    { filename: qualityPath }
  );
  return moduleStub.exports as QualityModule;
}

test("movement widgets require a market price of at least $20", () => {
  const { MIN_MOVEMENT_CARD_PRICE_USD, isMeaningfulMovementPrice } = loadQuality();

  assert.equal(MIN_MOVEMENT_CARD_PRICE_USD, 20);
  assert.equal(isMeaningfulMovementPrice(19.99), false);
  assert.equal(isMeaningfulMovementPrice(20), true);
  assert.equal(isMeaningfulMovementPrice(250), true);
  assert.equal(isMeaningfulMovementPrice(null), false);
});

test("eBay sales render full dollar amounts without K", () => {
  const { formatEbaySalePrice, normalizeEbaySalePrice } = loadQuality();

  assert.equal(formatEbaySalePrice(null), "—");
  assert.equal(formatEbaySalePrice(14.2), "$14.20");
  assert.equal(formatEbaySalePrice(1_716.2), "$1,716.20");
  assert.equal(formatEbaySalePrice(1_716_175), "$1,716.18");
  assert.equal(formatEbaySalePrice(5_680_340.86), "$5,680.34");
  assert.equal(normalizeEbaySalePrice(99_999.99), 99_999.99);
});