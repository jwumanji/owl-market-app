import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("verified prize scan adds exact championship and treasure cup printings", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260730219000_add_verified_prize_market_names.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const expectedPairs = [
    ["P-OP03-123", "Championship Katakuri (2024 Top 16)"],
    ["P-OP03-114", "Championship Linlin (2024 Top 8)"],
    ["P-ST07-010", "Treasure Cup Linlin (2024 Winner)"],
    ["P-OP01-070", "Treasure Cup Mihawk (2024 Winner)"],
    ["P-OP11-119", "Treasure Cup Koby (2025 Winner)"],
    ["P-ST06-012", "Treasure Cup Garp (2024 Winner)"],
    ["P-ST18-003", "Treasure Cup San-Gorou (2025 Winner)"],
    ["P-OP08-084", "Treasure Cup Jack (2025 Winner)"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    assert.match(migration, new RegExp(`'${cardImageId}'[\\s\\S]*?'${marketName.replace(/[()]/g, "\\$&")}'`));
  }

  assert.match(migration, /'Treasure Cup San-Gorou Top 64'/);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});
