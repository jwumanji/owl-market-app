import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalOnePieceRarity,
  classifyRarity,
  hasExplicitTreasureRareSignal,
} from "../src/lib/justtcg-match.ts";

test("normalizes provider rarity labels to canonical One Piece codes", () => {
  assert.equal(canonicalOnePieceRarity("Treasure Rare"), "TR");
  assert.equal(canonicalOnePieceRarity("Super Rare"), "SR");
  assert.equal(canonicalOnePieceRarity("Alternate Art"), "AA");
  assert.equal(canonicalOnePieceRarity("SEC"), "SEC");
});

test("recognizes every explicit Treasure Rare signal used by providers", () => {
  assert.equal(hasExplicitTreasureRareSignal("Nami (TR)", null, "Rare"), true);
  assert.equal(hasExplicitTreasureRareSignal("Nami", "TR", "Rare"), true);
  assert.equal(hasExplicitTreasureRareSignal("Nami", null, "Treasure Rare"), true);
  assert.equal(classifyRarity("Nami", null, "Treasure Rare"), "TR");
});

test("does not mistake Treasure Cup promotional cards for Treasure Rares", () => {
  assert.equal(
    hasExplicitTreasureRareSignal("Uta (Treasure Cup 2025)", null, "Super Rare"),
    false
  );
  assert.equal(classifyRarity("Uta (Treasure Cup 2025)", null, "Super Rare"), "SR");
});

test("explicit TR evidence overrides a stale DB rarity", () => {
  assert.equal(classifyRarity("Monkey.D.Luffy (TR)", "SP", "Special Rare"), "TR");
  assert.equal(classifyRarity("Zoro-Juurou", "TR", "Super Rare"), "TR");
});
