import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { marketRarityRanking } from "../src/lib/market-rarities.ts";

function rarity(
  code: string,
  indexValue: number,
  topCard: { name: string; avg: number; cardImageId: string; imageSmall: string; imagePreview: string },
) {
  return {
    slug: code.toLowerCase(),
    code,
    name: `${code} rarity`,
    indexValue,
    cardCount: 10,
    chg7d: 2.5,
    chg30d: 8.5,
    topCards: [topCard],
  };
}

test("Markets rarities rank only by their highest-value card", () => {
  const ranked = marketRarityRanking([
    rarity("MR", 65_000, { name: "Manga", avg: 8_000, cardImageId: "MR-1", imageSmall: "small-mr", imagePreview: "preview-mr" }),
    rarity("PROMO", 151_000, { name: "Promo", avg: 2_000, cardImageId: "P-1", imageSmall: "small-p", imagePreview: "preview-p" }),
    rarity("SP", 73_000, { name: "Special", avg: 5_000, cardImageId: "SP-1", imageSmall: "small-sp", imagePreview: "preview-sp" }),
    rarity("SAR", 80_000, { name: "Excluded category", avg: 9_000, cardImageId: "SAR-1", imageSmall: "small-sar", imagePreview: "preview-sar" }),
  ], 5, ["promo", "sp", "mr"]);

  assert.deepEqual(ranked.map((item) => item.code), ["MR", "SP", "PROMO"]);
  assert.equal(ranked[0].name, "MR rarity");
  assert.equal(ranked[0].top_card_market, 8_000);
  assert.equal(ranked[0].changes["30D"], 8.5);
});

test("Markets rarity ranking rechecks the top card and excludes unpriced rarities", () => {
  const ranked = marketRarityRanking([
    {
      ...rarity("SP", 10, { name: "Lower card", avg: 100, cardImageId: "SP-1", imageSmall: "small-sp", imagePreview: "preview-sp" }),
      topCards: [
        { name: "Lower card", avg: 100, cardImageId: "SP-1", imageSmall: "small-sp", imagePreview: "preview-sp" },
        { name: "Actual top card", avg: 500, cardImageId: "SP-2", imageSmall: "small-top", imagePreview: "preview-top" },
      ],
    },
    rarity("MR", 1_000_000, { name: "No market price", avg: 0, cardImageId: "MR-1", imageSmall: "small-mr", imagePreview: "preview-mr" }),
  ]);

  assert.deepEqual(ranked.map((item) => item.code), ["SP"]);
  assert.equal(ranked[0].top_card_name, "Actual top card");
  assert.equal(ranked[0].top_card_market, 500);
});

test("Markets rarity previews use the top card from the Rarity Index", () => {
  const [ranked] = marketRarityRanking([
    rarity("AA", 22_000, { name: "Top alternate art", avg: 2_200, cardImageId: "AA-1", imageSmall: "small-aa", imagePreview: "preview-aa" }),
  ]);

  assert.equal(ranked.top_card_name, "Top alternate art");
  assert.equal(ranked.top_card_image_id, "AA-1");
  assert.equal(ranked.top_card_market, 2_200);
  assert.equal(ranked.image_url, "preview-aa");
  assert.equal(ranked.image_url_small, "small-aa");
});
