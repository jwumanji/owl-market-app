import assert from "node:assert/strict";
import test from "node:test";

import {
  cardDisplayName,
  cardOfficialIdentity,
  normalizeMarketAlias,
  parseMarketAliases,
  validateMarketNameInput,
} from "../src/lib/card-market-names.ts";

test("approved market names lead while official identity is preserved", () => {
  const card = {
    name: "Monkey.D.Luffy (119) (SP) (Gold)",
    market_name: "Gold SP Luffy",
  };

  assert.equal(cardDisplayName(card), "Gold SP Luffy");
  assert.equal(cardOfficialIdentity(card), "Monkey.D.Luffy (119) (SP) (Gold)");
  assert.equal(cardDisplayName({ name: "Boa Hancock (SP)", market_name: null }), "Boa Hancock (SP)");
});

test("aliases normalize punctuation without becoming globally unique", () => {
  assert.equal(normalizeMarketAlias("  Gold-G5 Luffy!! "), "gold g5 luffy");
  assert.deepEqual(
    parseMarketAliases("Gold Luffy\nGold-Luffy\nOP11 Gold Luffy, Gold G5 Luffy"),
    ["Gold Luffy", "OP11 Gold Luffy", "Gold G5 Luffy"],
  );
});

test("market name input is compact and rejects empty values", () => {
  assert.deepEqual(validateMarketNameInput("  Oda   Signature Luffy  "), {
    error: null,
    marketName: "Oda Signature Luffy",
  });
  assert.equal(validateMarketNameInput(" ").marketName, null);
});
