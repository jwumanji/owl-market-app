import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { characterIndexMarketRanking } from "../src/lib/market-characters.ts";

const character = (
  name: string,
  indexValue: number,
  imageUrlSmall: string,
  imageUrlPreview: string,
  chg7d = 2.4,
) => ({
  slug: name.toLowerCase().replaceAll(" ", "-"),
  name,
  indexValue,
  chg7d,
  topCards: [{ imageUrlSmall, imageUrlPreview }],
});

test("market characters are ranked only by total set value", () => {
  const ranked = characterIndexMarketRanking([
    character("Shanks", 17727.37, "shanks-small.webp", "shanks-preview.webp", 800),
    character("Monkey D. Luffy", 102627.37, "luffy-small.webp", "luffy-preview.webp", -50),
    character("Boa Hancock", 18765.56, "boa-small.webp", "boa-preview.webp", 0.1),
    character("No priced cards", 0, "none-small.webp", "none-preview.webp", 999),
  ]);

  assert.deepEqual(ranked.map((entry) => entry.name), [
    "Monkey D. Luffy",
    "Boa Hancock",
    "Shanks",
  ]);
  assert.equal(ranked[0]?.index_value, 102627.37);
});

test("market characters use the same representative card as the Character Index", () => {
  const [ranked] = characterIndexMarketRanking([
    character("Monkey D. Luffy", 102627.37, "luffy-small.webp", "luffy-preview.webp"),
  ]);

  assert.equal(ranked.image_url, "luffy-preview.webp");
  assert.equal(ranked.image_url_small, "luffy-small.webp");
  assert.equal(ranked.image_url_preview, "luffy-preview.webp");
  assert.equal(ranked.changes["7D"], 2.4);
});
