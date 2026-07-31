import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("25th Edition Luffy uses the exact official Bandai image", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731103000_fix_25th_edition_luffy_image.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /P-001-alt-art-promo/);
  assert.match(
    migration,
    /https:\/\/en\.onepiece-cardgame\.com\/images\/products\/other\/cardcollection25th\/card_01\.png\?v2/,
  );
  assert.match(migration, /image_mirror_status = 'external'/);
  assert.match(migration, /image_mirror_error = null/);
  assert.match(migration, /update public\.card_printings/i);
  assert.doesNotMatch(migration, /P-001-store-championship/);
});

test("image mirroring can safely target one exact card printing", () => {
  const script = readFileSync(
    new URL("../scripts/sync-card-image-variants.mjs", import.meta.url),
    "utf8",
  );

  assert.match(script, /readArg\("--card-image-id"\)/);
  assert.match(script, /query\.eq\("card_image_id", CARD_IMAGE_ID\)/);
});
