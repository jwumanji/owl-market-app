# Multi-TCG Gate 6 Selected-Set Proof

Generated: 2026-07-22T07:00:00Z
Supabase project: kiquytaevufssveqmqix
Application commit: f129558
Production deployment: dpl_DsERQusUfmxun8XKxrEWtRjkHREU
Result: PASS

## Rollout State

- `MULTITCG_DUAL_WRITE_ENABLED=1`
- `MULTITCG_READ_MODE=legacy`
- Selected game: `one_piece`
- Selected provider/set: JustTCG v1 / `ST15`
- Customer-facing reads remained on the legacy path.

## Selected-Set Runs

| Run | HTTP | Legacy updated | Errors | Shadow attempted | Shadow rows processed |
| --- | --- | --- | --- | --- | --- |
| Initial | 200 | 5 | 0 | 5 | 5 |
| Idempotency repeat | 200 | 5 | 0 | 5 | 5 |

The RPC reports rows processed through its upsert path. Database cardinality is
the idempotency proof: the repeat created a second ingest-run audit row but did
not add a second SKU, observation, latest fact, or preferred-price row.

## Database Proof

| Check | After initial run | After repeat |
| --- | --- | --- |
| JustTCG provider SKUs | 5 | 5 |
| JustTCG price observations | 5 | 5 |
| JustTCG latest price facts | 5 | 5 |
| JustTCG preferred card prices | 5 | 5 |
| JustTCG source ingest runs | 1 | 2 |

Post-repeat integrity findings:

- Provider-product duplicate groups: 0
- Provider-SKU duplicate groups: 0
- Observation duplicate groups: 0
- Latest-fact/observation mismatches: 0
- Preferred-price/latest-fact mismatches: 0
- True Market observations: 0

## Regression Checks

- 200-card `shape_identity` comparison: PASS, 0 expected and 0 unexpected differences.
- Foundation reconciliation: PASS.
- Game-boundary audit: PASS, 0 cross-game issues and 0 missing `game_id` rows.
- Riftbound public visibility is accepted only when the approved catalog-preview
  metadata remains exact: catalog and TCGplayer images, TCGplayer-only image
  gate, and pricing deferred.

## Remaining Read-Cutover Blockers

- 1,755 eBay sales do not yet resolve to exactly one commercial variant.
- 4,589 legacy priced cards still lack a preferred-price projection.
- JP/eBay canonical observation backfills and sustained dual-write stability
  remain required before changing `MULTITCG_READ_MODE`.
