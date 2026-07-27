# ADR 002: Multi-TCG catalog and pricing migration

- Status: Accepted
- Date: 2026-07-19

## Context

Owl Market's production catalog and price pages are built around a single
`cards` row with a single selected JustTCG Near Mint price. Game scoping now
prevents top-level One Piece/Riftbound collisions, but the legacy row still
conflates gameplay identity, physical printing, finish, provider product, and
sellable condition.

Pokemon, Magic, Lorcana, Gundam, Dragon Ball, and Riftbound require independent
printing, finish, language, condition, grade, provider SKU, market, and currency
dimensions. eBay sold listings and Japanese prices must also participate in the
same price fact model without being flattened into a card-level average.

## Decision

We will use an additive, dual-run migration:

1. Existing `cards`, `price_stats`, `price_history`, `jp_prices`, and
   `ebay_sales` remain the live compatibility model during migration.
2. New card definitions, physical printings, commercial variants, provider
   products/SKUs, and immutable price observations are added beside them.
3. Existing card rows are losslessly bootstrapped as one provisional definition,
   printing, and commercial variant per legacy card. Later reconciliation can
   merge definitions and expand variants without changing legacy IDs.
4. Price facts and preferred legacy-page prices are separate derived layers.
5. Only canonical marketplace observations may affect aggregates. Ambiguous raw
   eBay results remain quarantined until they resolve to exactly one commercial
   variant.
6. JustTCG v1 is the normalized contract while v2 is beta. Beta payloads may be
   retained as raw source data but cannot populate canonical columns.
7. Price observations are monthly range-partitioned before Magic data is loaded.
8. Public catalog reads remain server-side. Anonymous grants and unconditional
   catalog read policies are not part of the new model.
9. JustTCG True Market remains disabled during the migration. The initial
   shadow writer records the stable v1 market price only.

## Identity layers

```text
game
  -> game edition / regional catalog
  -> set release
  -> card definition
  -> card printing
  -> commercial variant
  -> provider product
  -> provider SKU
  -> price observation
```

Owl-generated UUIDs are canonical. Names, card numbers, slugs, image keys, and
provider identifiers are matching attributes only.

## Compatibility strategy

- Legacy pages continue reading their current tables until a preferred-price
  projection is populated and verified.
- New sync code will be feature-gated when dual writing begins.
- `MULTITCG_DUAL_WRITE_ENABLED` defaults off. When enabled, the current JustTCG
  sync writes its already-matched Near Mint result to provider product, provider
  SKU, immutable observation, exact-latest, and preferred-price layers after
  completing the legacy write.
- `MULTITCG_READ_MODE` defaults to `legacy`; the application refuses a direct
  preferred-projection cutover while dual writing is disabled.
- Approximately 200 representative `/api/card/[id]/extras` and
  `/api/card/[id]/history` responses will become golden fixtures.
- Legacy writes stop only after database reconciliation and golden-response
  comparisons pass.
- Legacy tables remain available for a defined rollback window.

## Operational consequences

- Sync state is scoped by game, provider, job, and scope instead of a global key.
- eBay, JustTCG, and Japanese market observations share one fact structure but
  retain provider, price type, currency, and raw provenance.
- Numeric grade is accompanied by raw grade label and canonical grade tier so
  Black Label, Pristine, and ordinary 10s remain distinct.
- Inventory, PSA submissions, and Owl Lens centering history carry printing or
  variant identity through the transition.
- Multi-face card storage is deferred until the Magic adapter needs it.

## Rollout

The initial rollout will use the existing Owl Market Supabase project rather
than a separately billed staging project. This is an operational choice only:
the migration remains additive, legacy reads remain selected, dual writing is
deployed disabled, and a restorable backup plus a remote migration-history dry
run are mandatory before the first database write. See
`docs/runbooks/multitcg-same-project-rollout.md`.

1. Apply integrity, scoped-sync, and access-hardening migration.
2. Apply additive catalog/pricing foundation migration.
3. Deploy code that understands both legacy and new structures with dual writing
   disabled.
4. Backfill and reconcile One Piece.
5. Enable dual writing, run golden comparisons, then switch reads.
6. Onboard future games through game-specific adapters.
