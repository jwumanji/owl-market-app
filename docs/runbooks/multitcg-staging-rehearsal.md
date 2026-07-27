# Multi-TCG staging rehearsal — superseded

> **SUPERSEDED — DO NOT EXECUTE WITHOUT RE-APPROVAL.** Owl Market currently
> intends to use the existing Supabase project under the controls in
> `multitcg-same-project-rollout.md` to avoid a second project subscription.

## Current gate

No Supabase project is currently linked to this repository, and no listed
project is explicitly identified as Owl Market staging. Do not apply these
migrations until a dedicated staging project or sanitized clone is designated.

Production remains on legacy reads and legacy writes. JustTCG True Market stays
disabled throughout this rehearsal.

## Required access

- A staging Supabase project reference.
- A staging database password for the CLI migration step.
- Staging `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values.
- A staging application URL deployed from `codex/multitcg-foundation`.
- A production or pre-migration application URL for golden fixture capture.

Never place credentials in a committed file. Supply them through the shell,
deployment environment, or an ignored `.env.local`.

## 1. Preflight the source snapshot

Run the read-only legacy audit against the database that will be cloned:

```powershell
$env:SUPABASE_EXPECTED_PROJECT_REF = "the-explicit-project-ref"
npm run audit:multitcg-preflight -- --report=multitcg-preflight-report.md
```

The report must pass before migration. It validates all required legacy tables
and columns, same-game relationships, scoped identities, migration row counts,
and the expected eBay quarantine size.

## 2. Capture legacy API fixtures

Capture approximately 200 representative, high-value One Piece cards from the
pre-migration application:

```powershell
npm run golden:cards -- --mode=capture --base-url=https://legacy.example.com --limit=200
```

Automatic selection uses the public `/api/markets` results plus a stratified
sample from the highest-value sets. A curated JSON array of card route IDs
(`cards.card_image_id`) can be supplied with
`--ids-file=path/to/card-ids.json`.

## 3. Prepare staging

1. Create or designate the staging Supabase project.
2. Restore a recent sanitized production snapshot.
3. Confirm the project reference twice before linking or pushing.
4. Link the CLI to staging only.
5. Apply all five approved `20260719*` migrations in timestamp order:
   `20260719090000`, `20260719093000`, `20260719100000`, `20260719113000`, and
   `20260719114500`. Never rehearse only the first three.

Do not set `MULTITCG_DUAL_WRITE_ENABLED=1` yet.

## 4. Reconcile the additive foundation

Run the read-only post-migration audit:

```powershell
$env:SUPABASE_EXPECTED_PROJECT_REF = "the-staging-project-ref"
npm run audit:multitcg-reconcile -- --report=multitcg-reconciliation-report.md
```

At this point `Foundation: PASS` is required. `Read cutover: BLOCKED` is expected
because dual-write coverage and exact eBay matching are not complete yet.

## 5. Verify legacy responses on staging

Deploy the branch with:

```text
MULTITCG_DUAL_WRITE_ENABLED=0
MULTITCG_READ_MODE=legacy
```

Compare staging API output to the captured fixtures:

```powershell
npm run golden:cards -- --mode=compare --base-url=https://staging.example.com
```

The comparison must pass before enabling shadow writes.

## 6. Prove dual writing

Set `MULTITCG_DUAL_WRITE_ENABLED=1` in staging only, keep
`MULTITCG_READ_MODE=legacy`, and run one explicitly selected JustTCG set. Then:

1. Re-run the reconciliation audit.
2. Confirm provider products and SKUs have no identity collisions.
3. Confirm observations replay idempotently.
4. Confirm `price_type=true_market` remains zero.
5. Capture a fresh pre-sync fixture and re-run the golden API comparison with
   `--profile=shape_identity`; expected legacy price writes make an exact
   post-sync comparison unsuitable.

Do not enable the preferred projection until representative card coverage is
complete and all golden comparisons pass.

## Rollback

Set `MULTITCG_DUAL_WRITE_ENABLED=0` and leave `MULTITCG_READ_MODE=legacy`.
Because the migration is additive, the legacy pages and tables remain intact.
Do not delete the new tables during the evidence and rollback window.
