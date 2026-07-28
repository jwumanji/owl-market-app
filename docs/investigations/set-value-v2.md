# Set-value v2 (`entity_type='set_baseline'`, metric_version=2) — EXECUTED 2026-07-28

**Branch:** `feat/moon-terminal` · **Status:** writer LIVE (53 rows @ 2026-07-27), VALUE
RATIO chip REVIVED on the v2 series, cron scheduled — **backfill STOPPED at GATE 2**
(zero historical rows written; the series is go-forward only).

Chronology: the first attempt (2026-07-27/28, §7 below) stopped completely at Gate 1 —
both CHECK constraints on `market_index_snapshots` whitelisted the existing three
entity_types. Justin applied `supabase/migrations/20260728100000_market_index_set_baseline_type.sql`
(HEAD 597ca30), which amends both constraints; this run then re-probed and executed the
brief. **Read that migration's header before consuming this table — two set series now
coexist and mean different populations.**

| gate / step | outcome |
| --- | --- |
| Gate 1 (livability probe, re-run post-migration) | **PASSED** — probe row inserted (201) and deleted, zero residue |
| Writer `/api/sync/set-baseline` | **LIVE** — 53 rows @ 2026-07-27, index total $200,590.47 |
| Gate 2 (history-vs-stats baseline agreement) | **FAILED** — median 0.00% (≤1% ✓), worst **+1808%** (ST23, ≤3% ✗) |
| Backfill of the 7 stored dates | **STOPPED per brief** — 0 rows written; `--write` refused (exit 1) |
| Chip revival + consumer switch | **DONE** — all ratio surfaces on v2, SET VALUE surfaces on v1 |
| Cron `one_piece.internal.set_baseline` | `50 23 * * 0` — 10 min after pg_cron's v1 capture |

---

## 1 · Gate 1 — livability probe, PASSED (2026-07-28, post-migration)

Shape B from §7 (honest values, real `set_id` — the exact shape every production v2 row
has): INSERT returned 201, DELETE removed exactly 1 row, `entity_type='set_baseline'`
count back to 0, no `__v2_probe__` residue. The migration's own in-editor probe was NOT
taken on faith; this was verified live from this repo's client path.

Standing caveat from the constraint design: `market_index_snapshots_entity_reference_check`
requires the `set_baseline` branch to be set-referenced — **every v2 row must carry a
resolved non-null `set_id`** (writer and backfill both resolve via `sets` by code and
skip codes that do not resolve). Verified live after the writer ran: 0 v2 rows with null
`set_id`.

## 2 · The writer — `/api/sync/set-baseline?game=one_piece`

`src/app/api/sync/set-baseline/route.ts`. CRON_SECRET auth (Bearer or `?secret=`),
`?game=` required and one_piece-only (the classifier is a One Piece population rule).
Population: `cards` on `printed_set_code` + `region='en'`, deduped on `card_image_id`
(max-priced kept), classified by **the shared module**
`src/lib/games/one-piece/booster-baseline.ts` (imported, never re-implemented). Price
basis `price_stats.tcg_market > 0` — identical semantics to Box EV. One row per `sets`
row of the game (53), zero rows for baseline-empty sets (v1 ST29/ST30 parity).
`card_count`/`priced_count` are **baseline-population counts** — intentionally smaller
than v1's full-population counts. `chg_7d`/`chg_30d` are index-over-index vs the latest
prior v2 row at or before −7/−30 days, null when no prior v2 point exists — **not** the
v1 columns' "current provider card stats" semantics; documented in the route header.
Upsert ON CONFLICT (natural key) DO UPDATE — same-day re-runs refresh.

First live run (local dev server, throwaway CRON_SECRET env var, never written to file):

```json
{"game":"one_piece","entityType":"set_baseline","metricVersion":2,
 "snapshotDate":"2026-07-27","capturedAt":"2026-07-27T19:27:55.137Z",
 "setsInCatalog":53,"rowsUpserted":53,"rowsForDateAfter":53,"zeroRowSets":4,
 "dedupedCards":4678,"nullImageIds":0,"baselineCards":3402,"excludedCards":1276,
 "indexTotal":200590.47,"skippedCodes":["N"],"durationMs":2978}
```

Zero-row sets: ST29/ST30 (genuinely empty), P (100% promo — baseline honestly $0),
OP16 (catalog-deleted at run time; the writer records what the catalog shows). The "N"
re-parse artifact does not resolve in `sets` and is skipped by construction.

Scheduled `50 23 * * 0` (`one_piece.internal.set_baseline` in
`config/game-sync-jobs.json`, vercel.json regenerated via `npm run
sync-schedule:generate`; `audit:sync-schedule` PASS, 10 jobs / 13 entries). First
non-null `chg_7d` lands 2026-08-09 (needs a prior point ≥7d back); `chg_30d` ~2026-08-30.

## 3 · Gate 2 — FAILED, and it falsifies the audit's §7 expectation

