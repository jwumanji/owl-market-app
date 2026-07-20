import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { rankBoosterBoxesByPrice, tcgPlayerProductImageUrl } from "../src/lib/market-sealed.ts";

const candidate = (
  name: string,
  setId: string,
  price: number | null,
  productType = "booster_box",
) => ({
  set_id: setId,
  set_code: setId.toUpperCase(),
  name,
  product_type: productType,
  market_avg: price,
});

test("box sets are unique and ranked by booster box cost", () => {
  const ranked = rankBoosterBoxesByPrice([
    candidate("OP-05", "op05", 1187.42),
    candidate("OP-01 Wave 2", "op01", 1618.83),
    candidate("OP-01 Wave 1", "op01", 6354.08),
    candidate("PRB-01", "prb01", 947.51),
    candidate("OP-09 case", "op09", 2700, "booster_box_case"),
    candidate("Missing price", "op10", null),
  ]);

  assert.deepEqual(ranked.map((item) => item.name), [
    "OP-01 Wave 1",
    "OP-05",
    "PRB-01",
  ]);
});

test("TCGplayer image URLs are derived only from numeric product IDs", () => {
  assert.equal(
    tcgPlayerProductImageUrl(" 594069 "),
    "https://product-images.tcgplayer.com/fit-in/1000x1000/594069.jpg",
  );
  assert.equal(tcgPlayerProductImageUrl(null), null);
  assert.equal(tcgPlayerProductImageUrl("not-an-id"), null);
});
