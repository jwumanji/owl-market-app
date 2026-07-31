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

test("Leader Collection names use the product identity instead of a sales venue", () => {
  const correction = readFileSync(
    new URL(
      "../supabase/migrations/20260731110000_correct_leader_collection_market_names.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const expectedPairs = [
    ["ST13-001-premium-card-collection", "Gold Text Sabo (Leader Collection)"],
    ["ST13-002-premium-card-collection", "Gold Text Ace (Leader Collection)"],
    ["ST13-003-premium-card-collection", "Gold Text Luffy (Leader Collection)"],
    ["ST03-001-premium-card-collection", "Gold Text Crocodile (Leader Collection)"],
    ["ST04-001-premium-card-collection", "Gold Text Kaido (Leader Collection)"],
    ["ST02-001-premium-card-collection", "Gold Text Eustass Kid (Leader Collection)"],
  ];

  for (const [cardImageId, marketName] of expectedPairs) {
    assert.match(correction, new RegExp(`'${cardImageId}'[\\s\\S]*?'${marketName.replace(/[()]/g, "\\$&")}'`));
  }

  assert.match(correction, /Championship 2024 Finals WAVE3/);
  assert.match(correction, /delete from public\.card_market_aliases/i);
  assert.match(correction, /suggestions\.status\s*=\s*'approved'/i);
  assert.doesNotMatch(correction, /set\s+status\s*=/i);
});

test("BANDAI Fest aliases preserve nicknames, card numbers, and event years", () => {
  assert.match(migration, /P-041 Gear 5 Luffy/);
  assert.match(migration, /Egghead SSG Luffy/);
  assert.match(migration, /ST13-003 Gold Text Luffy/);
  assert.match(migration, /Nami Zeus Playmat Promo/);
  assert.match(migration, /Premium Card Collection 23-24 Luffy/);
});
