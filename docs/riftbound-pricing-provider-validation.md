# Riftbound Pricing Provider Validation

Checked: 2026-05-25
Linear: OWL-28

## Decision

Keep Riftbound pricing deferred. The catalog is ready for provider ID testing, but pricing should not be enabled until a credentialed fixture run proves exact joins and legal/commercial use rights.

Recommended first pilot: Scrydex, if paid API terms and a sample fixture validate exact card IDs or deterministic search joins. TCGplayer is the strongest fallback for USD market pricing because every synced Riftbound card currently has a TCGplayer product ID, but it still needs official API access and product-to-SKU/condition resolution. Cardmarket should stay secondary until card-level IDs and API approval are available.

## Current Moon Market Join State

Run:

```powershell
npm run audit:riftbound-pricing -- --report=C:\tmp\riftbound-pricing-readiness.md
```

Current live audit result:

| Metric | Result |
| --- | --- |
| Riftbound catalog cards | 1064 |
| Riftcodex durable card keys | 1064 / 1064 |
| TCGplayer product IDs | 1064 / 1064 |
| Cardmarket card IDs | 0 / 1064 |
| TCGplayer duplicate product IDs | 0 |
| Riftcodex duplicate card keys | 0 |
| Active Riftbound price mappings | 0 |

The existing `price_provider_mappings` row for Riftbound is intentionally inactive and points to TCGplayer product IDs with `market_price=false` and `price_history=false`.

## Provider Findings

### Scrydex

Scrydex has the best API shape for a first pilot. Its Riftbound docs expose card, expansion, sealed product, webhook, and price history surfaces, and its card API advertises real-time pricing data. The price history endpoint supports filters for days, date range, variant, condition, grading company, grade, signed, error, and perfect flags. Its pricing page lists raw prices, graded prices, trends, and history across paid plans, and the rate-limit docs say access is credit based with a 100 requests/second cap.

Sources:

- https://scrydex.com/docs/riftbound/api-reference
- https://scrydex.com/docs/riftbound/price-history
- https://scrydex.com/pricing
- https://scrydex.com/docs/getting-started/rate-limits

Open risk: Moon Market does not currently store Scrydex card IDs. Before implementation, run a credentialed fixture over representative Riftbound cards and confirm whether Scrydex IDs match Riftcodex/Riftbound IDs or require a search join by set code, collector number, name, and variant.

### TCGplayer

TCGplayer is attractive because Riftcodex supplied TCGplayer product IDs for every synced card. Official TCGplayer pricing docs expose SKU market prices, not just product-level market prices, so a direct integration must resolve product IDs to SKU/product-condition IDs before writing condition-aware pricing. TCGplayer also describes pricing-data access through prebuilt APIs and partner/app arrangements.

Sources:

- https://docs.tcgplayer.com/reference/pricing_getproductconditionprices-1
- https://help.tcgplayer.com/hc/en-us/articles/201577976-How-can-I-get-access-to-your-card-pricing-data

Open risk: product ID coverage is complete, but current Moon Market storage only has card-level aggregate `price_stats`. A real TCGplayer integration must define how conditions and foil/printing SKUs collapse into the display aggregate.

### Cardmarket

Cardmarket has live Riftbound marketplace pages and price-guide concepts, but our catalog only has partial Cardmarket set IDs and no Cardmarket card IDs. Official API access is OAuth based, restricted/approval gated, and the docs warn against repeatedly pulling public marketplace resources through a dedicated app. Cardmarket is useful as an EUR secondary source, but it is not ready for exact joins in Moon Market yet.

Sources:

- https://www.cardmarket.com/en/Riftbound
- https://api.cardmarket.com/ws/documentation
- https://api.cardmarket.com/ws/documentation/API%3AAuth_Overview
- https://api.cardmarket.com/ws/documentation/API_1.0%3AEntities%3APrice_Guide

Open risk: no card-level join key is stored. Do not use fuzzy name-only matching for price writes.

### Third-Party Cardmarket Wrappers

`tcg-cardmarket-api.com` advertises Riftbound support, daily Cardmarket-sourced prices, batch lookup, and a low-cost/free tier. This may be useful for a pilot fixture, but commercial redistribution rights and upstream Cardmarket compliance need explicit review before production use.

Source:

- https://www.tcg-cardmarket-api.com/

## Required Fixture Gate

Before any cron writes Riftbound prices:

1. Obtain credentials for the candidate provider.
2. Fetch current-price fixtures for:
   - base card: `ogn-011-298`
   - alternate-art card: `ogn-007a-298`
   - overnumbered/signature-style card: `ogn-299-298` and `ogn-299*-298`
   - organized play metal/promo example: `opp-017-024` and `opp-017-024:metal`
   - sealed/product example if provider supports products
3. Fetch historical price fixture for at least one base card and one variant card.
4. Record provider IDs into `card_external_ids` or reject the provider if exact IDs cannot be stored.
5. Compute exact-match and unmatched rates against all 1064 synced Riftbound cards.
6. Decide the aggregate write policy for `price_stats`:
   - provider priority
   - currency
   - condition
   - variant/printing
   - stale-price behavior
7. Only then activate `price_provider_mappings` for the selected provider.

## Storage Recommendation

Short term, keep `price_stats` as the public card-level aggregate and write only one normalized display price per card after the fixture gate passes. Store provider-native dimensions in `price_history.metadata`, including provider, provider card/product/SKU ID, currency, condition, variant, last source timestamp, and raw source record reference.

Medium term, add a provider-normalized price observation table before supporting multiple simultaneous Riftbound sources:

- `game_id`
- `card_id`
- `provider`
- `provider_product_id`
- `provider_sku_id`
- `currency`
- `condition`
- `variant`
- `price_low`
- `price_market`
- `price_trend`
- `volume`
- `source_record_id`
- `source_observed_at`
- `fetched_at`
- unique key on `(game_id, provider, provider_sku_id, source_observed_at)`

Then derive `price_stats` from the selected source/condition policy instead of treating provider payloads as the public aggregate directly.

