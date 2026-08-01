import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Trending defaults to the seven-day market window", () => {
  const dashboard = readFileSync(
    new URL("../src/components/market/MarketDashboard.tsx", import.meta.url),
    "utf8",
  );
  const trendingSection = dashboard.match(
    /function TrendingSection[\s\S]*?function CardImage/,
  )?.[0];

  assert.ok(trendingSection, "TrendingSection should remain present");
  assert.match(trendingSection, /useState<MarketWindow>\("7D"\)/);
  assert.match(trendingSection, /onChange=\{setWindow\}/);
});
