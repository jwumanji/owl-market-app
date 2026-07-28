import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { historicalPriceChange } from "../src/lib/sealed-price-history.ts";

test("sealed price changes compare calendar snapshot dates", () => {
  const now = new Date("2026-07-28T21:15:00Z");
  const rows = [
    { price_date: "2026-07-27", price: 100 },
    { price_date: "2026-07-21", price: 80 },
    { price_date: "2026-06-28", price: 50 },
  ];

  assert.equal(historicalPriceChange(110, rows, 1, now), 10);
  assert.equal(historicalPriceChange(110, rows, 7, now), 37.5);
  assert.equal(historicalPriceChange(110, rows, 30, now), 120);
});

test("sealed price changes prefer the older snapshot when nearest dates tie", () => {
  const change = historicalPriceChange(120, [
    { price_date: "2026-07-20", price: 80 },
    { price_date: "2026-07-22", price: 100 },
  ], 7, new Date("2026-07-28T21:15:00Z"));

  assert.equal(change, 50);
});
