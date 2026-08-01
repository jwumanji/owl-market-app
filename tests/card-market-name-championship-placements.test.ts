import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Championship names include season and exact prize tier", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260730213000_qualify_championship_placement_names.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'Championship Kuzan \(2023 Top 32\)'/);
  assert.match(migration, /'Championship Vivi \(2024 Winner\)'/);
  assert.match(migration, /'Championship Rebecca \(2024 Top 8\)'/);
  assert.match(migration, /'Championship Chopper \(2025-26 Finalist\)'/);
  assert.match(migration, /'Championship Nami \(2025-26 Top 64\)'/);
  assert.match(migration, /'Championship Zoro \(2025-26 Top 16\)'/);
  assert.match(migration, /'Championship Shanks \(2025-26 Top 8\)'/);
  assert.match(migration, /'Championship Boa \(2026-27 Top 64\)'/);
  assert.match(migration, /where updated_suggestions\.status = 'approved'/i);
  assert.match(migration, /delete from public\.card_market_aliases/i);
});
