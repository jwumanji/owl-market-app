# Multi-TCG Gate 1 SQL and flag review

Date: 2026-07-19

Status: **PASS locally; required Gate 1 amendments implemented**

Verbatim SQL review bundle:
`docs/reports/multitcg-gate1-sql-bundle.md`. An automated fenced-block
comparison against the five source migrations passed **5/5** after newline
normalization.

## Requested code-level checks

### `cards.updated_at` ordering

`20260719090000_multitcg_integrity_and_sync_scope.sql` adds
`cards.updated_at` with `ADD COLUMN IF NOT EXISTS`. Both Treasure Rare
migrations run later, at `20260719113000` and `20260719114500`. A disposable
PostgreSQL rehearsal starts from a legacy `cards` table without this column and
passes the complete sequence.

### Summary tables do not require `id`

The integrity migration constrains `public_rarity_summaries` by
`(rarity_id, game_id)` and `public_character_summaries` by
`(character_id, game_id)`. Neither migration nor the corrected preflight audit
selects or requires an `id` column. The disposable fixture mirrors production's
no-`id` shape for both tables.

### One Piece TR taxonomy invariant

The GET-only preflight found exactly one One Piece `TR` rarity row. The
`20260719114500` migration now repeats that invariant inside its own transaction
and aborts unless the count is exactly one before creating the reference
trigger.

### Rollout flag guard

`getMultiTcgRolloutConfig()` now validates before returning. Any non-legacy
read mode, including `shadow_compare` and `preferred_projection`, throws unless
`MULTITCG_DUAL_WRITE_ENABLED=1`. This prevents a future reader from forgetting
to call a separate assertion. Focused tests cover both blocked modes.

## Related review evidence

- All catalog tables losing anonymous access are read by public pages through
  `createServiceClient()` or `createCachedServiceClient()`. Admin helpers that
  accept a generic client run in authenticated admin flows, not anonymous
  public pages.
- Every legacy eBay sale is inserted into `ebay_sale_variant_matches` with
  `match_status='pending'` and `match_method='legacy_card_only'`. The migration
  inserts no eBay `price_observations`; unresolved sales therefore cannot enter
  the canonical aggregate path.
- Ready-to-run behavioral escape hatches now exist for the TR trigger and the
  anonymous catalog grants under `supabase/escape-hatches/`.
- Gate 6 uses a freshly captured fixture plus `shape_identity` comparison so an
  expected legacy price write cannot create a false regression. Gates 4 and 5
  retain exact comparison.

## Disposable anonymous REST evidence

Tested on 2026-07-19 with PostgreSQL 16 and PostgREST 14.5. The disposable
database received the representative legacy fixture followed by
`20260719090000_multitcg_integrity_and_sync_scope.sql`. Schema-level denial was
then modeled with `REVOKE USAGE ON SCHEMA public FROM public, anon`, matching
the production access condition under review.

### Before restore

Anonymous `GET /games?select=slug` returned:

```text
HTTP/1.1 401 Unauthorized
{"code":"42501","message":"permission denied for schema public"}
```

### Trimmed table grants without schema usage

After removing provider-identity grants and running the table-grant-only form
of the restore script, the same request still returned:

```text
HTTP/1.1 401 Unauthorized
{"code":"42501","message":"permission denied for schema public"}
```

This demonstrated that table grants alone were inert. The escape script now
includes the narrowly required `GRANT USAGE ON SCHEMA public TO anon`.

### Updated restore script

After applying the final script:

```text
GET /games?select=slug                         -> 200 [{"slug":"one_piece"}]
GET /game_rarities?select=code&limit=1         -> 200 [{"code":"R"}]
GET /card_character_links?select=card_id&limit=1 -> 200 [one fixture row]
```

Provider identity remained service-only:

```text
GET /card_external_ids?select=id&limit=1       -> 401 permission denied for table card_external_ids
GET /set_external_ids?select=id&limit=1        -> 401 permission denied for table set_external_ids
GET /price_provider_mappings?select=id&limit=1 -> 401 permission denied for table price_provider_mappings
```

The disposable containers and isolated network were removed after the test.

## Gate 4 expected-diff allowlist

The two Treasure Rare migrations were enumerated against the pinned production
project through service-authenticated GET requests only. The enumerator models
the SQL statements in timestamp order so rows repaired by `20260719113000`
also participate in the later `20260719114500` TR-reference predicate.

Saved fixture: `tests/fixtures/golden/gate4-expected-diffs.json`.

```text
Unique allowlisted card rows:                         11
20260719113000.corrected_cards:                        2
20260719113000.variant_label_backfill:                 0
20260719114500.tr_reference_reconcile:                11
```

The 200-card pre-migration baseline was refreshed with all 11 route IDs forced
into the selection. An immediate `--profile=exact --expected-diffs=...`
comparison passed with 0 expected and 0 unexpected differences. Comparator
execution aborts if an allowlisted route ID is absent from the golden fixture.

## Provider bootstrap guard

The amended GET-only production preflight passed and found these distinct
`lower(card_external_ids.provider)` codes:

```text
justtcg
optcgapi
riftcodex
tcgplayer
```

All four exist in the seeded `data_providers` codes. The pricing migration now
checks the complete legacy table before `provider_products` bootstrap and
raises an in-transaction exception listing every unmapped code.

The full disposable migration rehearsal used all four real provider codes and
passed. It created four provider products for four legacy external IDs, with no
silent skip. A negative control added `unknown_provider` and replayed the
pricing migration; the transaction aborted before bootstrap with:

```text
ERROR: Unmapped card_external_ids provider codes: 'unknown_provider'
```

The post-migration reconciliation audit mirrors the same all-games assertion.
The five-file SQL review bundle was regenerated after this amendment and again
passed verbatim source comparison 5/5.

## Final local validation

- Multi-TCG tests: **11/11 passed**, including migration-order enumeration,
  expected-diff classification, and verbatim SQL-bundle verification.
- TypeScript: **passed**.
- Lint: **passed with no warnings or errors**.
- Production build: **passed**.
- Git whitespace/error check: **passed**.
