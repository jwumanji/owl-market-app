import assert from "node:assert/strict";
import test from "node:test";

import {
  justTcgCardExternalId,
  justTcgSourceUpdatedAt,
  matchRiftboundJustTcgCards,
  matchRiftboundJustTcgSet,
  normalizeRiftboundSetName,
} from "../src/lib/games/riftbound-justtcg.ts";
import type { JustTCGCard, JustTCGSet } from "../src/lib/justtcg.ts";

function card(overrides: Partial<JustTCGCard> = {}): JustTCGCard {
  return {
    uuid: "card-uuid",
    id: "legacy-card-id",
    name: "Kai'Sa - Daughter of the Void",
    game: "Riftbound",
    set: "origins-riftbound-league-of-legends-trading-card-game",
    set_name: "Origins",
    number: "299*/298",
    rarity: "Showcase",
    tcgplayerId: "653094",
    variants: [],
    ...overrides,
  };
}

function providerSet(overrides: Partial<JustTCGSet> = {}): JustTCGSet {
  return {
    id: "origins-riftbound-league-of-legends-trading-card-game",
    name: "Origins",
    game_id: "riftbound-league-of-legends-trading-card-game",
    count: 353,
    cards_count: 353,
    release_date: null,
    set_value_usd: null,
    ...overrides,
  };
}

test("Riftbound set matching is exact after punctuation normalization", () => {
  assert.equal(normalizeRiftboundSetName("Origins: Proving Grounds"), "origins proving grounds");
  const match = matchRiftboundJustTcgSet(
    providerSet({ name: "Origins: Proving Grounds" }),
    [
      { id: "origins", code: "OGN", name: "Origins" },
      { id: "proving", code: "OGS", name: "Origins - Proving Grounds" },
    ]
  );
  assert.equal(match?.id, "proving");
});

test("Riftbound card matching uses only unique exact TCGplayer product IDs", () => {
  const unique = card();
  const missing = card({ uuid: "missing", id: "missing", tcgplayerId: "999" });
  const duplicate = card({ uuid: "duplicate", id: "duplicate", tcgplayerId: "111" });
  const result = matchRiftboundJustTcgCards(
    [unique, missing, duplicate],
    [
      { card_id: "moon-card", external_id: "653094" },
      { card_id: "duplicate-a", external_id: "111" },
      { card_id: "duplicate-b", external_id: "111" },
    ]
  );
  assert.deepEqual(result.matches.map((row) => row.cardId), ["moon-card"]);
  assert.deepEqual(result.unmatched.map((row) => row.id), ["missing", "duplicate"]);
});

test("Riftbound source identity prefers UUID and keeps the newest provider timestamp", () => {
  const value = card({
    variants: [
      { lastUpdated: 100 } as JustTCGCard["variants"][number],
      { lastUpdated: 200 } as JustTCGCard["variants"][number],
    ],
  });
  assert.equal(justTcgCardExternalId(value), "card-uuid");
  assert.equal(justTcgSourceUpdatedAt(value), new Date(200_000).toISOString());
  assert.equal(justTcgCardExternalId(card({ uuid: undefined })), "legacy-card-id");
});
