import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import {
  cardImageHealthCandidates,
  classifyImageProbe,
  selectImageHealthSample,
} from "../src/lib/card-image-health.ts";

test("image health candidates retain variants before the TCGplayer fallback", () => {
  assert.deepEqual(
    cardImageHealthCandidates(
      {
        id: "card-1",
        image_url_preview: "https://images.example/preview.webp",
        image_url: "https://images.example/large.webp",
        image_url_small: "https://images.example/thumb.webp",
      },
      "684755",
    ),
    [
      "https://images.example/preview.webp",
      "https://images.example/large.webp",
      "https://images.example/thumb.webp",
      "https://product-images.tcgplayer.com/fit-in/1000x1000/684755.jpg",
    ],
  );
});

test("image health candidates use a TCGplayer product when catalog images are absent", () => {
  assert.deepEqual(
    cardImageHealthCandidates({ id: "card-1" }, "668439"),
    ["https://product-images.tcgplayer.com/fit-in/1000x1000/668439.jpg"],
  );
});

test("daily samples prioritize valuable cards and rotate through the catalog", () => {
  const cards = Array.from({ length: 8 }, (_, index) => ({ id: `card-${index}` }));
  const prices = new Map([
    ["card-1", 1000],
    ["card-3", 500],
    ["card-5", 100],
  ]);

  const first = selectImageHealthSample(cards, prices, 4, 0).map((card) => card.id);
  const second = selectImageHealthSample(cards, prices, 4, 1).map((card) => card.id);

  assert.deepEqual(first.slice(0, 2), ["card-1", "card-3"]);
  assert.deepEqual(second.slice(0, 2), ["card-1", "card-3"]);
  assert.notDeepEqual(first.slice(2), second.slice(2));
});

test("image probes require a successful image response", () => {
  assert.deepEqual(classifyImageProbe(200, "image/webp"), { healthy: true, reason: "ok" });
  assert.deepEqual(classifyImageProbe(404, "application/json"), {
    healthy: false,
    reason: "http_error",
  });
  assert.deepEqual(classifyImageProbe(200, "text/html"), {
    healthy: false,
    reason: "not_image",
  });
});
