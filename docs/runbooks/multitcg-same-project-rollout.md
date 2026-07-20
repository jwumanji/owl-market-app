# Multi-TCG same-project rollout

## Decision

Owl Market will introduce the additive multi-TCG foundation in the existing
Supabase project, `kiquytaevufssveqmqix`, instead of maintaining a separately
billed staging project.

This changes the operational rollout, not the data architecture. Existing One
Piece tables remain the compatibility model while the new identity and pricing
tables are added beside them. Production reads stay on the legacy path until a
later, independently approved cutover.

No database write is authorized by this document. A restorable backup and the
remote migration-history gate below are required first.

## Verified baseline — 2026-07-19

- GET-only production preflight: **PASS**.
- One Piece legacy cards to bootstrap: **5,053**.
- Provisional commercial variants to create: **5,053**.
- Existing eBay sales entering unresolved quarantine: **1,755**.
- Inventory rows to carry forward: **101**.
- PSA submission items to carry forward: **127**.
- Owl Lens centering measurements to carry forward: **13**.
- Legacy sync cursors to scope: **4**.
- One Piece TR taxonomy rows: **1**.
- Golden API baseline: **200 cards / 400 responses**, immediate comparison
  passed with zero differences.
- Complete PostgreSQL 16 rehearsal passed through the multi-TCG foundation and
  both later Treasure Rare migrations.
- Public rarity, character, and card-character-link reads were confirmed to use
  the server-side service client before anonymous grants are removed.
- JustTCG True Market remains disabled.

The saved preflight evidence is
`docs/reports/multitcg-production-preflight.md`.

## Fixed safety settings

Keep these explicit until every cutover gate passes:

```text
MULTITCG_DUAL_WRITE_ENABLED=0
MULTITCG_READ_MODE=legacy
```

Do not enable `preferred_projection`, delete legacy tables, normalize JustTCG
v2 beta fields, or ingest True Market during this rollout.

## Gate 1 — Claude/code review

Review the migration SQL, rollout flags, audit scripts, and this runbook as one
change. In particular, verify:

1. The five new migrations are additive and safe for the live schema.
2. `cards.updated_at` is added in `20260719090000` before the later Treasure
   Rare migrations use it.
3. The two summary tables do not require an `id` column.
4. One Piece has exactly one `TR` taxonomy row before the TR reference trigger
   is installed.
5. Anonymous grant removal cannot break public pages because those reads use a
   server-side service client.
6. Existing eBay sales remain quarantined and cannot enter aggregates until
   each resolves to exactly one commercial variant.
7. The feature flags cannot select new reads while dual writing is disabled.
8. Failure and rollback procedures below are adequate for a single live
   project.

Code-level evidence for items 2, 3, 4, and 7 is recorded in
`docs/reports/multitcg-gate1-code-review.md`. Before the change window, confirm
the two behavioral escape hatches parse and are available to the operator:

- `supabase/escape-hatches/20260719_drop_one_piece_tr_trigger.sql`
- `supabase/escape-hatches/20260719_restore_anon_catalog_access.sql`

Any blocking review finding returns the plan to local development. It does not
authorize experimenting against the live database.

## Gate 2 — backup and remote migration history

1. Take a fresh `pg_dump` in custom format inside the change window. This is
   mandatory even if a platform backup exists. Record its timestamp, absolute
   storage location, SHA-256 hash, database host/project reference, and the
   tested restore method (`pg_restore`). Do not rely on PITR availability.
2. Pause JustTCG, eBay, JP-price, and catalog sync jobs for the migration
   window so the bootstrap sees a stable legacy catalog.
3. Link the CLI only after visually confirming project reference
   `kiquytaevufssveqmqix`.
