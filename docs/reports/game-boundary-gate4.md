# Game Boundary Audit

Generated: 2026-07-22T04:59:40.186Z
Result: PASS

## Game Rows

| Slug | Name | Active | Public | Route Slug |
| --- | --- | --- | --- | --- |
| one_piece | One Piece Card Game | yes | yes | one-piece |
| riftbound | Riftbound | yes | no | riftbound |


## Table Counts By Game

| Game | Table | Rows |
| --- | --- | --- |
| one_piece | sets | 53 |
| one_piece | cards | 5053 |
| one_piece | price_stats | 4594 |
| one_piece | price_history | 87112 |
| one_piece | inventory_items | 101 |
| one_piece | custom_cards | 0 |
| one_piece | card_match_aliases | 3 |
| one_piece | inventory_bundles | 1 |
| one_piece | inventory_bundle_items | 10 |
| one_piece | customer_orders | 1 |
| one_piece | customer_order_items | 0 |
| one_piece | psa_submissions | 9 |
| one_piece | psa_submission_items | 127 |
| one_piece | centering_measurements | 13 |
| one_piece | card_external_ids | 7892 |
| one_piece | set_external_ids | 53 |
| one_piece | tcg_source_records | 0 |
| one_piece | price_provider_mappings | 1 |
| one_piece | sealed_products | 380 |
| one_piece | sealed_product_price_history | 356 |
| one_piece | card_market_sync_status | 3545 |
| riftbound | sets | 7 |
| riftbound | cards | 1064 |
| riftbound | price_stats | 0 |
| riftbound | price_history | 0 |
| riftbound | inventory_items | 0 |
| riftbound | custom_cards | 0 |
| riftbound | card_match_aliases | 0 |
| riftbound | inventory_bundles | 0 |
| riftbound | inventory_bundle_items | 0 |
| riftbound | customer_orders | 0 |
| riftbound | customer_order_items | 0 |
| riftbound | psa_submissions | 0 |
| riftbound | psa_submission_items | 0 |
| riftbound | centering_measurements | 0 |
| riftbound | card_external_ids | 3192 |
| riftbound | set_external_ids | 22 |
| riftbound | tcg_source_records | 1072 |
| riftbound | price_provider_mappings | 1 |
| riftbound | sealed_products | 0 |
| riftbound | sealed_product_price_history | 0 |
| riftbound | card_market_sync_status | 0 |


## Missing Game IDs

_None._


## Cross-Game Relationship Drift

_None._


## Duplicate Key Checks

| Check | Duplicates |
| --- | --- |
| Global card_image_id duplicates (allowed after scoping) | 0 |
| Scoped card game_id/card_image_id duplicates | 0 |
| Global set slug duplicates (allowed after scoping) | 0 |
| Scoped set game_id/slug duplicates | 0 |
| Scoped set game_id/upper(code) duplicates | 0 |
| Scoped card external ID duplicates | 0 |
| Scoped set external ID duplicates | 0 |


## Source And Provider Counts

| Game | Provider / Type | Rows |
| --- | --- | --- |
| riftbound | riftcodex:card | 1064 |
| riftbound | riftcodex:rarity_index | 1 |
| riftbound | riftcodex:set | 7 |


| Game | Provider | Active Mappings |
| --- | --- | --- |
| one_piece | justtcg | 1 |

## Failures

_None._