Method: reconstruct today's per-set baseline sums from `price_history` (as-of
carry-forward at the writer's exact `captured_at`, 91,520 rows fetched) and compare to
the writer's `price_stats` values. Gate: median |Δ| ≤ 1%, worst |Δ| ≤ 3%.

**Result: 49 comparable sets · median |Δ| 0.00% · worst |Δ| +1808.36% (ST23).** 44 of 49
sets sit within ±0.05%; the breaches of the worst-gate are three, all chased per-card:

| set | writer (stats) | recon (history) | Δ | divergent card (all INSIDE the baseline) |
| --- | ---: | ---: | ---: | --- |
| ST23 | 18.07 | 344.84 | **+1808%** | `ST23-004` Monkey.D.Luffy, **base L** — stats $4.01 vs history $330.78, recorded **20 seconds apart** in the same sync window |
| OP10 | 1,641.60 | 1,806.35 | +10.0% | `OP10-119_r1` Trafalgar Law SEC reprint — stats $4.65 vs history $168.02, same minute |
| EB01 | 5,545.37 | 5,937.99 | +7.1% | `EB01-001_p2` Kouzuki Oden SPR — stats $301.14 **stale since 2026-04-07** vs history $693.76 |
| (sub-gate) OP06 | 13,357.13 | 13,670.87 | +2.3% | `OP06-007_p6` Shanks SP Δ$217 · `OP06-047` SP Δ$84 · `OP06-060_r1` Δ$14 (stale stats) |
| (sub-gate) OP08 | 8,736.24 | 8,843.62 | +1.2% | `OP08-023_r1` Carrot SR reprint — stats $1.22 vs history $108.61, same minute |

**What this falsifies:** the population audit (§2 there) predicted the
history-vs-stats divergent cards were "exactly the excluded promos", so a baseline-only
recon would track stats tightly. Wrong — the `price_history`-vs-`price_stats` **variant
disagreement defect (set-value-backfill.md §3/§4) also hits cards legitimately inside
the booster baseline**: `_r1` reprints, SP/SPR parallels, and even one plain base-L card
(ST23-004). The two same-minute cases (stats and history writers disagreeing about the
same card within seconds) prove it is variant selection, not staleness; EB01-001_p2 is
the staleness flavor. Backfilled v2 history built on `price_history` would run hot by
those exact amounts and then step down at the go-forward boundary — the fabricated-cliff
failure mode this gate exists to catch.

**Consequence (per the approved brief):** the backfill is STOPPED — `--write` was run
once to prove the refusal (exit 1 at the gate, zero writes). The writer and the chip
revival proceed on go-forward data only.

## 4 · Backfill — before/after per date (live-verified)

| snapshot_date | before | after | written |
| --- | ---: | ---: | ---: |
| 2026-06-21 | 0 | 0 | 0 |
| 2026-06-28 | 0 | 0 | 0 |
| 2026-07-05 | 0 | 0 | 0 |
| 2026-07-12 | 0 | 0 | 0 |
| 2026-07-19 | 0 | 0 | 0 |
| 2026-07-23 | 0 | 0 | 0 |
| 2026-07-26 | 0 | 0 | 0 |
| 2026-07-27 (writer) | 0 | 53 | 53 (writer, not backfill) |
| **total `set_baseline`** | 0 | **53** | — |

No anchors were applied (anchor factors computed ≈1.000000 on the agreeing sets, but
gate 2 gates the whole write). v1 `entity_type='set'` rows verified byte-untouched: 360
total, 53 @ 07-23, 53 @ 07-26. All 53 v2 rows carry `metric_version=2`, non-null
`set_id`, null `chg_*`.

`scripts/backfill-set-baseline.mjs` stays in the tree: dry-run default, `--write` flag,
gate 2 + staleness gate (10d) + ST29/ST30-zeros + catalog-deleted skip (OP16) + ON
CONFLICT DO NOTHING are all implemented and re-runnable if the pipeline defect is ever
fixed. It imports the real classifier module via Node type-stripping (the
audit-booster-baseline.mjs mechanism) — never a copy.

## 5 · Consumer switch + labels (the revival)

`RATIO_RANKING_ENABLED = true` in `SealedTrackerClient.tsx`. Series routing:

| surface | series |
| --- | --- |
| VALUE RATIO ranking chip, ratio grid/table/cards modes, RATIO + RATIO Δ table columns, AVG VALUE RATIO rail, detail chart ratio overlay, detail facts-row ratio, detail table RATIO column, CSV `value_ratio` | **v2 `set_baseline`** |
| SET VALUE chip/mode, SET VALUE table column, hero SET VALUE fact, top-10 strip SET VALUE, SET VALUE chart overlay, CSV `set_value` | **v1 `set`** (unchanged) |

Labels chosen so the two series cannot be confused (C1.5 tone, mono uppercase):
ratio-mode metric block **BOX / BASELINE / RATIO** (BASELINE row, never SET); grid ratio
sub-cells show box · baseline; legend **CELLS = BASELINE VALUE ÷ BOX PRICE**; cards-view
ratio stat **BASELINE VALUE**; detail facts row **BASELINE RATIO**; detail overlay
button + legend **BASELINE RATIO** (tooltip `B-RATIO`); detail table gains a **BASELINE**
column beside RATIO (so RATIO = BASELINE ÷ BOX is verifiable per row) with foot note
`RATIO = BASELINE ÷ BOX`; CSV header now
`date,box_price,change_pct,set_value,baseline_value,value_ratio`. Dashboard footnote
states both definitions and both last-snapshot dates.

