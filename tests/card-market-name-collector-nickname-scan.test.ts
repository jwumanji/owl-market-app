import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("collector nickname scan adds exact popular printings for admin review", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730215000_add_collector_nickname_scan.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedPairs = [
    ["PRB02-006_p2", "Bubble Zoro"],
    ["OP08-106_p2", "Firework Nami"],
    ["ST26-005_p1", "Beer Luffy"],
    ["P-OP07-073", "Afro Luffy"],
    ["OP15-092_p1", "Nightmare Luffy"],
    ["OP15-098_p1", "Golden Bell Luffy"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    assert.match(migration, new RegExp(`'${cardImageId}'[\\s\\S]*?'${marketName}'`));
  }

  assert.match(migration, /'Zombie Luffy'/);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});
