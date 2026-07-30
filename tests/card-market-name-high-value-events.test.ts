import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("high-value event scan adds exact manga and tournament printings for admin review", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730217000_add_high_value_event_market_names.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedPairs = [
    ["OP09-051", "Manga Buggy"],
    ["P-ST10-010", "Championship Law (2024 Top 16)"],
    ["P-OP02-114", "Championship Borsalino (2023 Top 64)"],
    ["P-OP03-013", "Championship Marco (2023 Top 32)"],
    ["P-EB01-003", "Championship Kid & Killer (2025 Winner)"],
    ["P-OP12-031", "Treasure Cup Tashigi (2025 Winner)"],
    ["P-OP07-064", "Championship Sanji (2024 Top Player)"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    assert.match(migration, new RegExp(`'${cardImageId}'[\\s\\S]*?'${marketName.replace(/[()&]/g, "\\$&")}'`));
  }

  assert.match(migration, /'Treasure Cup Tashigi Top 16'/);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});
