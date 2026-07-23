import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  eligibleLorcanaMarketVariants,
  isLorcanaPromo,
  lorcanaDefinitionSourceId,
  lorcanaSetSlug,
  lorcanaTaxonomyCode,
  lorcanaVariantCode,
  justTcgLorcanaCardExternalId,
  justTcgLorcanaSourceUpdatedAt,
  matchLorcanaJustTcgCards,
  matchLorcanaJustTcgSet,
  normalizeLorcanaColors,
  normalizeLorcanaJsonCard,
  type LorcanaJsonCard,
} from "../src/lib/games/lorcana.ts";
import type { JustTCGCard, JustTCGSet } from "../src/lib/justtcg.ts";

function lorcanaCard(overrides: Partial<LorcanaJsonCard> = {}): LorcanaJsonCard {
  return {
    id: 1434,
    setCode: "7",
    number: 1,
    fullIdentifier: "1/204 • EN • 7",
    name: "Rhino",
    fullName: "Rhino - Motivational Speaker",
    simpleName: "rhino motivational speaker",
    version: "Motivational Speaker",
    type: "Character",
    rarity: "Rare",
    color: "Amber-Steel",
    colors: ["Amber", "Steel"],
    cost: 6,
    inkwell: false,
    strength: 4,
    willpower: 7,
    lore: 2,
    allowedInFormats: {
      Core: { allowed: false, allowedUntilDate: "2026-07-17" },
      Infinity: { allowed: true },
    },
    allowedInTournamentsFromDate: "2025-03-28",
    foilTypes: ["None", "Silver"],
    externalLinks: {
      tcgPlayerId: 619407,
      cardmarketId: 814035,
      cardTraderId: 322728,
    },
    images: {
      full: "https://api.lorcana.ravensburger.com/images/en/set7/1.jpg",
    },
    ...overrides,
  };
}

function justTcgCard(overrides: Partial<JustTCGCard> = {}): JustTCGCard {
  return {
    uuid: "justtcg-card-uuid",
    id: "justtcg-card-id",
    name: "Rhino - Motivational Speaker",
    game: "Disney Lorcana",
    set: "archazias-island",
    set_name: "Archazia's Island",
    number: "1/204",
    rarity: "Rare",
    tcgplayerId: "619407",
    variants: [],
    ...overrides,
  };
}

function justTcgSet(overrides: Partial<JustTCGSet> = {}): JustTCGSet {
  return {
    id: "archazias-island",
    name: "Archazia's Island",
    game_id: "disney-lorcana",
    count: 0,
    cards_count: 0,
    release_date: null,
    set_value_usd: null,
    ...overrides,
  };
}

test("Lorcana normalization preserves dual inks, legality, foil types, and asset gate", () => {
  const normalized = normalizeLorcanaJsonCard(lorcanaCard());
  assert.equal(normalized.printingKey, "lorcanajson:en:1434");
  assert.deepEqual(normalized.colors, ["Amber", "Steel"]);
  assert.equal(normalized.colorRaw, "Amber-Steel");
  assert.equal(normalized.legalities.Core.allowedUntilDate, "2026-07-17");
  assert.deepEqual(normalized.foilTypes, ["None", "Silver"]);
  assert.equal(normalized.externalIds.tcgplayer, "619407");
  assert.equal(normalized.assetWritesAllowed, false);
  assert.equal(normalized.imageUrls.full?.includes("ravensburger.com"), true);
});

test("promo identity uses the LorcanaJSON printing ID rather than collector number", () => {
  const promo = lorcanaCard({
    id: 659,
    setCode: "1",
    number: 1,
    fullIdentifier: "1 TFC • EN • 1/P1",
    promoGrouping: "P1",
    promoSource: "D23 Expo 2022",
    baseId: 115,
  });
  const normalized = normalizeLorcanaJsonCard(promo);
  assert.equal(isLorcanaPromo(promo), true);
  assert.equal(normalized.isPromo, true);
  assert.equal(normalized.printingKey, "lorcanajson:en:659");
  assert.equal(normalized.promo.baseSourceId, "115");
});

test("blank quest colors normalize to an empty list", () => {
  assert.deepEqual(normalizeLorcanaColors("", undefined), []);
});

test("database identity helpers keep set, definition, rarity, and variant keys stable", () => {
  assert.equal(lorcanaSetSlug("Q1"), "lorcana-q1");
  assert.equal(lorcanaTaxonomyCode("Super Rare"), "SUPER_RARE");
  assert.equal(lorcanaDefinitionSourceId(lorcanaCard({ id: 659, baseId: 115 })), "115");
  assert.equal(
    lorcanaVariantCode(
      lorcanaCard({ baseId: 115, fullIdentifier: "1 TFC • EN • 1/P1" })
    ),
    "PROMO"
  );
  assert.equal(
    lorcanaVariantCode(lorcanaCard({ baseId: 1434, fullIdentifier: "205/204 • EN • 7" })),
    "ALTERNATE_ART"
  );
});

test("Lorcana set matching is exact after punctuation normalization", () => {
  const matched = matchLorcanaJustTcgSet(justTcgSet(), [
    { code: "7", name: "Archazia’s Island" },
    { code: "8", name: "Reign of Jafar" },
  ]);
  assert.equal(matched?.code, "7");
});

