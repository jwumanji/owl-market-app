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
});

test("all ten 25th Edition printings use Bandai's exact ordered artwork", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731104000_fix_25th_edition_collection_images.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedImages = [
    ["P-001-alt-art-promo", "card_01.png"],
    ["P-OP01-001", "card_02.png"],
    ["OP01-013-25th-edition", "card_03.png"],
    ["P-ST01-002", "card_04.png"],
    ["OP01-016-25th-edition", "card_05.png"],
    ["ST01-006-alt-art-promo", "card_06.png"],
    ["P-ST01-008", "card_07.png"],
    ["ST01-010-alt-art-promo", "card_08.png"],
    ["P-OP01-022", "card_09.png"],
    ["P-ST01-005", "card_10.png"],
  ];

  for (const [cardImageId, filename] of expectedImages) {
    assert.match(migration, new RegExp(`'${cardImageId}'.*?${filename.replace(".", "\\.")}`));
  }

  assert.match(migration, /image_mirror_status = 'external'/);
  assert.match(migration, /25th_edition_collection_exact_artwork/);
});
