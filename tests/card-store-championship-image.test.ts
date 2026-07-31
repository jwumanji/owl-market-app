import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Store Championship Trophy Luffy uses the verified TCGplayer image", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730220000_fix_store_championship_luffy_image.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /cards\.card_image_id = 'P-001-store-championship'/);
  assert.match(migration, /product\/503023_in_1000x1000\.jpg/g);
  assert.match(migration, /image_mirror_status = 'pending'/);
  assert.match(migration, /image_mirror_error = null/);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});
