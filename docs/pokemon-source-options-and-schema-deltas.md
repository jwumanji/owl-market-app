# Pokemon TCG Source Options And Schema Deltas

Checked: 2026-05-25
Linear: OWL-30

## Decision

Recommended catalog MVP source: PokemonTCG.io.

Recommended pricing pilot: TCGCSV first for low-friction TCGplayer product and price fixtures, then direct TCGplayer API if partner/API access is approved. TCGdex is useful as a secondary cross-check, especially for multilingual metadata and embedded marketplace pricing, but its own docs flag active marketplace-ID and variant-matching improvements, so it should not be the first source of truth for production price writes.

Do not treat any Pokemon source as official Pokemon Company approval for card art or copied card text. Keep public production image/text display behind an explicit asset/terms review gate, the same way Riftbound is gated.

## Source Comparison

| Source | Best Use | Strengths | Risks / Gaps | Recommendation |
| --- | --- | --- | --- | --- |
| PokemonTCG.io | Catalog MVP | Card/set endpoints, API key support, pagination, rich card JSON, images, TCGplayer/Cardmarket price snapshots, rarity/type/subtype endpoints | Third-party and explicitly unaffiliated with Nintendo/The Pokemon Company; prices are snapshots, not full historical market data; Pokemon finish variants are nested price dimensions | Use as primary catalog source after terms review |
| TCGCSV | Pricing fixture and TCGplayer product IDs | Cached TCGplayer categories, groups, products, prices; Pokemon category ID is `3`; daily update guidance; direct product/price join shape | Unofficial cache of TCGplayer API responses; no Cardmarket data; product IDs must be joined to source catalog carefully | Use for pricing pilot and join-quality audit |
| TCGplayer API | Long-term USD pricing | Official product/price/SKU path; condition/SKU-level path possible | API access is partner-gated; direct API has pagination and auth overhead; product-level IDs still need SKU/finish policy | Prefer after pilot proves product joins |
| TCGdex | Secondary catalog/pricing fixture | No API key, multilingual support, image helpers, embedded Cardmarket/TCGplayer pricing, variants field | Docs warn pricing and marketplace ID mapping are actively being improved; some images/data may be missing; source is community-maintained | Use as validation and multilingual source, not first price writer |
| Cardmarket API | EUR secondary pricing | Official EUR marketplace concepts and price guide | OAuth/API approval required; exact card/variant IDs need proof; not enough by itself for US market | Defer until Pokemon catalog and USD pricing are stable |
| Official pokemon.com card database | Legal reference / manual verification | First-party brand/source presence | No documented public API for automated ingest; scraping risk | Do not build scraper without explicit approval |

Sources:

- https://docs.pokemontcg.io/
- https://docs.pokemontcg.io/getting-started/authentication/
- https://docs.pokemontcg.io/getting-started/rate-limits/
- https://docs.pokemontcg.io/api-reference/cards/card-object/
- https://docs.pokemontcg.io/api-reference/cards/search-cards/
- https://docs.pokemontcg.io/api-reference/sets/search-sets/
- https://tcgcsv.com/docs
- https://tcgcsv.com/faq
- https://tcgdex.dev/rest
- https://tcgdex.dev/rest/cards
- https://tcgdex.dev/rest/sets
- https://tcgdex.dev/markets-prices
- https://tcgdex.dev/faq
- https://tcgdex.dev/assets
- https://docs.tcgplayer.com/reference/pricing_getproductconditionprices-1
- https://api.cardmarket.com/ws/documentation

## PokemonTCG.io Fit

PokemonTCG.io gives us most of what Owl Market needs for a first Pokemon catalog:

- `GET /v2/sets` for set rows.
- `GET /v2/cards` with `page`, `pageSize`, `q`, and `orderBy` for paged catalog sync.
- Card object includes `id`, `name`, `supertype`, `subtypes`, `hp`, `types`, rules, abilities, attacks, weaknesses, resistances, retreat cost, set object, collector `number`, `artist`, `rarity`, `flavorText`, Pokedex numbers, legalities, regulation mark, images, TCGplayer price snapshots, and Cardmarket price snapshots.
- API key is optional but recommended; authenticated default is 20,000 requests/day, unauthenticated is 1,000/day and 30/min.
- The docs say the project is not produced, endorsed, supported, or affiliated with Nintendo or The Pokemon Company, so legal/asset posture cannot be assumed.