test("commercial joins require a unique exact TCGplayer product ID on both sides", () => {
  const uniqueCanonical = normalizeLorcanaJsonCard(lorcanaCard());
  const duplicateCanonicalA = normalizeLorcanaJsonCard(
    lorcanaCard({ id: 2001, externalLinks: { tcgPlayerId: 111 } })
  );
  const duplicateCanonicalB = normalizeLorcanaJsonCard(
    lorcanaCard({ id: 2002, externalLinks: { tcgPlayerId: 111 } })
  );
  const result = matchLorcanaJustTcgCards(
    [
      justTcgCard(),
      justTcgCard({ uuid: "missing", id: "missing", tcgplayerId: "999" }),
      justTcgCard({ uuid: "conflict", id: "conflict", tcgplayerId: "111" }),
    ],
    [uniqueCanonical, duplicateCanonicalA, duplicateCanonicalB]
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.canonicalCard.printingKey, "lorcanajson:en:1434");
  assert.deepEqual(
    result.unmatched.map((card) => card.id),
    ["missing", "conflict"]
  );
  assert.deepEqual(result.conflictingProductIds, ["111"]);
});

test("duplicate JustTCG product IDs are quarantined", () => {
  const canonical = normalizeLorcanaJsonCard(lorcanaCard());
  const result = matchLorcanaJustTcgCards(
    [
      justTcgCard({ uuid: "provider-a", id: "provider-a" }),
      justTcgCard({ uuid: "provider-b", id: "provider-b" }),
    ],
    [canonical]
  );
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.conflictingProductIds, ["619407"]);
});

test("Near Mint English finish variants remain separate", () => {
  const variants = eligibleLorcanaMarketVariants(
    justTcgCard({
      variants: [
        {
          id: "normal",
          condition: "Near Mint",
          printing: "Normal",
          language: "English",
          price: 10,
        } as JustTCGCard["variants"][number],
        {
          id: "holofoil",
          condition: "Near Mint",
          printing: "Holofoil",
          language: "English",
          price: 12,
        } as JustTCGCard["variants"][number],
        {
          id: "cold-foil",
          condition: "Near Mint",
          printing: "Cold Foil",
          language: "English",
          price: 50,
        } as JustTCGCard["variants"][number],
        {
          id: "played",
          condition: "Lightly Played",
          printing: "Normal",
          language: "English",
          price: 8,
        } as JustTCGCard["variants"][number],
      ],
    })
  );
  assert.deepEqual(
    variants.map((variant) => variant.printing),
    ["Normal", "Holofoil", "Cold Foil"]
  );
});

test("JustTCG source identity prefers UUID and uses the latest variant timestamp", () => {
  const card = justTcgCard({
    variants: [
      { lastUpdated: 100 } as JustTCGCard["variants"][number],
      { lastUpdated: 200 } as JustTCGCard["variants"][number],
    ],
  });
  assert.equal(justTcgLorcanaCardExternalId(card), "justtcg-card-uuid");
  assert.equal(justTcgLorcanaSourceUpdatedAt(card), new Date(200_000).toISOString());
});

test("Lorcana staging migration keeps publication and asset writes disabled", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260723130000_lorcana_catalog_staging.sql"
    ),
    "utf8"
  );
  assert.match(sql, /'lorcana'/);
  assert.match(sql, /'lorcanajson',\s+'card_identity',\s+'canonical'/);
  assert.match(sql, /'justtcg',\s+'market_price',\s+'commercial'/);
  assert.match(sql, /"join": "exact_tcgplayer_product_id"/);
  assert.match(sql, /"publish_prices": false/);
  assert.match(sql, /'asset_writes_enabled', false/);
});

test("Lorcana public navigation follows the approved investor hierarchy", () => {
  const navSource = fs.readFileSync(
    path.join(process.cwd(), "src/components/layout/Nav.tsx"),
    "utf8"
  );
  const lorcanaBranch = navSource.match(
    /if \(gameRouteSlug === LORCANA_ROUTE_SLUG\) \{([\s\S]*?)\n  \}/
  )?.[1];

  assert.ok(lorcanaBranch);
  assert.deepEqual(
    [...lorcanaBranch.matchAll(/\{ label: "([^"]+)"/g)].map((match) => match[1]),
    ["Markets", "Characters", "Sets", "Franchises", "Rarities", "Promos", "All Cards"]
  );
  assert.match(lorcanaBranch, /"\/franchises"/);
  assert.match(lorcanaBranch, /"\/promos"/);
  assert.match(navSource, /<strong>Lorcana<\/strong>/);
});

test("Lorcana franchises and promos resolve to filtered catalog views", () => {
  const franchisePage = fs.readFileSync(
    path.join(process.cwd(), "src/app/games/[game]/franchises/page.tsx"),
    "utf8"
  );
  const promoPage = fs.readFileSync(
    path.join(process.cwd(), "src/app/games/[game]/promos/page.tsx"),
    "utf8"
  );
  const catalogPage = fs.readFileSync(
    path.join(process.cwd(), "src/app/games/[game]/catalog/page.tsx"),
    "utf8"
  );

  assert.match(franchisePage, /\?franchise=/);
  assert.match(promoPage, /\?variant=PROMO/);
  assert.match(catalogPage, /\.eq\("attribute", selectedFranchise\)/);
});
