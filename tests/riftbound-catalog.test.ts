import assert from "node:assert/strict";
import test from "node:test";

import {
  asRiftboundPayload,
  compareRiftboundChampionValue,
  riftboundChampionName,
  stringList,
} from "../src/lib/games/riftbound-catalog.ts";

test("reads the nested Riftbound card payload", () => {
  assert.deepEqual(asRiftboundPayload({ card: { supertype: "Champion", tags: ["Rumble"] } }), {
    supertype: "Champion",
    tags: ["Rumble"],
  });
  assert.deepEqual(asRiftboundPayload(null), {});
});

test("derives champion names from champion and signature printings", () => {
  const known = new Set(["Rumble", "Lucian"]);
  assert.equal(riftboundChampionName({ name: "Rumble - Mechanized Menace", supertype: "Champion" }), "Rumble");
  assert.equal(riftboundChampionName({ name: "Relentless Pursuit", supertype: "Signature", tags: ["Demacia", "Lucian"] }, known), "Lucian");
  assert.equal(riftboundChampionName({ name: "Generic Unit", supertype: "Unit", tags: ["Rumble"] }, known), null);
});

test("stringList ignores invalid payload entries", () => {
  assert.deepEqual(stringList(["Fury", null, "", 7, "Body"]), ["Fury", "Body"]);
});

test("champion index ranks by total linked-card value", () => {
  const champions = [
    { name: "Ahri", totalValue: 125, pricedCards: 8 },
    { name: "Yasuo", totalValue: 410, pricedCards: 5 },
    { name: "Jinx", totalValue: 125, pricedCards: 10 },
  ].sort(compareRiftboundChampionValue);

  assert.deepEqual(champions.map((champion) => champion.name), ["Yasuo", "Jinx", "Ahri"]);
});
