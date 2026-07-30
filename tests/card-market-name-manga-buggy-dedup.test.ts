import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("duplicate Manga Buggy suggestion is removed only from the mislabeled base row", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730218000_remove_duplicate_manga_buggy_suggestion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /cards\.card_image_id = 'OP09-051'/);
  assert.match(migration, /suggestions\.proposed_market_name = 'Manga Buggy'/);
  assert.match(migration, /suggestions\.status = 'pending'/);
  assert.doesNotMatch(migration, /OP09-051_p2/);
});
