import assert from "node:assert/strict";
import test from "node:test";
import type { JustTCGSealedProduct } from "../src/lib/justtcg";
import {
  buildSealedImportRow,
  classifySealedProductType,
  extractSealedSetCode,
  resolveSealedSetTarget,
} from "../src/lib/sealed-products";

const sets = [
  { id: "op01-id", code: "OP01", name: "Romance Dawn" },
  { id: "op14-id", code: "OP14", name: "The Azure Sea's Seven" },
  { id: "eb03-id", code: "EB03", name: "Extra Booster: One Piece Heroines Edition" },
];

test("classifies booster boxes and their cases before generic boxes", () => {
  assert.equal(classifySealedProductType("Romance Dawn - Booster Box Case"), "booster_box_case");
  assert.equal(classifySealedProductType("Romance Dawn - Booster Box"), "booster_box");
  assert.equal(
    classifySealedProductType("Extra Booster: One Piece Heroines Edition Box"),
    "booster_box"
  );
});

test("retains distinct sealed variants", () => {
  assert.equal(classifySealedProductType("Two Legends Sleeved Booster Pack"), "sleeved_booster_pack");
  assert.equal(classifySealedProductType("Tournament Pack Vol. 8"), "tournament_pack");
  assert.equal(classifySealedProductType("Starter Deck 12 Display"), "starter_deck_display");
  assert.equal(classifySealedProductType("English 2nd Anniversary Set (Sealed Promotional Bundle)"), "bundle");
});

test("maps source slugs and embedded set codes to canonical sets", () => {
  assert.equal(
    resolveSealedSetTarget(
      {
        set: "the-azure-sea-s-seven-one-piece-card-game",
        set_name: "The Azure Sea's Seven",
        name: "The Azure Sea's Seven Booster Box",
      },
      sets
    )?.id,
    "op14-id"
  );
  assert.equal(extractSealedSetCode("English Edition OP-01 Booster Pack"), "OP01");
  assert.equal(extractSealedSetCode("Super Pre-Release Starter Deck 1: Straw Hat Crew"), "ST01");
  assert.equal(
    resolveSealedSetTarget(
      {
        set: "the-azure-sea-s-seven-release-event-cards-one-piece-card-game",
        set_name: "The Azure Sea's Seven Release Event Cards",
        name: "The Azure Sea's Seven Release Event Pack",
      },
      sets
    )?.id,
    "op14-id"
  );
});

test("builds an auditable TCGplayer sealed-product row without converting nulls to zero", () => {
  const product = {
    id: "one-piece-romance-dawn-box",
    name: "Romance Dawn - Booster Box (Wave 2 - White)",
    game: "One Piece Card Game",
    set: "romance-dawn-one-piece-card-game",
    set_name: "Romance Dawn",
    number: "N/A",
    rarity: "None",
    tcgplayerId: "557280",
    variants: [{
      id: "sealed-variant",
      condition: "Sealed",
      printing: "Normal",
      language: "English",
      price: 1618.83,
      priceChange24hr: null,
      priceChange7d: 1.5,
      priceChange30d: null,
      priceChange90d: null,
      avgPrice: 1600,
      minPrice7d: 1500,
      maxPrice7d: 1620,
      trendSlope7d: null,
      avgPrice30d: null,
      minPrice30d: null,
      maxPrice30d: null,
      trendSlope30d: null,
      minPriceAllTime: 1000,
      maxPriceAllTime: 1700,
      tcgplayerSkuId: "sku-1",
      lastUpdated: 1_784_003_301,
    }],
  } as JustTCGSealedProduct;

  const row = buildSealedImportRow(product, "game-id", sets, "2026-07-14T12:00:00.000Z");
  assert.ok(row);
  assert.equal(row.set_id, "op01-id");
  assert.equal(row.product_type, "booster_box");
  assert.equal(row.tcg_price, 1618.83);
  assert.equal(row.chg_1d, null);
  assert.equal(row.chg_30d, null);
  assert.equal(row.tcg_product_id, "557280");
  assert.equal(row.tcg_sku_id, "sku-1");
});