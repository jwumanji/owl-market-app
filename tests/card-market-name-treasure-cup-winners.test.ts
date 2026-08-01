import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Treasure Cup names include character, year, and winner designation", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260730212000_qualify_treasure_cup_winner_names.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'Treasure Cup Zoro \(2023 Winner\)'/);
  assert.match(migration, /'Treasure Cup Reiju \(2024 Winner\)'/);
  assert.match(migration, /'Treasure Cup Yamato \(2024 Winner\)'/);
  assert.match(migration, /'Treasure Cup Luffy \(2025 Winner\)'/);
  assert.match(migration, /'Treasure Cup Law \(2025 Winner\)'/);
  assert.match(migration, /Winner denotes an earned tournament prize card/);
  assert.match(migration, /suggestions\.status = 'pending'/i);
});
