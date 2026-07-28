import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("migration keeps suggestions private until atomic admin approval", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260726160000_card_market_names.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /add column if not exists market_name text/i);
  assert.match(migration, /create table if not exists public\.card_market_aliases/i);
  assert.match(migration, /create or replace function public\.approve_card_market_name_suggestion/i);
  assert.match(migration, /revoke all on table public\.card_market_name_suggestions from anon, authenticated/i);
  assert.match(migration, /'OP05-119_p8', 'Gold SP Luffy'/);
  assert.match(migration, /'OP01-078_p2', 'Boa Lisa'/);
});
