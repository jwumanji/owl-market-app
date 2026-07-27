# Multi-TCG Migration Preflight

Generated: 2026-07-19T17:08:20.883Z
Supabase project: kiquytaevufssveqmqix
Mode: read-only
Result: PASS

## Bootstrap estimate

| Item | Rows |
| --- | --- |
| One Piece legacy cards / provisional printings | 5053 |
| One Piece provisional commercial variants | 5053 |
| Existing eBay sales entering quarantine | 1755 |
| Known legacy sync cursors carried forward | 4 |
| Inventory rows | 101 |
| PSA submission items | 127 |
| Owl Lens centering measurements | 13 |
| One Piece TR rarity taxonomy rows | 1 |

## Required schema

| Table | Status |
| --- | --- |
| games | ready |
| sets | ready |
| cards | ready |
| game_rarities | ready |
| game_variants | ready |
| game_set_types | ready |
| characters | ready |
| card_character_links | ready |
| inventory_items | ready |
| psa_submission_items | ready |
| centering_measurements | ready |
| jp_prices | ready |
| ebay_sales | ready |
| card_external_ids | ready |
| set_external_ids | ready |
| tcg_source_records | ready |
| price_provider_mappings | ready |
| sync_state | ready |
| public_rarity_summaries | ready |
| public_character_summaries | ready |

## Provider bootstrap

Distinct card_external_ids providers: justtcg, optcgapi, riftcodex, tcgplayer

Unmapped providers: _None._

## Integrity failures

_None._

## Safety notes

- This audit performs GET requests only.
- A passing result means the additive migration prerequisites are present; it does not authorize applying them to production.
- Existing eBay rows are expected to remain quarantined until exact commercial-variant matching is complete.
- JustTCG True Market remains disabled.