Hide conditions are decoupled: VALUE RATIO chip/columns hide on zero `set_baseline`
rows (`hasBaselineSnapshots`); SET VALUE keeps its v1 condition (`hasSetSnapshots`).
Empty-state notes split into three variants (both missing / only v2 missing / only v1
missing). Loader cache keys bumped (`terminal-sealed-dashboard-v2`,
`terminal-sealed-detail-v4`) — payload shapes changed.

## 6 · Verification record

- `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run audit:sync-schedule` ✓ (10/13) ·
  `npm run audit:booster-baseline` ✓ **0 flags** (3,369 included priced cards).
- Live counts: table in §4; probe residue 0.
- SSR (dev server): one-piece `/terminal/sealed` renders the VALUE RATIO chip (plus SET
  VALUE), no UNAVAILABLE note, footnote shows LAST SNAPSHOT 2026-07-26 (v1) and LAST
  BASELINE SNAPSHOT 2026-07-27 (v2). `/games/lorcana/terminal/sealed` hides both chips
  with the combined note (its only "VALUE RATIO"/"SET VALUE" occurrences are inside the
  note). Detail page (`carrying-on-his-will-booster-box`): SET VALUE fact **$38,394**
  (v1 07-26 value 38,394.04 ✓), BASELINE RATIO fact and overlay labeled, zero
  occurrences of the old "VALUE RATIO" label.
- **Ratio spot-check — data-level, with a rendering caveat.** Hand computation: OP13
  baseline 35,972.83 ÷ latest box price 393.74 = **91.36×** (the population audit's
  §4.1 predicted 91.4× for exactly this box). The RENDERED ratio today is an em-dash —
  correctly: the latest sealed price row is dated 2026-07-26 and the only v2 snapshot is
  2026-07-27, and §2.3 carry-forward never reaches backward. **Ratios light up with the
  first sealed price point dated ≥ 2026-07-27** (daily sealed cron, 06:10 UTC); no code
  change is involved, and the em-dash state is the honest one until then.

## 7 · History — first attempt STOPPED at Gate 1 (2026-07-27/28)

Preserved as the record of why migration 20260728100000 exists.

Probe A (`entity_type='set_baseline'`, honest minimal values, `set_id=null`) and probe B
(identical + real `set_id`, the exact production shape) were both rejected 400/23514 by
CHECK constraint `market_index_snapshots_entity_reference_check`. B satisfying every
plausible reference rule proved the predicate dispatched on `entity_type` itself — a
de-facto whitelist of `{'set','character','rarity'}` (the three types then in the table:
360/1,370/26 of 1,756 rows). No third honest shape existed; per the brief the entire
change set stopped with the database byte-clean (0 probe residue, verified), and the DDL
conversation went to Justin with the `pg_get_constraintdef` introspection SQL and the
requirement that the fix copy the live branches verbatim rather than replace them with a
fresh type list. Resolution: Justin chose Option B (widen both CHECKs; natural-key
arbiter untouched) over widening the natural key, ruling the risk to the live capture
function's upsert arbiter disqualifying, and applied it 2026-07-28 with idempotent
guards and in-editor verification blocks. Incidental facts recorded then and still true:
v1 zero rows (ST29/ST30) carry real `set_id`; the stored v1 row shape matches what the
v1 backfill script writes.

## 8 · Contradictions vs the brief, and open items

1. **Gate 2's premise (from the audit) is falsified** — §3. The variant-selection defect
   between `price_history` and `price_stats` is NOT confined to excluded promos; it hits
   baseline reprints/parallels and at least one base card. Until that pipeline defect is
   fixed, no history-basis backfill of the v2 series can pass an honest gate; the v2
   series accumulates go-forward from the weekly writer.
2. **The rendered-ratio spot-check could not be performed against a live number today**
   (§6) — the v2 series' first point postdates the newest sealed price row by one day.
   Hand computation was done at the data level and matches the audit's prediction; the
   chip renders with em-dash ratios until the next daily sealed price lands. This is the
   accepted consequence of the gate-2 failure path ("go-forward data only").
3. `chg_7d`/`chg_30d` on v2 rows are index-over-index (§2) — deliberately different
   semantics from the v1 columns, because provider card stats do not exist retroactively.
   First non-null values: 2026-08-09 / ~2026-08-30.
4. The ST23-004 / OP10-119_r1 / OP08-023_r1 same-minute divergences are fresh, dated
   evidence for the standing `price_history`-vs-`price_stats` defect flagged in
   set-value-backfill.md §4 — anything charting singles history draws numbers that can
   disagree with the displayed current price by 80×+ on these cards. Worth its own fix
   cycle; it now also blocks v2 history.
