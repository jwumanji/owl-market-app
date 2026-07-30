import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("second collector nickname scan adds exact popular printings for admin review", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730216000_add_collector_nickname_scan_2.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedPairs = [
    ["EB03-024_p2", "EB03 SP Vivi"],
    ["EB03-045_p2", "EB03 SP Perona"],
    ["EB03-003_p2", "EB03 SP Uta"],
    ["EB03-031_p2", "EB03 SP Reiju"],
    ["EB03-042_p2", "EB03 SP Koala"],
    ["EB03-018_p2", "EB03 SP Tashigi"],
    ["OP01-016_p2", "Pinwheel Nami"],
    ["OP06-101_p2", "Festival O-Nami"],
    ["OP07-109_p2", "Egghead Luffy (Treasure Rare)"],
    ["P-OP05-060", "PSA Magazine Luffy"],
    ["P-ST13-015", "2nd Anniversary Luffy"],
    ["P-OP09-119", "3rd Anniversary Luffy"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    assert.match(migration, new RegExp(`'${cardImageId}'[\\s\\S]*?'${marketName.replace(/[()]/g, "\\$&")}'`));
  }

  assert.match(migration, /'Fireworks O-Nami'/);
  assert.match(migration, /'Gold Anniversary Luffy'/);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});
