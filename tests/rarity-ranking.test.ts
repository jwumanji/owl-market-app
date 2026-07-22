import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { rankRarityCards, rarityMarketPrice } from "../src/lib/rarity-ranking.ts";

test("rarity cards rank by the displayed average market price", () => {
  const ranked = rankRarityCards([
    { name: "Uta", avg: 6_287, tcg: 8_999 },
    { name: "Monkey D. Luffy", avg: 8_899, tcg: 8_899 },
    { name: "Third", avg: 4_199, tcg: 4_199 },
  ]);

  assert.deepEqual(ranked.map((card) => card.name), ["Monkey D. Luffy", "Uta", "Third"]);
});

test("rarity market price falls back to TCGPlayer market when average is absent", () => {
  assert.equal(rarityMarketPrice({ avg: null, tcg: 125 }), 125);
  assert.equal(rarityMarketPrice({ avg: 0, tcg: 125 }), 125);
  assert.equal(rarityMarketPrice({ avg: 140, tcg: 125 }), 140);
});

test("rarity ranking is deterministic for equal average prices", () => {
  const ranked = rankRarityCards([
    { name: "Beta", avg: 100, tcg: 90 },
    { name: "Alpha", avg: 100, tcg: 95 },
    { name: "Gamma", avg: 100, tcg: 95 },
  ]);

  assert.deepEqual(ranked.map((card) => card.name), ["Alpha", "Gamma", "Beta"]);
});