## TCGCSV Fit

TCGCSV is strong for a pricing join pilot because it mirrors TCGplayer-shaped categories, groups, products, and prices:

- Pokemon category is `3`.
- Groups roughly map to sets.
- Products include `productId`, `groupId`, `url`, `imageUrl`, and `extendedData` fields like card number, rarity, card type, HP, stage, and card text.
- Prices are a separate collection joined by `productId`, with one-to-many rows by `subTypeName` such as Normal, Holofoil, and Reverse Holofoil.
- The docs explicitly say product IDs are safe as primary keys, but price rows require composite identity with `subTypeName`.
- TCGCSV asks clients to check `last-updated.txt`, pull no more than daily, set a clear User-Agent, and sleep between requests.

This is a good fit for a non-production audit script before direct TCGplayer access.

## TCGdex Fit

TCGdex is valuable but should be secondary:

- It has JSON REST endpoints for cards and sets, no required API key, and supports many languages.
- It includes card images via reconstructable URLs and supports low/high quality plus `png`, `webp`, and `jpg`.
- Its market integration includes embedded Cardmarket and TCGplayer prices in card responses.
- Its FAQ warns that pricing accuracy and marketplace IDs are still being improved, including a planned `variants_detailed` field for explicit marketplace IDs per variant.

Use TCGdex to validate multilingual/card-image coverage and as a price fixture comparison, but do not let it be the production price authority until marketplace ID quality is proven.

## Schema Mapping

### `games`

```json
{
  "slug": "pokemon",
  "name": "Pokemon TCG",
  "is_active": true,
  "is_public": false,
  "metadata": {
    "route_slug": "pokemon",
    "catalog_provider": "pokemontcg_io",
    "pricing_status": "deferred",
    "asset_status": "legal_review_required"
  }
}
```

### `sets`

Map Pokemon set rows as:

| Owl field | Pokemon source |
| --- | --- |
| `game_id` | Pokemon game row |
| `slug` | `pokemon-${source_set_id}` or normalized set name with source ID fallback |
| `code` | PokemonTCG.io `id` or `ptcgoCode` only if stable/present |
| `name` | `name` |
| `series` | `series` |
| `year` | release year |
| `release_date` | `releaseDate` |
| `card_count` | `total` preferred; preserve `printedTotal` in payload |
| `tcg_set_id` | TCGplayer group ID only after provider mapping proof |
| `game_payload` or raw record | legalities, images, printedTotal, total, updatedAt |

### `cards`

Keep global typed columns generic and place Pokemon-specific structure in `game_payload`.

| Owl field | Pokemon source |
| --- | --- |
| `card_image_id` | `pokemon:${source_card_id}` |
| `card_number` | `number` |
| `name` / `name_base` | `name` |
| `set_id` | mapped set |
| `rarity` / `rarity_id` | source `rarity`, game-scoped taxonomy |
| `variant_id` | default card-level variant; finish variants live in payload/price dimensions |
| `card_type` | `supertype` |
| `color` | `types` or colorless equivalent if needed for UI filtering |
| `cost` | `convertedRetreatCost` is not the same as energy cost; do not overload without UI decision |
| `artist` | `artist` |
| `image_url` | source image only after legal review |
| `tcg_product_id` | TCGplayer product ID only after exact join proof |
| `game_payload` | all Pokemon-specific details |

Suggested `game_payload.schema`: `pokemon.card.v1`.

Suggested payload shape:

