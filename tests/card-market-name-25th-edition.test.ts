import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("25th Edition restores the exact ten-card collection for admin review", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731100000_restore_25th_edition_card_names.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedPairs = [
    ["P-001-alt-art-promo", "Monkey.D.Luffy (25th Edition)"],
    ["P-OP01-001", "Roronoa Zoro (25th Edition)"],
    ["OP01-013-25th-edition", "Sanji (25th Edition)"],
    ["P-ST01-002", "Usopp (25th Edition)"],
    ["OP01-016-25th-edition", "Nami (25th Edition)"],
    ["ST01-006-alt-art-promo", "Tony Tony.Chopper (25th Edition)"],
    ["P-ST01-008", "Nico Robin (25th Edition)"],
    ["ST01-010-alt-art-promo", "Franky (25th Edition)"],
    ["P-OP01-022", "Brook (25th Edition)"],
    ["P-ST01-005", "Jinbe (25th Edition)"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    const escapedCardImageId = cardImageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedMarketName = marketName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(`'${escapedCardImageId}'[\\s\\S]*?'${escapedMarketName}'`),
    );
  }

  assert.match(migration, /Premium Card Collection -25th Edition-/);
  assert.match(migration, /25th Anniversary Nami/);
  assert.match(migration, /25th Anniversary Luffy/);
  assert.match(migration, /restored_exact_promo_printing/);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /OP01-016_p2/);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});

test("25th Edition Chopper and Franky receive exact pricing identities", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260731101000_attach_25th_edition_price_ids.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /ST01-006-alt-art-promo/);
  assert.match(migration, /tony-tony-chopper-st01-006-alternate-art-promo/);
  assert.match(migration, /ST01-010-alt-art-promo/);
  assert.match(migration, /franky-st01-010-alternate-art-promo/);
  assert.match(migration, /insert into public\.card_external_ids/i);
});
