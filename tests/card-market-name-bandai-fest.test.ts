import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260731102000_add_bandai_fest_market_names.sql",
    import.meta.url,
  ),
  "utf8",
);

test("BANDAI Fest research adds the annual attendee promos and exact event products", () => {
  const expectedPairs = [
    ["P-041-bandai-fest-23-24", "Gear 5 Luffy (BANDAI Fest 23-24)"],
    ["P-P-080", "SSG Luffy (BANDAI Fest 24-25)"],
    ["P-OP11-106", "Zeus Playmat Promo (BANDAI Fest 24-25)"],
    ["ST13-001-premium-card-collection", "Gold Text Sabo (BANDAI Fest 24-25)"],
    ["ST13-002-premium-card-collection", "Gold Text Ace (BANDAI Fest 24-25)"],
    ["ST13-003-premium-card-collection", "Gold Text Luffy (BANDAI Fest 24-25)"],
    ["ST03-001-premium-card-collection", "Gold Text Crocodile (BANDAI Fest 24-25)"],
    ["ST04-001-premium-card-collection", "Gold Text Kaido (BANDAI Fest 24-25)"],
    ["ST02-001-premium-card-collection", "Gold Text Eustass Kid (BANDAI Fest 24-25)"],
    ["P-001-premium-card-collection", "Luffy (BANDAI Fest 23-24 Collection)"],
    ["OP03-116-premium-card-collection", "Shirahoshi (BANDAI Fest 23-24 Collection)"],
    ["P-030-premium-card-collection", "Jinbe (BANDAI Fest 23-24 Collection)"],
    ["ST06-006-premium-card-collection", "Tashigi (BANDAI Fest 23-24 Collection)"],
    ["ST03-007-premium-card-collection", "Sentomaru (BANDAI Fest 23-24 Collection)"],
    ["ST04-008-premium-card-collection", "Jack (BANDAI Fest 23-24 Collection)"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    const escapedCardImageId = cardImageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedMarketName = marketName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(`'${escapedCardImageId}'[\\s\\S]*?'${escapedMarketName}'`),
    );
  }

  assert.match(migration, /restored_exact_event_printing/);
  assert.match(migration, /P-041-.*?532752/s);
  assert.match(migration, /on conflict \(card_id, proposed_market_name\) do nothing/i);
  assert.doesNotMatch(migration, /P-OP07-073/);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
});

test("BANDAI Fest aliases preserve nicknames, card numbers, and event years", () => {
  assert.match(migration, /P-041 Gear 5 Luffy/);
  assert.match(migration, /Egghead SSG Luffy/);
  assert.match(migration, /ST13-003 Gold Text Luffy/);
  assert.match(migration, /Nami Zeus Playmat Promo/);
  assert.match(migration, /Premium Card Collection 23-24 Luffy/);
});
