import assert from "node:assert/strict";
import test from "node:test";

// @ts-ignore -- Node's native TypeScript test runner requires explicit extensions.
import { PROMO_COLLECTION_CATALOG, promoCollectionSets } from "../src/app/sets/promo-collections.ts";
// @ts-ignore -- Node's native TypeScript test runner requires explicit extensions.
import { fetchTcgCsvPromoProducts } from "../src/lib/tcgcsv-promo-products.ts";

test("promo catalog maps only verified TCGplayer sealed products", () => {
  const mapped = PROMO_COLLECTION_CATALOG.filter((entry) => entry.tcgplayer);
  const ids = mapped.map((entry) => entry.tcgplayer!.productId);

  assert.equal(PROMO_COLLECTION_CATALOG.length, 47);
  assert.equal(mapped.length, 29);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    PROMO_COLLECTION_CATALOG.find((entry) => entry.slug === "special-goods-asl")?.tcgplayer,
    { productId: 504496, categoryId: 52, groupId: 23083 }
  );
  assert.equal(
    PROMO_COLLECTION_CATALOG.find((entry) => entry.slug === "anniversary-japanese-1st")?.tcgplayer,
    undefined
  );
});

test("TCGCSV joins products to the Normal market-price row", async () => {
  const calls: string[] = [];
  const fetchStub = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const isProducts = url.endsWith("/products");
    const body = isProducts
      ? {
          success: true,
          results: [{
            productId: 504496,
            name: "One Piece Card Game: Special Goods Set -Ace/Sabo/Luffy-",
            imageUrl: "https://example.test/504496.jpg",
            url: "https://www.tcgplayer.com/product/504496",
            modifiedOn: "2026-07-20T00:00:00Z",
          }],
        }
      : {
          success: true,
          results: [
            { productId: 504496, subTypeName: "Foil", marketPrice: 999 },
            { productId: 504496, subTypeName: "Normal", marketPrice: 78.06, lowPrice: 79.99, midPrice: 89.95, highPrice: 120 },
          ],
        };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  const products = await fetchTcgCsvPromoProducts([
    { slug: "special-goods-asl", tcgplayer: { productId: 504496, categoryId: 52, groupId: 23083 } },
  ], fetchStub as typeof fetch);

  assert.equal(calls.length, 2);
  assert.equal(products[0]?.marketPrice, 78.06);
  assert.equal(products[0]?.subTypeName, "Normal");
});

test("priced promo rows use sealed-market semantics", () => {
  const market = new Map([[504496, {
    price: 78.06,
    chg1d: 1.2,
    chg7d: 4.5,
    chg30d: null,
    ath: 90,
    atl: 70,
    updatedAt: "2026-07-28T00:00:00Z",
  }]]);
  const row = promoCollectionSets(market).find((entry) => entry.slug === "special-goods-asl");

  assert.equal(row?.pricingStatus, "sealed_market");
  assert.equal(row?.price, 78.06);
  assert.equal(row?.cardsTotal, 1);
  assert.equal(row?.perf.d7, "+4.5%");
});
