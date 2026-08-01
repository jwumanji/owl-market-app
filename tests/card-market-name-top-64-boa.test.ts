import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Top 64 Boa correction preserves pending admin review", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260730211000_correct_top_64_boa_market_name.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'Championship Boa \(Top 64 Winner\)'/);
  assert.match(migration, /'Top 64 Boa'/);
  assert.match(migration, /'Boa Top 64 Prize'/);
  assert.match(migration, /suggestions\.status = 'pending'/i);
  assert.match(migration, /Top 64 earns the OP14-112 Boa Hancock/i);
});