4. Inspect local versus remote migration history:

   ```powershell
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

5. Do not use `--include-all`. Resolve migration history using these explicit
   branches:

   - If `20260712143000_nullable_price_changes.sql` is present remotely, verify
     the dry run excludes it and proceed to review the remaining list.
   - If it is absent remotely, inspect whether its schema change is absent or
     was applied outside migration history. Explicitly approve it for this
     release, or stop the entire release. If the schema already matches, repair
     history only after recording evidence; never mark an unapplied change as
     applied.
   - If remote history contains migrations missing locally, stop. Fetch and
     reconcile the missing migrations and use `supabase migration repair` only
     as a separately reviewed history correction. Re-run preflight,
     `migration list`, and `db push --dry-run` from the beginning.

6. Do not run a real push unless the final dry run contains only the explicitly
   approved files in their expected order.

7. Before Gate 3, enumerate the exact TR migration targets through the read-only
   GET path and save the expected-diff allowlist:

   ```powershell
   npm run golden:gate4-expected-diffs -- --expected-project-ref=kiquytaevufssveqmqix --output=tests/fixtures/golden/gate4-expected-diffs.json
   ```

   Review every row. This file must be captured before the TR migrations run.
   Then refresh the 200-card baseline with all allowlisted route IDs forced into
   the selection:

   ```powershell
   npm run golden:cards -- --mode=capture --profile=exact --base-url=https://owl-market-app.vercel.app --limit=200 --expected-diffs=tests/fixtures/golden/gate4-expected-diffs.json --fixture=tests/fixtures/golden/card-api-one-piece.json
   ```

   Comparison aborts if any allowlisted route ID is absent from the fixture.

This gate requires the Supabase database password. The current ignored
`.env.local` has API keys but does not contain that password.

## Gate 3 — apply the additive foundation

Use a short maintenance/change window. Apply only the migration list approved
by the dry run, in timestamp order. The multi-TCG portion is:

1. `20260719090000_multitcg_integrity_and_sync_scope.sql`
2. `20260719093000_multitcg_catalog_foundation.sql`
3. `20260719100000_multitcg_pricing_foundation.sql`
4. `20260719113000_one_piece_treasure_rare_integrity.sql`
5. `20260719114500_one_piece_tr_rarity_reference.sql`

Each file is transactional. If one fails, stop; do not retry blindly or edit
the live database manually. Capture the error and compare the live schema with
the disposable rehearsal.

## Gate 4 — verify legacy behavior immediately

Before resuming sync jobs:

1. Run the read-only reconciliation:

   ```powershell
   npm run audit:multitcg-reconcile -- --expected-project-ref=kiquytaevufssveqmqix --report=docs/reports/multitcg-production-reconciliation.md
   ```

2. Require `Foundation: PASS`. `Read cutover: BLOCKED` is expected because
   shadow observations and exact eBay matching are not complete.
3. Compare the existing production URL against the 200-card golden fixture
   with the strict exact comparator and the reviewed TR allowlist:

   ```powershell
   npm run golden:cards -- --mode=compare --profile=exact --base-url=https://owl-market-app.vercel.app --expected-diffs=tests/fixtures/golden/gate4-expected-diffs.json --report=docs/reports/card-api-gate4-comparison.md
   ```

   A changed response for an allowlisted card is reported as `EXPECTED` and is
   not a stop condition. Any changed response for a non-allowlisted card is
   `UNEXPECTED` and stops the rollout. Exact comparison remains in force for
   every field; the allowlist changes classification only.
4. Smoke-test markets, card details, rarity and character indexes, inventory,
   PSA submissions, and Owl Lens.
5. Confirm `price_type=true_market` remains zero.

If a legacy page changes, keep sync jobs paused, keep reads legacy, and apply a
forward compatibility fix. Do not drop the newly created tables as an
emergency response.

## Gate 5 — deploy dormant dual-write code

Deploy the application with dual writing explicitly off and legacy reads
explicitly selected. Repeat the golden comparison and smoke tests, then resume
legacy sync jobs.

After the first complete post-resume sync cycle, re-run
`audit:multitcg-reconcile` and repeat the TR-card and public-page smoke tests.
This check is mandatory because TR-trigger write behavior is not exercised by
the pre-resume golden comparison.

At this point the new schema exists but the live customer-facing behavior and
legacy write path remain unchanged.

## Gate 6 — prove shadow writes

In a separate change window:

1. Immediately before changing the flag, capture a new 200-card Gate 6 fixture
   using the existing route IDs:

   ```powershell
   npm run golden:cards -- --mode=capture --base-url=https://owl-market-app.vercel.app --limit=200 --ids-file=tests/fixtures/golden/card-api-one-piece.json --fixture=tests/fixtures/golden/card-api-one-piece-gate6.json
   ```

2. Set `MULTITCG_DUAL_WRITE_ENABLED=1` while keeping
   `MULTITCG_READ_MODE=legacy`.
3. Run one explicitly selected JustTCG v1 set, not the full catalog.
4. Re-run reconciliation, then compare the fresh fixture with the
   price-insensitive structural profile:

   ```powershell
   npm run golden:cards -- --mode=compare --profile=shape_identity --base-url=https://owl-market-app.vercel.app --fixture=tests/fixtures/golden/card-api-one-piece-gate6.json --report=docs/reports/card-api-gate6-comparison.md
   ```

   Gates 4 and 5 must continue using `--profile=exact`. The Gate 6 profile
   ignores price-bearing values and added same-shape history rows, but still
   compares stable eBay/JP identities, response keys, and non-price behavior.
5. Verify provider-product/SKU uniqueness, observation idempotency, exact latest
   facts, preferred-price selection, and zero True Market observations.
6. Expand shadow coverage gradually only after the selected-set check passes.

The current implementation proves JustTCG v1 shadow writing. eBay exact-variant
resolution and JP/eBay canonical observation backfills remain later work and
continue to block read cutover.

## Rollback and stop conditions

- Fast application rollback: set `MULTITCG_DUAL_WRITE_ENABLED=0` and keep
  `MULTITCG_READ_MODE=legacy`.
- Database rollback: leave additive tables in place and stop writing to them.
  Do not down-migrate during incident response.
- TR-trigger behavioral escape hatch:
  `supabase/escape-hatches/20260719_drop_one_piece_tr_trigger.sql`.
- Anonymous-access behavioral escape hatch:
  `supabase/escape-hatches/20260719_restore_anon_catalog_access.sql`.
  Use either script only for the matching observed regression, after confirming
  the live project reference and preserving error evidence.
- The anonymous-access escape hatch restores schema usage and public catalog
  reads only. `card_external_ids`, `set_external_ids`, and
  `price_provider_mappings` deliberately remain service-only. A regression in
  provider metadata requires a server-side fix, not broader anonymous grants.
- Restore from backup only for confirmed legacy-data corruption that cannot be
  repaired forward.
- Stop immediately for a wrong project reference, unexpected dry-run migration,
  failed foundation reconciliation, an `UNEXPECTED` golden response, True
  Market row, or a public-page regression. A Gate 4 `EXPECTED` response change
  is evidence to review, not a stop condition.

## Non-blocking follow-ups

- Japanese-region printings bootstrap with `set_release_id = null`; reconcile
  them to explicit JP set releases during the regional-catalog phase.
- Price-observation partition retention must clear or repoint stale
  `latest_price_facts` before dropping an old partition, because latest facts
  carry a composite foreign key to the observation row and timestamp.
- The One Piece TR trigger assigns the TR rarity reference on TR writes, but it
  does not clear `rarity_id` when a row changes from TR to a non-TR rarity.
  Treat reverse reclassification as a separate reconciliation path.

## Later read cutover

Read cutover is a separate decision. It requires complete preferred-price
coverage, all eBay sales resolved or explicitly rejected, canonical JP/eBay
observation backfills, stable dual writing, and a zero-difference golden API
comparison. Legacy writes and tables remain available for a defined rollback
window after that cutover.
