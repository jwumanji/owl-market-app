import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import path from "node:path";
import { PROMO_COLLECTION_CATALOG, promoCollectionSets } from "../src/app/sets/promo-collections.ts";
import { getSetImageFile } from "../src/app/sets/set-images.ts";

test("promo product catalog has unique stable routes and codes", () => {
  assert.equal(PROMO_COLLECTION_CATALOG.length, 47);
  const slugs = PROMO_COLLECTION_CATALOG.map((entry) => entry.slug);
  const codes = PROMO_COLLECTION_CATALOG.map((entry) => entry.code);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(new Set(codes).size, codes.length);
});

test("anniversary products remain separated by edition and language", () => {
  const codes = new Set(PROMO_COLLECTION_CATALOG.map((entry) => entry.code));
  for (const code of [
    "ANN-JP-01", "ANN-EN-01", "ANN-CN-01",
    "ANN-JP-02", "ANN-EN-02", "ANN-CN-02",
    "ANN-JP-03", "ANN-EN-03", "ANN-CN-03", "ANN-CN-04",
  ]) {
    assert.ok(codes.has(code), `missing ${code}`);
  }
});

test("requested folder and special promo families are represented", () => {
  const names = PROMO_COLLECTION_CATALOG.map((entry) => entry.name);
  assert.ok(names.some((name) => name.includes("25th Anniversary Edition")));
  assert.ok(names.some((name) => name.includes("Best Selection")));
  assert.ok(names.some((name) => name.includes("Special Goods Set")));
  assert.ok(names.some((name) => name.includes("Treasure Chest")));
  assert.ok(names.some((name) => name.includes("Admirable Collection")));
  assert.ok(names.some((name) => name.includes("Illustration Box")));
});

test("catalog entries become non-priced set cards with official sources", () => {
  const sets = promoCollectionSets();
  assert.equal(sets.length, PROMO_COLLECTION_CATALOG.length);
  for (const set of sets) {
    assert.equal(set.pricingStatus, "catalog_only");
    assert.equal(set.price, 0);
    assert.ok(set.officialUrl?.startsWith("https://"));
    assert.ok(["anniversary", "collection", "special"].includes(set.type ?? ""));
  }
});

test("every promo product has a mapped local image", async () => {
  for (const entry of PROMO_COLLECTION_CATALOG) {
    const file = getSetImageFile(entry.slug);
    assert.equal(file, `promo-${entry.slug}.webp`);
    await access(path.resolve("public/sets", file));
  }
});
