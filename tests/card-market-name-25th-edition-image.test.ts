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
  assert.match(script, /readArg\("--card-image-ids"\)/);
  assert.match(script, /query\.eq\("card_image_id", CARD_IMAGE_IDS\[0\]\)/);
  assert.match(script, /query\.in\("card_image_id", CARD_IMAGE_IDS\)/);
  assert.match(script, /const MIRROR_RUN_VERSION = Date\.now\(\)\.toString\(36\)/);
  assert.match(script, /\?v=\$\{MIRROR_RUN_VERSION\}/);
});

test("collection repair covers all ten 25th Edition IDs and official images", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731104000_fix_25th_edition_collection_images.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedCardImageIds = [
    "P-001-alt-art-promo",
    "P-OP01-001",
    "OP01-013-25th-edition",
    "P-ST01-002",
    "OP01-016-25th-edition",
    "ST01-006-alt-art-promo",
    "P-ST01-008",
    "ST01-010-alt-art-promo",
    "P-OP01-022",
    "P-ST01-005",
  ];

  for (const cardImageId of expectedCardImageIds) {
    assert.match(migration, new RegExp(`'${cardImageId}'`));
  }

  for (let index = 1; index <= 10; index += 1) {
    const filename = `card_${String(index).padStart(2, "0")}\\.png`;
    assert.match(migration, new RegExp(filename));
  }

  assert.match(migration, /image_mirror_status = 'external'/);
  assert.match(migration, /25th_edition_collection_exact_artwork/);
});

test("25th Edition Chopper and Robin use the card numbers printed on Bandai artwork", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731105000_correct_25th_edition_chopper_robin_images.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /\('P-ST01-008', '[^'\n]*card_06\.png\?v2'\)/);
  assert.match(migration, /\('ST01-006-alt-art-promo', '[^'\n]*card_07\.png\?v2'\)/);
  assert.doesNotMatch(migration, /\('P-ST01-008', '[^'\n]*card_07\.png\?v2'\)/);
  assert.doesNotMatch(migration, /\('ST01-006-alt-art-promo', '[^'\n]*card_06\.png\?v2'\)/);
  assert.match(migration, /25th_edition_chopper_robin_exact_artwork/);
});
