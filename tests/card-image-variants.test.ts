import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires the explicit extension.
import { cardImageSources } from "../src/lib/card-image-variants.ts";

const variants = {
  imageUrl: "large.webp",
  imageUrlPreview: "preview.webp",
  imageUrlSmall: "thumb.webp",
};

test("display images prefer the highest-fidelity source", () => {
  assert.deepEqual(cardImageSources(variants, "display"), [
    "large.webp",
    "preview.webp",
    "thumb.webp",
  ]);
});

test("table thumbnails keep the smallest source first", () => {
  assert.deepEqual(cardImageSources(variants, "thumbnail"), [
    "thumb.webp",
    "preview.webp",
    "large.webp",
  ]);
});

test("card-sized artwork prefers the preview over the thumbnail", () => {
  assert.deepEqual(cardImageSources(variants, "preview"), [
    "preview.webp",
    "large.webp",
    "thumb.webp",
  ]);
});

test("missing and duplicate variants fall back without repeated requests", () => {
  assert.deepEqual(
    cardImageSources(
      {
        imageUrl: "fallback.webp",
        imageUrlPreview: "fallback.webp",
        imageUrlSmall: null,
      },
      "display",
    ),
    ["fallback.webp"],
  );
});
