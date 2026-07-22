import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  classifyRiftboundUnmatchedCard,
  justTcgCardExternalId,
  justTcgSourceUpdatedAt,
  knownRiftboundSet,
  matchRiftboundJustTcgCards,
  matchRiftboundJustTcgSet,
  normalizeRiftboundSetName,
  selectRiftboundMarketVariant,
} from "../src/lib/games/riftbound-justtcg.ts";
import type { JustTCGCard, JustTCGSet } from "../src/lib/justtcg.ts";
import {
  getRiotRiftboundAdapterConfig,
  riotRiftboundAdapterStatus,
} from "../src/lib/games/riftbound-riot.ts";

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

test("Vendetta provider rows wait for Riot card confirmation", () => {
  const vendetta = card({
    set: "vendetta-riftbound-league-of-legends-trading-card-game",
    set_name: "Vendetta",
  });
  assert.deepEqual(knownRiftboundSet(vendetta.set_name, new Date("2026-07-22T00:00:00Z")), {
    name: "Vendetta",
    releaseDate: "2026-07-31",
    status: "preview",
  });
  assert.deepEqual(
    classifyRiftboundUnmatchedCard(vendetta, { hasCatalogSet: false }),
    {
      status: "provider_ahead",
      reason: "known_official_set_waiting_for_riot_card_confirmation",
    }
  );
});

test("ambiguous provider rows are quarantined instead of name-matched", () => {
  assert.equal(
    classifyRiftboundUnmatchedCard(card(), {
      hasCatalogSet: true,
      possibleCardId: "possible-card",
    }).status,
    "identity_conflict"
  );
  assert.equal(
    classifyRiftboundUnmatchedCard(card({ name: "Vendetta Booster Box" }), {
      hasCatalogSet: false,
    }).status,
    "sealed_product"
  );
});

test("Riftbound pricing prefers English Near Mint Normal", () => {
  const chosen = selectRiftboundMarketVariant(
    card({
      variants: [
        {
          id: "foil",
          condition: "Near Mint",
          printing: "Foil",
          language: "English",
          price: 12,
        } as JustTCGCard["variants"][number],
        {
          id: "normal",
          condition: "Near Mint",
          printing: "Normal",
          language: "English",
          price: 10,
        } as JustTCGCard["variants"][number],
        {
          id: "lp",
          condition: "Lightly Played",
          printing: "Normal",
          language: "English",
          price: 9,
        } as JustTCGCard["variants"][number],
      ],
    })
  );
  assert.equal(chosen?.id, "normal");
});

test("Riot adapter remains closed until both approved values are configured", () => {
  assert.equal(getRiotRiftboundAdapterConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(
    riotRiftboundAdapterStatus({
      NODE_ENV: "test",
      RIOT_RIFTBOUND_API_KEY: "key-only",
    } as NodeJS.ProcessEnv),
    "awaiting_api_key"
  );
  assert.deepEqual(
    getRiotRiftboundAdapterConfig({
      NODE_ENV: "test",
      RIOT_RIFTBOUND_API_KEY: "approved-key",
      RIOT_RIFTBOUND_CATALOG_URL: "https://riot.example/catalog",
    } as NodeJS.ProcessEnv),
    {
      apiKey: "approved-key",
      catalogUrl: "https://riot.example/catalog",
    }
  );
});

test("Riftbound reconciliation migration keeps catalog and pricing authority separate", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260722140000_riftbound_reconciliation_and_live_pricing.sql"
    ),
    "utf8"
  );
  assert.match(sql, /create table if not exists public\.catalog_reconciliation_candidates/);
  assert.match(sql, /'riot_riftbound', 'card_identity', 'canonical'/);
  assert.match(sql, /'justtcg', 'market_price', 'commercial'/);
  assert.match(sql, /'provider_ahead'/);
  assert.match(sql, /create or replace function public\.publish_riftbound_justtcg_prices/);
  assert.match(sql, /on conflict \(game_id, card_id\)/);
  assert.match(sql, /'policy', 'riftbound_near_mint_normal_v1'/);
});
