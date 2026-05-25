# Magic: The Gathering Source Options And Schema Deltas

Checked: 2026-05-24
Linear: OWL-31

## Recommendation

Use Scryfall as the catalog MVP source for Magic: The Gathering. It has the best first-party-shaped card/search/bulk surface for cards, printings, faces, images, legality, prices, and stable identifiers, and it does not require an API key. Use MTGJSON as the secondary reconciliation source because it packages normalized bulk files, MTGJSON UUIDs, Scryfall IDs, TCGplayer/Cardmarket identifiers, sealed product data, and price snapshots/history in a form that is easier to process offline.

Pricing should stay deferred for the public MVP. Import raw price snapshots only until Owl has a clear policy for finish, condition, language, currency, provider, and SKU/product joins. The least risky pricing pilot is:

1. MTGJSON price files to prove UUID/provider/finish coverage.
2. TCGCSV or direct TCGplayer API to prove USD product/SKU joins.
3. Cardmarket for EUR after access and product/language/finish proof.

Do not mirror or publicly serve Magic card images or full text until the asset/legal gate is explicit. Scryfall and MTGJSON are good technical sources, but they are not Wizards approval. Wizards' Fan Content Policy needs product/legal review before public card art, logos, card text, and image storage are enabled.

## Sources Checked

- Scryfall API docs: https://scryfall.com/docs/api
- Scryfall bulk data docs: https://scryfall.com/docs/api/bulk-data
- Scryfall API blocking/rate-limit FAQ: https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17
- MTGJSON all files: https://mtgjson.com/downloads/all-files/
- MTGJSON identifiers model: https://mtgjson.com/data-models/identifiers/
- MTGJSON price list model: https://mtgjson.com/data-models/price/price-list/
- TCGCSV docs: https://tcgcsv.com/docs
- TCGCSV FAQ: https://tcgcsv.com/faq
- TCGplayer pricing overview: https://docs.tcgplayer.com/reference/pricing
- TCGplayer product prices: https://docs.tcgplayer.com/reference/pricing_getproductprices-1
- TCGplayer SKU market price: https://docs.tcgplayer.com/reference/pricing_getmarketpricebyproductconditionid-1
- Cardmarket API docs: https://api.cardmarket.com/ws/documentation
- Cardmarket API access note: https://help.cardmarket.com/de/cardmarket-api
- Wizards Fan Content Policy: https://company.wizards.com/en/legal/fancontentpolicy
- JustTCG card schema: https://justtcg.com/docs/schema/card

## Source Comparison

| Source | Best use | Auth/cost | Strengths | Risks and gates |
| --- | --- | --- | --- | --- |
| Scryfall | Catalog MVP and daily bulk refresh | No API key. Must use responsible request headers/rate limiting. Bulk preferred for large imports. | Rich card object, set data, card faces, `oracle_id`, printing `id`, `identifiers`, legalities, images, rulings, and approximate prices. | Price data is not authoritative enough for Owl public pricing. Images/text need legal review. Live API traffic must be throttled and should not replace bulk ingestion. |
| MTGJSON | Offline reconciliation, stable UUIDs, price snapshots, sealed-product exploration | Public downloadable files. | `AllPrintings`, `AllIdentifiers`, `AllPrices`, `AllPricesToday`, TCGplayer SKU mappings, and identifiers for Scryfall/TCGplayer/Cardmarket. | Bulk size/storage and cadence need job design. Needs reconciliation rules back to Scryfall and marketplace identifiers. |
| TCGCSV | Low-friction TCGplayer category/group/product/price fixtures | Public cache. No direct partner OAuth. | Cached TCGplayer categories, groups, products, and market-price objects. Useful before partner API access. | Unofficial cache. Data can lag. Exact Magic category/group/product/price joins must be fixture-proven before production use. |
| TCGplayer API | Production USD marketplace pricing | Requires API access/auth. | Official product and pricing endpoints, product market prices, and SKU-level market price endpoints. | Access may be constrained. Owl must define condition, finish, language, SKU, and product join policy before publishing. |
| Cardmarket API | EUR pricing and European product references | OAuth/API access; Cardmarket help currently says new API applications are not being accepted. | Official EU marketplace/product/price-guide path. Strong future source for EUR support. | Access gate, language/finish/product matching, and non-US market semantics. Do not block US MVP on this. |
| Commercial APIs, e.g. JustTCG/API TCG/TCGAPIs | Optional paid acceleration for packaged catalog/pricing | API key/subscription. | May expose unified cards, variants, prices, TCGplayer IDs, MTGJSON IDs, and Scryfall IDs. | Licensing, cost, coverage proof, and vendor dependency. Treat as an evaluated alternative, not the default source of truth. |

