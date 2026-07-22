# Multi-TCG Reconciliation

Generated: 2026-07-22T04:59:06.487Z
Supabase project: kiquytaevufssveqmqix
Mode: read-only
Foundation: PASS
Read cutover: BLOCKED

## Coverage

| Check | Rows | Unresolved |
| --- | --- | --- |
| Legacy cards → printings | 5053 | 0 |
| Printings → legacy variants | 5053 | 0 |
| Inventory identity | 101 | 0 |
| PSA identity (catalog-linked) | 15 | 0 |
| Owl Lens identity (catalog-linked) | 0 | 0 |
| One Piece TR rarity taxonomy | 1 | 0 |
| External provider-code mapping | 4 | 0 |
| eBay exact variant match | 1755 | 1755 |
| Immutable price observations | 0 | 0 |
| Preferred priced-card coverage | 4594 | 4594 |

## Pending manual catalog identity

- PSA items intentionally pending a catalog match: 85
- Owl Lens measurements intentionally pending a catalog match: 0

## Foundation failures

_None._

## Read-cutover blockers

- 1755 eBay sales do not resolve to exactly one commercial variant
- 4594 legacy priced cards lack a preferred-price projection
- No shadow price observations exist; dual writing has not been proven

## Interpretation

- Foundation PASS means the additive identity and pricing layers are internally consistent.
- Read cutover remains blocked until eBay is exactly matched, shadow price coverage is complete, and golden API comparisons pass.
- This audit performs GET requests only.
