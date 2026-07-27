# Set-value v2 (`entity_type='set_baseline'`, metric_version=2) — STOPPED at GATE 1

**Date:** 2026-07-27/28 · **Branch:** `feat/moon-terminal` · **Status: STOPPED COMPLETELY — nothing built, nothing written.**
**Outcome: the livability probe failed.** `market_index_snapshots` rejects any row with
`entity_type='set_baseline'` via the CHECK constraint
**`market_index_snapshots_entity_reference_check`** — an effective entity_type whitelist.
Per the approved brief, a gate-1 insert failure stops the entire change set: no writer
route, no cron entry, no gate 2, no backfill, no consumer switch, and **the VALUE RATIO
chip stays hidden** (`RATIO_RANKING_ENABLED` remains `false`). The DDL conversation goes
back to Justin. The database is byte-untouched (verification below).

---

## 1 · What was probed, exactly

Two probe shapes were attempted (PostgREST POST, service role), both clearly marked
(`entity_key='__v2_probe__'`, `snapshot_date='1970-01-01'`) and both slated for immediate
deletion on success. Column values were taken from a live stored v1 row introspected
first (ST13 @ 2026-07-26), per brief.

**Probe A — minimal honest values, no entity reference:**

```json
{
  "game_id": "42f667ef-5c6d-4971-9442-bf4086ca7d95",
  "entity_type": "set_baseline",
  "entity_key": "__v2_probe__",
  "character_id": null, "set_id": null, "rarity_id": null,
  "entity_slug": "__v2_probe__", "entity_code": "__v2_probe__",
  "entity_name": "set_baseline v2 livability probe",
  "snapshot_date": "1970-01-01",
  "index_value": 0, "card_count": 0, "priced_count": 0,
  "chg_7d": null, "chg_30d": null,
  "price_basis": "tcg_market", "metric_version": 2,
  "captured_at": "<run time>", "region": "en"
}
```

Result: **400**, `23514` —
`new row for relation "market_index_snapshots" violates check constraint "market_index_snapshots_entity_reference_check"`.

**Probe B — identical, but `set_id` = a real set** (`7159a6b0-…` = ST13), i.e. the exact
shape every actual v2 row would have had (the planned writer resolves `set_id` via `sets`
by code and skips codes that don't resolve; even the v1 ST29/ST30 zero rows carry real
`set_id` values — verified live, §3).

Result: **400**, `23514` — the **same** constraint.

## 2 · What the two failures together prove

The constraint name says it checks entity *references*, and probe B satisfied every
plausible reference rule for a set-scoped row (exactly one of
`character_id`/`set_id`/`rarity_id` non-null, and it's `set_id`, pointing at a real set).
Since B failed identically to A, the predicate must dispatch on **`entity_type` itself**
and reject values outside its known list — i.e. it is a de-facto whitelist of
`{'set','character','rarity'}` (exactly the three types that exist in the live table:
1,756 rows = 360 set / 1,370 character / 26 rarity, and exactly the three INSERTs
`capture_market_index_snapshots` performs).

There is no third honest shape to try: filling `character_id` or `rarity_id` on a
set-level metric row would be a workaround, which the brief forbids. PostgREST cannot
read constraint bodies (CLAUDE.md §3), so the exact predicate needs SQL run by Justin.

## 3 · Database state after the probes — byte-clean, verified live

Both inserts were rejected atomically (400 → zero rows), and a post-run count sweep
confirmed:

| check | result |
| --- | --- |
| rows with `entity_key='__v2_probe__'` | **0** |
| rows with `entity_type='set_baseline'` | **0** |
| `entity_type='set'` total | 360 (254 backfilled + 53 @07-23 + 53 @07-26 — unchanged) |
| `entity_type='character'` / `'rarity'` | 1,370 / 26 |
| table total | 1,756 |

Incidental facts recorded for the retry:

- v1 **zero rows (ST29/ST30) carry real `set_id` values** — so the planned "mirror empty
  sets as zero rows" semantics is compatible with the reference check once the
  entity_type is admitted.
- A full stored v1 row (ST13 @07-26) was introspected; column list and value shapes match
  what `scripts/backfill-set-value-snapshots.mjs` writes — no surprises beyond the CHECK.

## 4 · The DDL conversation (for Justin — NOT applied, nothing here has run)

First, read the actual constraint body in the SQL editor:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.market_index_snapshots'::regclass
  and contype = 'c';
```

The fix the v2 design needs is one amendment: re-create
`market_index_snapshots_entity_reference_check` with a `'set_baseline'` branch **identical
to the existing `'set'` branch** (set-referenced, character/rarity null), leaving every
other branch byte-identical to the introspected definition. Sketch — **the real branches
must be copied from the `pg_get_constraintdef` output, not from this sketch**:

```sql
begin;
alter table public.market_index_snapshots
  drop constraint market_index_snapshots_entity_reference_check;
alter table public.market_index_snapshots
  add constraint market_index_snapshots_entity_reference_check
  check ( /* existing predicate, with the set branch's rule also
             admitting entity_type = 'set_baseline' */ );
commit;
```

Notes for that conversation:

- Widening a CHECK does **not** touch the natural-key unique constraint
  `(game_id, entity_type, entity_key, snapshot_date)` — the live capture function's
  upsert arbiter is unaffected, which was the design's hard requirement.
- Adding a CHECK branch is validated against existing rows; all existing rows are
  `set`/`character`/`rarity` and keep passing, so the migration is non-blocking.
- Per repo rules this goes through the hand-apply path (write the migration file, hand
  over the SQL, wait for confirmation — CLAUDE.md §2). It should also insert its
  `schema_migrations` row only if hand-applied, per the §2 convention.

## 5 · What did NOT happen because of this stop

Everything downstream of gate 1 was specified and is ready to build, but none of it
exists yet — deliberately:

- **No** `src/app/api/sync/set-baseline/route.ts` writer, **no**
  `one_piece.internal.set_baseline` cron entry (config/game-sync-jobs.json and
  vercel.json untouched).
- **No** gate 2 (price_history-vs-price_stats baseline comparison) — it validates the
  backfill, which cannot proceed without a writable entity_type.
- **No** `scripts/backfill-set-baseline.mjs`, no v2 rows for any of the 7 stored dates.
- **No** consumer changes: `load-sealed.ts`, `SealedTrackerClient.tsx`,
  `load-sealed-detail.ts`, `SealedDetailClient.tsx` are untouched;
  `RATIO_RANKING_ENABLED` is still `false`; the VALUE RATIO chip remains hidden on every
  game; SET VALUE surfaces remain on the v1 series exactly as shipped.

## 6 · Contradiction vs the brief, and the resume path

The brief judged an entity_type CHECK "likely" and it was right — but note the constraint
that fired is a *reference* check that doubles as the whitelist, not a standalone
`entity_type in (…)` check; the fix must therefore preserve the per-type reference rules,
which is why §4 insists on copying the introspected predicate rather than a fresh
`in (…)` list.

Resume path once the DDL lands: re-run the probe (§1 shapes A is expected to keep
failing on the reference rule — that is correct behavior; **B must pass and delete
cleanly**), then execute the brief unchanged: writer → gate 2 → backfill (7 dates,
anchored to the writer's fresh point) → consumer switch + chip revival → cron entry →
verification suite.