## Game Seed

```json
{
  "slug": "magic",
  "name": "Magic: The Gathering",
  "is_active": true,
  "is_public": false,
  "metadata": {
    "route_slug": "magic",
    "catalog_provider": "scryfall",
    "secondary_provider": "mtgjson",
    "pricing_status": "deferred",
    "asset_status": "legal_review_required"
  }
}
```

`is_public` should remain `false` until the import, UI, and legal gates are closed. If internal QA needs visibility, expose it behind an admin or feature flag rather than public navigation.

## Set Mapping

Map Scryfall sets into Owl `sets` with game-scoped uniqueness:

- `game_id`: Magic game row.
- `slug`: `magic-${scryfall_set_code}` or a normalized name/code fallback.
- `code`: Scryfall/Magic set code, preserving source value in payload while relying on game-scoped unique constraints for case-normalized lookups.
- `name`: source set name.
- `series` or payload field: Scryfall block/parent relationships where present.
- `set_type`: source set type, normalized through a Magic taxonomy.
- `released_at`, `card_count`, `digital`, `parent_set_code`, icon URI, Scryfall URI, and MTGJSON set code in payload.

Recommended set external IDs:

- `scryfall:set_id`
- `scryfall:set_code`
- `mtgjson:set_code`
- `tcgplayer:group_id`
- `cardmarket:expansion_id`

## Card Mapping

Use one Owl `cards` row per source printing, not per face and not per finish for the first importer. The default primary identity should be Scryfall's printing `id`.

Suggested field policy:

- `game_id`: Magic game row.
- `set_id`: Scryfall/MTGJSON reconciled set.
- `card_image_id`: `scryfall:${id}` or `magic:${scryfall_id}`. Keep exact provider IDs in `card_external_ids` too.
- `card_number`: collector number as a string.
- `name`: Scryfall display name; multi-face cards keep the combined display name.
- `name_base`: optional oracle/name normalization for search.
- `rarity_id`: game-scoped rarity from the source rarity.
- `variant_id`: only the generic/default print variant at MVP; finishes/art treatments live in payload/taxonomies until listing/price semantics are defined.
- `image_url`: disabled or internal-only until legal review.
- `tcg_product_id`: null until exact marketplace join proof exists.
- `game_payload`: Magic-specific metadata described below.

Suggested card external IDs:

- `scryfall:id` for the exact printing.
- `scryfall:oracle_id` for oracle identity across printings.
- `scryfall:illustration_id` where present.
- `mtgjson:uuid`.
- `tcgplayer:product_id`.
- `tcgplayer:etched_product_id` / `tcgplayer:alternative_foil_product_id` when available from MTGJSON.
- `cardmarket:product_id` / `mcm:id` where available.
- `multiverse:id`.
- `mtgo:id`.

## `cards.game_payload` Shape

Store source-specific Magic data under a versioned schema so the generic Owl schema does not need to absorb every MTG concept immediately.

```json
{
  "schema": "magic.card.v1",
  "scryfall": {
    "id": "...",
    "oracle_id": "...",
    "illustration_id": "...",
    "set_id": "...",
    "uri": "..."
  },
  "mtgjson": {
    "uuid": null
  },
  "printing": {
    "lang": "en",
    "collector_number": "123",
    "released_at": "2026-01-01",
    "reprint": false,
    "promo": false,
    "promo_types": [],
    "variation": false,
    "digital": false,
    "games": ["paper"],
    "frame": "2015",
    "frame_effects": [],
    "border_color": "black",
    "security_stamp": null
  },
  "gameplay": {
    "mana_cost": "{2}{G}",
    "cmc": 3,
    "type_line": "Creature - Example",
    "oracle_text": "...",
    "power": null,
    "toughness": null,
    "loyalty": null,
    "defense": null,
    "colors": [],
    "color_identity": [],
    "keywords": [],
    "legalities": {}
  },
  "faces": [
    {
      "name": "...",
      "mana_cost": "...",
      "type_line": "...",
      "oracle_text": "...",
      "colors": [],
      "image_uris": {}
    }
  ],
  "finishes": {
    "available": ["nonfoil", "foil", "etched"],
    "source_finishes": [],
    "default_display_finish": null
  },
  "identifiers": {
    "multiverse_ids": [],
    "mtgo_id": null,
    "tcgplayer_id": null,
    "cardmarket_id": null
  }
}
```

## Multi-Face Cards

Do not create one card row per face at MVP. Split cards, adventures, transform cards, modal double-faced cards, meld cards, and other layouts should share one printing row and keep face data inside `game_payload.faces`.

