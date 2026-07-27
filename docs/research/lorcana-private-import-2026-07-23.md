# Lorcana private import — 2026-07-23

The first private Lorcana staging import completed and was independently
verified at `2026-07-23T10:06:37Z`.

## Persisted

| Entity | Rows |
| --- | ---: |
| Sets | 18 |
| Legacy-compatible cards | 3,226 |
| Canonical card definitions | 2,726 |
| Card printings | 3,226 |
| LorcanaJSON raw records | 3,245 |
| JustTCG raw records | 17,872 |
| Total raw records | 21,117 |
| Reconciliation candidates | 599 |

The definition count is lower than the printing count because promos and
alternate printings can reference a shared LorcanaJSON `baseId`.

## Reconciliation queue

| Status | Rows |
| --- | ---: |
| `provider_ahead` | 480 |
| `sealed_product` | 115 |
| `catalog_only` | 3 |
| `identity_conflict` | 1 |

The identity conflict is TCGplayer product `601112`, shared by the Moana and
Vaiana source records. It remains quarantined.

## Safety verification

- Public catalog enabled: no
- Published price rows: 0
- Cards with copied `image_url`: 0
- Image writes enabled: no
- Price publication enabled: no
- Successful ingest runs: 2

Two failed ingest-run records were intentionally retained from the first apply
attempt, which reached the reconciliation bulk-write step before PostgREST
rejected inconsistent object keys. The retry used a normalized row shape and
completed successfully. Retaining the failed runs preserves an honest audit
trail.
