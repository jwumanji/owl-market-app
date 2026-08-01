import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("3rd Anniversary Treasure Luffy includes Diet Luffy collector aliases", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260730214000_add_diet_luffy_alias.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /'P-ST21-014'/);
  assert.match(migration, /'Diet Luffy'/);
  assert.match(migration, /'Diet Serial Luffy'/);
  assert.match(migration, /suggestions\.status = 'pending'/i);
  assert.match(migration, /marketplace listings consistently call this exact ST21-014 printing Diet Luffy/i);
});