UI/search implications:

- Detail pages need a face-aware image/text display before Magic is public.
- Search can flatten face names, type lines, and oracle text into the card search document.
- Image selection should prefer the front/default face first and expose back/alternate face assets only after the asset gate.
- Dedupe must use external IDs before name/layout heuristics; many Magic cards share or reuse names across printings and special objects.

## Finishes, Variants, And Languages

Magic finish is a marketplace/listing dimension, not automatically an Owl `variant_id` row split. Do not create separate card rows for `foil`, `nonfoil`, or `etched` unless a later pricing/listing model needs that denormalization.

Suggested treatment:

- `finishes.available`: Scryfall/MTGJSON finish availability.
- Art treatments and promos: payload and optional game-specific taxonomy, e.g. showcase, borderless, extended art, retro frame, serialized, promo, prerelease, buy-a-box, Universes Beyond.
- Price observations: key by provider, product/SKU, finish/subType, condition, language, currency, and timestamp.
- Catalog MVP language: import English/default printings first. If all-language support is added later, preserve Scryfall `id` plus `lang` and do not merge foreign-language printings into English rows.
- Store `printed_name`, `printed_text`, and `printed_type_line` in payload when non-English printings are imported.

## Taxonomies To Seed

Seed taxonomies from source data observed in fixtures, not from a static hand-written list alone.

Likely Magic taxonomies:

- Rarities: common, uncommon, rare, mythic, special/bonus values as observed.
- Finishes: nonfoil, foil, etched.
- Set types: core, expansion, masters, commander, draft innovation, funny, starter, duel deck, planechase, archenemy, promo, token, memorabilia, and future source values.
- Treatments/variants: normal art, showcase, borderless, extended art, retro frame, serialized, promo, prerelease, buy-a-box, Universes Beyond, source promo types, and frame effects.
- Legalities/formats: commander, standard, modern, legacy, vintage, pioneer, pauper, brawl, historic, alchemy, explorer, oathbreaker, penny, and any current Scryfall legality keys.

## Dedupe And Reconciliation Rules

Primary upsert key:

```text
game_id + provider + scryfall:id
```

Cross-provider matching order:

1. Exact external IDs: Scryfall ID, MTGJSON UUID, TCGplayer product/SKU ID, Cardmarket/MCM product ID, multiverse ID, MTGO ID.
2. Exact set code/group plus collector number plus language plus normalized source name.
3. Finish/treatment-aware marketplace evidence.
4. Manual review bucket.

Never dedupe Magic cards by name alone. Reprints, alternate art, multiple languages, token/supplemental objects, multi-face layouts, art treatments, and product/SKU splits make name-only matching unsafe.

## Pricing Plan

Pricing is a separate follow-up stream from catalog import.

For the first pricing fixture:

- Capture MTGJSON `AllPricesToday` and a small `AllPrices` window for recent sets and known multi-finish cards.
- Capture TCGCSV categories/groups/products/prices for a small set sample, resolving the current Magic category ID from the TCGCSV categories endpoint instead of hard-coding it.
- If direct TCGplayer access exists, compare product-level market prices with SKU-level market prices for the same cards.
- Compare Cardmarket identifiers only when API/data access exists.

Do not write public `price_stats` until Owl can represent:

- Provider.
- Currency.
- Condition.
- Finish/subType.
- Language.
- Product ID versus SKU/product-condition ID.
- Observation timestamp and stale-data policy.

## Legal And Asset Gates

Blockers before Magic can be public:

- Confirm whether public display is covered by Wizards' Fan Content Policy or another explicit permission path.
- Decide whether Owl may store card image URLs only, cache thumbnails, or mirror images.
- Decide whether full oracle text/printed text can be stored and displayed publicly.
- Add required attribution/disclaimer text if using the Fan Content Policy path.
- Do not use Wizards logos or marks beyond approved text references without legal/product approval.

## Follow-Up Tickets

Recommended follow-up issues:

1. MTG source terms and asset gate.
2. MTG Scryfall fixture capture for sets, default cards, all-cards sample, bulk metadata, and rulings.
3. MTG game seed and taxonomy migration.
4. MTG catalog adapter using Scryfall primary data and MTGJSON reconciliation.
5. MTG multi-face detail/search UI QA.
6. MTG price fixture and exact-join proof using MTGJSON plus TCGCSV/TCGplayer.
7. MTG sealed product mapping using MTGJSON and marketplace sources.

## Acceptance Handoff

This issue is docs/research only. It intentionally does not mutate repo schema or application code.

The recommended next implementation path is to close the asset/legal gate and fixture-capture Scryfall/MTGJSON samples before any importer work begins.
