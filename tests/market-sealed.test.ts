import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { attachCasePrices, rankBoosterBoxesByPrice, rankBoosterBoxesByTotalSetValue, representativeSealedImageBySet, sealedValueMultiple, tcgPlayerProductImageUrl } from "../src/lib/market-sealed.ts";

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

test("case prices pair to the matching booster box wave", () => {
  const paired = attachCasePrices([
    candidate("Romance Dawn Booster Box Wave 1", "op01", 6300),
    candidate("Romance Dawn Booster Box Case Wave 2", "op01", 14000, "booster_box_case"),
    candidate("Romance Dawn Booster Box Case Wave 1", "op01", 49500, "booster_box_case"),
  ]);

  assert.equal(paired[0]?.case_market_avg, 49500);
});

test("box sets can be ranked by total set value", () => {
  const ranked = rankBoosterBoxesByTotalSetValue([
    { ...candidate("OP-01", "op01", 6300), total_set_value: 8300 },
    { ...candidate("OP-05", "op05", 1200), total_set_value: 16300 },
    { ...candidate("No priced cards", "op10", 200), total_set_value: 0 },
  ]);

  assert.deepEqual(ranked.map((item) => item.name), ["OP-05", "OP-01"]);
});

test("sealed value multiple is total set value divided by booster box price", () => {
  assert.equal(sealedValueMultiple(16300, 1200)?.toFixed(1), "13.6");
  assert.equal(sealedValueMultiple(0, 1200), null);
});

test("set thumbnails prefer booster box imagery from the sealed catalog", () => {
  const images = representativeSealedImageBySet([
    {
      set_id: "op01",
      product_type: "starter_deck",
      market_avg: 500,
      image_url: "starter.jpg",
      tcg_product_id: "1",
    },
    {
      set_id: "op01",
      product_type: "booster_box",
      market_avg: 100,
      image_url: null,
      tcg_product_id: "450086",
    },
  ]);

  assert.equal(images.get("op01"), "https://product-images.tcgplayer.com/fit-in/1000x1000/450086.jpg");
});