```json
{
  "schema": "pokemon.card.v1",
  "card": {
    "source_card_id": "swsh4-25",
    "supertype": "Pokemon",
    "subtypes": ["Stage 2"],
    "hp": "170",
    "types": ["Fire"],
    "national_pokedex_numbers": [6],
    "regulation_mark": "D",
    "legalities": {
      "standard": "Legal",
      "expanded": "Legal",
      "unlimited": "Legal"
    }
  },
  "gameplay": {
    "abilities": [],
    "attacks": [],
    "weaknesses": [],
    "resistances": [],
    "retreat_cost": [],
    "converted_retreat_cost": 3,
    "rules": []
  },
  "text": {
    "flavor": null
  },
  "variants": {
    "known_finishes": ["normal", "holofoil", "reverse_holofoil"],
    "first_edition": false
  },
  "media": {
    "small_image_url": null,
    "large_image_url": null,
    "image_url_deferred": true
  },
  "source": {
    "provider": "pokemontcg_io",
    "updated_at": "2021/08/04"
  }
}
```

## Taxonomies

Do not hardcode Pokemon rarities from memory. Seed the first taxonomy from the source rarity endpoint and observed card rows, then treat new rarity values as sync warnings.

Expected taxonomy families:

- Rarities: source values such as Common, Uncommon, Rare, Rare Holo, Double Rare, Ultra Rare, Illustration Rare, Special Illustration Rare, Hyper Rare, Promo, and era-specific legacy values.
- Variants/finishes: Normal, Holofoil, Reverse Holofoil, First Edition, and provider-specific values from TCGplayer/TCGCSV `subTypeName`.
- Set types: Main Set, Promo, Special Set, McDonald's/food promo, League/Prize Pack, Trainer Kit, World Championship, and other supplemental product lines. TCGplayer `isSupplemental` should not be trusted alone.

## External IDs

Store all provider identities as game-scoped rows:

### `set_external_ids`

- `pokemontcg_io:set_id`
- `pokemontcg_io:ptcgo_code`
- `tcgplayer:group_id`
- `tcgdex:set_id`
- `cardmarket:set_id` only after exact proof

### `card_external_ids`

- `pokemontcg_io:card_id`
- `tcgdex:card_id`
- `tcgplayer:product_id`
- `tcgplayer:product_id:${finish}` only if provider gives distinct finish products
- `cardmarket:product_id` only after exact proof

For pricing, never treat `productId` alone as unique once finish/subtype rows are involved. Use `(provider, productId, finish/subTypeName, currency)` for price observation identity.

## Pricing Recommendation

Phase 1, catalog MVP:

- Ingest Pokemon catalog from PokemonTCG.io.
- Store source-provided TCGplayer/Cardmarket snapshots in `game_payload.source_price_snapshot` or raw source records.
- Do not write public `price_stats` until variant/finish policy is decided.

Phase 2, pricing pilot:

- Use TCGCSV to match TCGplayer groups/products/prices against PokemonTCG.io cards.
- Measure exact match by set ID/code, card number, name, rarity, and product URL.
- Store TCGplayer product IDs in `card_external_ids`.
- Decide which finish becomes the default public `market_avg` for a card, or whether UI needs finish selection.

Phase 3, production pricing:

- Prefer direct TCGplayer API if access is approved.
- Keep TCGCSV as a fallback/offline fixture source if its terms remain acceptable.
- Add a provider-normalized price observation table before supporting multiple Pokemon price providers simultaneously.

## Asset And Legal Gate

Pokemon card art and official text should be treated as launch-gated assets:

- Keep `games.is_public = false` for Pokemon until source/image terms are reviewed.
- Do not mirror card images to Owl storage until rights are confirmed.
- If displaying third-party image URLs during internal testing, keep it behind a private/admin route or non-public preview flag.
- Public pages should support missing-image and redacted-text states before launch.

## Implementation Tickets To Create After Research Approval

1. Add Pokemon game seed migration and taxonomies.
2. Capture PokemonTCG.io live payload fixtures for sets, cards, rarities, and price snapshots.
3. Implement Pokemon catalog adapter with dry-run/report mode.
4. Add Pokemon catalog audit script for totals, duplicate IDs, rarity drift, missing images, and provider price coverage.
5. Run private Pokemon smoke ingest with `is_active = true`, `is_public = false`.
6. Run TCGCSV pricing join pilot and decide whether to activate pricing.
