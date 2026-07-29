# Set-value snapshot backfill (Phase C5 / D3) — STOPPED at the regression gate

> **UPDATE 2026-07-27 — executed.** Option 2 (per-set anchoring) was approved and run;
> the out-of-sample gate against the new pg_cron 2026-07-26 snapshot passed (median |Δ|
> 0.00%, worst 0.50%) and **254 rows were written**. §§1–7 below record the original
> stopped run unchanged; see **“Executed 2026-07-27 — anchored method (option 2)”** at
> the bottom for what is now in the database.

**Date:** 2026-07-26 · **Branch:** `feat/moon-terminal` · **Script:** `scripts/backfill-set-value-snapshots.mjs`
**Outcome: NO ROWS WRITTEN.** The mandatory regression gate failed (max |Δ| **+32.70%** vs the findings'
+0.04–4.17% range), the script refused `--write` by design, and the root cause turns out to invalidate
the method's central assumption. `market_index_snapshots` is byte-for-byte untouched: 53
`entity_type='set'` rows, all `snapshot_date=2026-07-23`, before and after this work.

This doc records the full delta table, the per-card diagnosis, what it falsifies in
`docs/moon-terminal-justtcg-findings.md` §8, and the candidate corrections — all of which need a
decision before any write.

---

## 1 · What was run

`node scripts/backfill-set-value-snapshots.mjs` (dry run; `--write` was never invoked and would have
been refused). Method exactly per findings §8:

- Population per set = `cards` grouped on **`printed_set_code`**, `region='en'`, game one_piece,
  deduped on `card_image_id` (0 duplicates, 0 nulls found; 4,678 cards, 51 codes).
- Per-card as-of price = latest non-null `price_history.tcg_market` at or before the cutoff
  (carry-forward); `index_value` = per-set sum. 87,285 history rows ≤ cutoff fetched (keyset-paginated).
- Regression cutoff = the stored run's exact `captured_at` = `2026-07-23T09:45:14.932882+00:00`
  (all 53 rows share it).
- Planned backfill: Sundays 06-21 → 07-19, cutoff 23:40 UTC (pg_cron job 1 time), staleness gate
  p50 ≤ 10d, upsert `ON CONFLICT (game_id, entity_type, entity_key, snapshot_date) DO NOTHING`.

Column semantics verified against live rows before anything else: `card_count` **is** the full
population by `printed_set_code`+`region` (OP05 287, OP01 245, OP12 168 — exact matches probed live);
`priced_count` = cards with a non-null price; `price_basis='tcg_market'`, `metric_version=1`,
`region='en'`, `id` has `gen_random_uuid()` default.

## 2 · Regression gate result — FAILED

Reconstruction of 2026-07-23 at the exact stored cutoff vs stored rows:

| set | stored index_value | reconstructed | delta | stored/recon cards | stored/recon priced |
| --- | ---: | ---: | ---: | --- | --- |
| EB01 | 12379.97 | 12773.70 | +3.18% | 131/131 | 124/125 |
| EB02 | 9175.60 | 9182.74 | +0.08% | 94/94 | 91/91 |
| EB03 | 7205.81 | 7205.81 | +0.00% | 90/90 | 90/90 |
| EB04 | 1467.36 | 1478.04 | +0.73% | 81/81 | 81/81 |
| OP01 | 24617.93 | 25645.59 | +4.17% | 245/245 | 236/236 |
| OP02 | 12135.18 | 12135.18 | +0.00% | 233/233 | 216/216 |
| OP03 | 7918.62 | 7917.19 | -0.02% | 255/255 | 239/240 |
| OP04 | 3348.06 | 3350.80 | +0.08% | 206/206 | 200/202 |
| OP05 | 44675.28 | 46042.42 | +3.06% | 287/287 | 270/273 |
| OP06 | 20250.40 | 20479.65 | +1.13% | 280/280 | 270/271 |
| OP07 | 28397.27 | 28805.31 | +1.44% | 245/245 | 230/233 |
| OP08 | 11421.17 | 11528.65 | +0.94% | 181/181 | 175/175 |
| OP09 | 48573.99 | 48578.70 | +0.01% | 299/299 | 270/273 |
| OP10 | 6973.42 | 7138.70 | +2.37% | 204/204 | 190/191 |
| OP11 | 6285.16 | 6285.31 | +0.00% | 170/170 | 166/166 |
| OP12 | 7011.71 | 7014.49 | +0.04% | 168/168 | 167/167 |
| OP13 | 38460.90 | 38458.98 | -0.00% | 173/173 | 173/173 |
| OP14 | 6016.02 | 6011.82 | -0.07% | 149/149 | 149/149 |
| OP15 | 2587.32 | 2303.52 | **-10.97%** | 147/146 | 147/146 |
| OP16 | 25.60 | — | **MISSING** | 1/0 | 1/0 |
| P | 18142.13 | 24075.14 | **+32.70%** | 297/291 | 240/234 |
| PRB01 | 111.67 | 111.67 | -0.00% | 2/2 | 2/2 |
| PRB02 | 10622.07 | 10618.65 | -0.03% | 39/39 | 39/39 |
| ST01 | 15631.11 | 15692.61 | +0.39% | 74/74 | 60/60 |
| ST02 | 503.43 | 503.44 | +0.00% | 39/39 | 33/33 |
| ST03 | 2244.91 | 2416.28 | **+7.63%** | 59/59 | 50/50 |
| ST04 | 1580.18 | 1579.37 | -0.05% | 49/49 | 42/42 |
| ST05 | 36.35 | 36.31 | -0.11% | 25/25 | 22/23 |
| ST06 | 911.96 | 911.09 | -0.10% | 40/40 | 35/35 |
| ST07 | 1122.09 | 1146.40 | +2.17% | 27/27 | 24/24 |
| ST08 | 25.33 | 25.33 | +0.00% | 17/17 | 16/16 |
| ST09 | 51.36 | 51.36 | +0.00% | 20/20 | 19/19 |
| ST10 | 3723.14 | 3723.14 | +0.00% | 37/37 | 32/32 |
| ST11 | 21.07 | 20.37 | -3.32% | 16/16 | 9/10 |
| ST12 | 559.10 | 551.80 | -1.31% | 29/29 | 27/27 |
| ST13 | 1876.38 | 1875.69 | -0.04% | 64/64 | 57/57 |
| ST14 | 152.47 | 152.48 | +0.01% | 27/27 | 27/27 |
| ST15 | 1169.79 | 1169.79 | +0.00% | 10/10 | 9/9 |
| ST16 | 429.33 | 429.60 | +0.06% | 16/16 | 14/15 |
| ST17 | 1528.86 | 1515.31 | -0.89% | 18/18 | 16/16 |
| ST18 | 1487.99 | 1487.99 | +0.00% | 18/18 | 17/17 |
| ST19 | 6.73 | 6.73 | +0.00% | 10/10 | 9/9 |
| ST20 | 3.43 | 3.43 | +0.00% | 7/7 | 7/7 |
| ST21 | 2080.43 | 2080.43 | +0.00% | 37/37 | 36/36 |
| ST22 | 68.01 | 68.01 | +0.00% | 33/33 | 32/32 |
| ST23 | 14.22 | 14.22 | +0.00% | 5/5 | 5/5 |
| ST24 | 9.81 | 9.81 | -0.00% | 5/5 | 5/5 |
| ST25 | 2.91 | 2.91 | +0.00% | 5/5 | 5/5 |
| ST26 | 581.74 | 581.74 | +0.00% | 6/6 | 6/6 |
| ST27 | 2.26 | 2.26 | +0.00% | 5/5 | 5/5 |
| ST28 | 1.94 | 1.94 | +0.00% | 5/5 | 5/5 |
| ST29 | 0.00 | — | MISSING (empty set) | 0/0 | 0/0 |
| ST30 | 0.00 | — | MISSING (empty set) | 0/0 | 0/0 |

Distribution: **34 sets within ±0.25%** · 4 in 0.25–1% · 9 in 1–4.17% · **3 beyond the findings'
range** (ST03 +7.63%, OP15 −10.97%, P +32.70%) · 3 missing (OP16, ST29, ST30). Median |Δ| 0.03%.

## 3 · Root cause — the findings §8 skew attribution is falsified

**The claim I'm correcting:** findings §8 measured +0.04% (OP12), +3.06% (OP05), +4.17% (OP01) with an
end-of-day 07-23 cutoff, attributed the residual to intra-day cutoff skew, and stated *"Matching the
cron's actual run time removes it."* **It does not.** At the exact stored `captured_at` the deltas are
identical to the findings' end-of-day numbers, to the second decimal. The residual is not skew.

**What it actually is** (per-card probe, `price_history` as-of vs current `price_stats`): each set's
residual is concentrated in a handful of promo/prize cards where **the `price_history` pipeline and the
`price_stats` pipeline record wildly different prices for the same card on the same sync date** —
apparently different variant selection. The capture function sums `price_stats.tcg_market`; the
reconstruction sums `price_history.tcg_market`. Where the two pipelines agree (34+ sets) the
reconstruction is essentially exact; where they diverge it is unbounded. Worst offenders:

| card | set | history as-of 07-23 | price_stats (same sync date) | single-card share of set delta |
| --- | --- | ---: | ---: | --- |
| P-P-085 (Jewelry Bonney, Regional Champion) | P | 1,499.99 | 188.25 (upd 07-19) | 22% of P's +5,933 |
| P-OP05-076 (When You're at Sea…) | OP05 | 1,389.66 | 26.44 (upd 07-12) | **~100% of OP05's +3.06%** |
| P-041-regional-prize | P | 729.58 | 13.91 (upd 07-19) | — |
| EB01-001_p2 (Kouzuki Oden SPR) | EB01 | 693.76 | 301.14 (**stale, upd 04-07**) | ~100% of EB01's +3.18% |
| P-OP01-016 (Nami, 1st Anniversary) | OP01 | 547.11 | 93.41 (upd 07-19) | 44% of OP01's +4.17% |
| P-079-event-pack (Lim, CS Event Pack) | P | 485.00 | 0.81 (upd 07-19) | — |
| ST03-008-regional-prize | ST03 | 194.19 | 26.37 (upd 07-12) | ~98% of ST03's +7.63% |

Removing the identified divergent cards from both sides reproduces the stored values to ~±0.01% on
OP01, OP05, EB01 and ST03 — i.e. **the method is exact except on this card class.**

Ruled out: backdated history writes (only 16 rows game-wide have `created_at` after the capture but
`recorded_at` before it, all $0.11–0.28 — immaterial); intra-day skew (above); population definition
(card_count matches stored exactly on every non-churned set).

### Secondary cause — catalog churn since 2026-07-23

Today's `cards` table is not the population the 07-23 capture saw. Verified live:

- **OP16 has vanished** (stored: 1 card, $25.60; today: 0 rows in any region).
- **OP15 lost one card** (147 → 146); the missing card's ~$283.80 is OP15's entire −10.97%. Today's
  `price_stats` sum for OP15 (2,304.81) matches my reconstruction (2,303.52), not the stored value —
  the reconstruction is internally consistent with today's catalog.
- **P lost 6 cards** (297 → 291).
- A **new `printed_set_code` "N"** exists (6 DON!! cards with `card_number='N/A'` whose
  `card_image_id`s say OP02/OP03/OP07/OP08/OP10/P — it looks like a recent re-parse artifact of
  "N/A", i.e. Codex-machine catalog churn in the last ~3 days). Absent from the stored 53; the script
  excludes it from any write.
- ST29/ST30 are stored as legitimate zero rows (`card_count=0, index_value=0`) — the capture function
  emits empty sets; the reconstruction naturally has no cards for them. Benign, but a corrected run
  must classify them as "empty" rather than "missing".

### Why this blocks the backfill (not just the regression)

The stored 07-23 point and every future pg_cron point are on the **`price_stats` basis**. Backfilled
points on the **`price_history` basis** would run persistently hot per set — +3% OP05, +33% P — for
five weeks and then step down at 07-23: a fabricated cliff in exactly the chart this backfill exists
to improve. The findings' validation (three well-behaved sets) sampled the agreeing majority and
missed the divergent class. The brief's stop condition applies: deltas are materially worse than the
findings' range → **no write.**

## 4 · What would make it writable — needs a decision

Three candidate corrections, none self-approvable here since findings §8's validation claim is
falsified:

1. **Divergent-card exclusion.** Drop cards whose history-vs-stats divergence at 07-23 is material
   (e.g. ratio > 3× and gap > $25) from the population for *all* weeks. Validated manually to ~±0.01%
   on OP01/OP05/EB01/ST03. Cost: backfilled `index_value` omits those cards' (mostly small) stats
   contributions, so backfilled weeks run slightly low vs cron output — and the EB01-001_p2 case
   (divergence caused by *stale stats*, card genuinely worth ~$300–700) would exclude a real card
   worth ~2.4% of EB01. Honest but imperfect.
2. **Per-set anchoring (chain-linking).** Scale each set's weekly reconstruction by
   `stored_0723 / recon_0723`. Exact at the anchor; preserves week-over-week shape; constant pipeline
   offsets cancel. Standard index technique, but the written values are no longer direct sums —
   must be disclosed (e.g. in `price_basis` or a metadata note) if chosen.
3. **Clean-sets-only backfill.** Write only sets with |Δ| within noise (~±1%, 38 sets), skip the
   divergent ones. Leaves OP01/OP05/P — the most-watched sets — with a single point.

Also required for any corrected run: treat stored zero rows (ST29/ST30) as trivially matched; decide
whether OP16 (now catalog-deleted) gets backfilled at all; keep excluding code "N".

Worth flagging independently of this backfill: **the `price_history`-vs-`price_stats` variant
disagreement is a live data defect.** Anything that charts singles history (e.g. `/card/[id]` pages)
is drawing numbers that can disagree with the displayed current price by 5–700× on these promo cards.
And `price_stats` staleness (EB01-001_p2 last updated 2026-04-07) means the weekly set index itself
carries months-old prices for some chase cards.

## 5 · Policies as implemented in the script (for whenever a corrected write is approved)

- **chg_7d / chg_30d: NULL on every backfilled row, unconditionally.** The live column comments define
  them as aggregates of *current card-level provider statistics at capture time* — those statistics
  do not exist for past dates and cannot be reconstructed. A ratio-of-index-values would be a
  different metric silently occupying the same column. (This supersedes the findings §8 plan of
  computing them where the prior week is credible; it was decided from the live column semantics,
  which the findings didn't have.)
- **Staleness gate:** skip any (set, week) whose median carried-forward staleness exceeds 10 days,
  recording the skip. Weeks 2026-06-14 and earlier are excluded outright (findings §8: p50 67d).
- **Write path:** `POST … on_conflict=game_id,entity_type,entity_key,snapshot_date` with
  `Prefer: resolution=ignore-duplicates` (ON CONFLICT DO NOTHING) — the stored 07-23 rows can never
  be modified; re-runs are no-ops. Only `entity_type='set'`, only codes among the validated 53,
  only codes resolving in `sets` by exact code match.
- **`captured_at`** = the backfill script's actual run time (honest provenance), `snapshot_date` +
  the 23:40 UTC cutoff carry the historical semantics.

## 6 · Row counts — before / after (live, 2026-07-26)

| snapshot_date | before | after |
| --- | ---: | ---: |
| 2026-06-21 | 0 | 0 |
| 2026-06-28 | 0 | 0 |
| 2026-07-05 | 0 | 0 |
| 2026-07-12 | 0 | 0 |
| 2026-07-19 | 0 | 0 |
| 2026-07-23 | 53 | 53 |
| **total `entity_type='set'`** | **53** | **53** |

Zero writes. Weeks written: none. Skips executed: none (the run never reached the backfill stage).

## 7 · Contradictions found vs the brief / findings

1. **Findings §8 "matched cutoff removes the residual" — false.** Deltas at the exact `captured_at`
   equal the end-of-day deltas. Root cause is pipeline basis divergence (§3), not skew.
2. **Findings §8's +0.04–4.17% "validation range" is itself symptomatic** — OP01's +4.17% and OP05's
   +3.06% are each one or three divergent promo cards, not benign noise. The three-set validation
   sample happened to dodge the worst cases (P, OP15, ST03).
3. **The population is no longer stable**: OP16 deleted, OP15/P shrank, code "N" appeared — all since
   07-23. Any regression against the stored snapshot now carries catalog-churn noise on those sets.
4. Minor: brief said ~88k One Piece `price_history` rows / 53 codes with 07-23 coverage; live today:
   89,013 rows (one more sync day), 51 current printed codes (OP16 and two others churned), 4,678 en
   cards with a printed code. `chg_*` policy is stricter than the brief anticipated (§5, first bullet).

---

## Executed 2026-07-27 — anchored method (option 2)

**Approved by Justin; run 2026-07-27 (dry run 09:26:06Z, write 09:34:56Z — backfilled
rows carry `captured_at 2026-07-27T09:34:56.959Z`).
Script: `scripts/backfill-set-value-snapshots.mjs` (extended in place —
dry-run default, `--write` flag, gates refuse writes). Outcome: out-of-sample gate PASSED,
254 rows written across the five Sundays. Stored 2026-07-23 and 2026-07-26 batches
byte-untouched (verified: 53 rows each, original `captured_at` values, index sums
363,628.97 / 364,229.77 unchanged).**

### The new fact that made this validatable

pg_cron job 1 fired on schedule Sunday **2026-07-26 23:40 UTC** and wrote a second stored
batch (53 rows, `captured_at 2026-07-26T23:40:00.225203Z`) — it did not exist when the
method was designed, making it a genuine out-of-sample target: anchor factors computed
solely from 07-23 were required to predict the stored 07-26 values.

### Method

- Per set: `anchor_factor = stored_index_value(07-23) / reconstructed(07-23)` at the
  stored capture's exact cutoff `2026-07-23T09:45:14.932882Z`. Reconstruction semantics
  identical to §1 (printed_set_code population, `region='en'`, `card_image_id` dedupe,
  as-of carry-forward from `price_history`; 89,657 history rows ≤ 07-26 23:40 fetched).
- Backfilled `index_value` = `anchor_factor × reconstructed(week)` for Sundays 06-21 →
  07-19, cutoff 23:40 UTC each (the cron time).
- Gate: write only if median |Δ| ≤ 2% **and** worst |Δ| ≤ 10% on the 07-26 prediction.

### Out-of-sample gate — PASSED, no exclusions needed

**Median |Δ| 0.00% (gate 2%) · worst |Δ| +0.50% (EB02, gate 10%) · 50 comparable sets.**
Full table (prediction = 07-23 anchor factor × reconstruction at the 07-26 stored cutoff):

| set | stored 07-26 | anchored prediction | Δ | population churn |
| --- | ---: | ---: | ---: | --- |
| EB01 | 12380.93 | 12380.90 | -0.00% | no |
| EB02 | 9173.21 | 9218.98 | +0.50% | no |
| EB03 | 7244.31 | 7244.31 | -0.00% | no |
| EB04 | 1467.32 | 1467.32 | +0.00% | no |
| OP01 | 24678.43 | 24676.32 | -0.01% | no |
| OP02 | 12049.27 | 12049.27 | -0.00% | no |
| OP03 | 7892.63 | 7894.11 | +0.02% | no |
| OP04 | 3362.86 | 3362.85 | -0.00% | no |
| OP05 | 44892.51 | 44886.07 | -0.01% | no |
| OP06 | 20548.72 | 20545.38 | -0.02% | no |
| OP07 | 28413.19 | 28412.96 | -0.00% | no |
| OP08 | 11408.27 | 11409.06 | +0.01% | no |
| OP09 | 48632.90 | 48630.84 | -0.00% | no |
| OP10 | 6983.47 | 6981.90 | -0.02% | no |
| OP11 | 6276.00 | 6275.85 | -0.00% | no |
| OP12 | 6996.49 | 6993.43 | -0.04% | no |
| OP13 | 38394.04 | 38394.23 | +0.00% | no |
| OP14 | 6016.02 | 6016.02 | +0.00% | no |
| OP15 | 2587.24 | 2587.22 | -0.00% | **YES (147→146)** |
| OP16 | 25.60 | — | — | excluded: anchor uncomputable (catalog-deleted) |
| P | 18142.13 | 18142.13 | +0.00% | **YES (297→291)** |
| PRB01 | 111.67 | 111.67 | +0.00% | no |
| PRB02 | 10622.07 | 10622.07 | +0.00% | no |
| ST01 | 15637.64 | 15637.61 | -0.00% | no |
| ST02 | 502.73 | 502.73 | +0.00% | no |
| ST03 | 2246.94 | 2246.80 | -0.01% | no |
| ST04 | 1580.35 | 1580.35 | +0.00% | no |
| ST05 | 36.35 | 36.35 | +0.00% | no |
| ST06 | 911.24 | 911.24 | -0.00% | no |
| ST07 | 1122.09 | 1122.09 | +0.00% | no |
| ST08 | 25.33 | 25.33 | +0.00% | no |
| ST09 | 51.36 | 51.36 | +0.00% | no |
| ST10 | 3718.68 | 3718.68 | +0.00% | no |
| ST11 | 21.07 | 21.07 | +0.00% | no |
| ST12 | 559.59 | 559.60 | +0.00% | no |
| ST13 | 1877.31 | 1877.31 | +0.00% | no |
| ST14 | 171.59 | 171.59 | -0.00% | no |
| ST15 | 1170.21 | 1170.21 | -0.00% | no |
| ST16 | 432.43 | 432.44 | +0.00% | no |
| ST17 | 1528.86 | 1528.86 | +0.00% | no |
| ST18 | 1493.62 | 1493.68 | +0.00% | no |
| ST19 | 6.73 | 6.73 | +0.00% | no |
| ST20 | 3.43 | 3.43 | +0.00% | no |
| ST21 | 2151.43 | 2151.43 | +0.00% | no |
| ST22 | 68.01 | 68.01 | +0.00% | no |
| ST23 | 14.69 | 14.69 | +0.00% | no |
| ST24 | 9.81 | 9.81 | +0.00% | no |
| ST25 | 2.91 | 2.91 | +0.00% | no |
| ST26 | 581.67 | 581.67 | +0.00% | no |
| ST27 | 2.26 | 2.26 | +0.00% | no |
| ST28 | 2.16 | 2.16 | +0.00% | no |
| ST29 | 0.00 | 0.00 | matched (empty) | — |
| ST30 | 0.00 | 0.00 | matched (empty) | — |

The churn-flagged sets (OP15, P) predicted to within rounding — both stored batches share
the pre-churn population basis, both reconstructions share today's basis, so the anchor
absorbs the population deficit along with the pipeline offset. **No churn exclusions were
required; the gate passed on all 50 comparable sets.** This also validates §4's premise:
the §3 pipeline divergence is a stable per-set offset over the 3-day window, exactly what
chain-linking assumes.

### Anchor factors (from the 07-23 stored batch)

| set | stored 07-23 | recon 07-23 | raw Δ | anchor factor |
| --- | ---: | ---: | ---: | ---: |
| EB01 | 12379.97 | 12773.70 | +3.18% | 0.969177 |
| EB02 | 9175.60 | 9182.74 | +0.08% | 0.999222 |
| EB03 | 7205.81 | 7205.81 | +0.00% | 1.000000 |
| EB04 | 1467.36 | 1478.04 | +0.73% | 0.992774 |
| OP01 | 24617.93 | 25645.59 | +4.17% | 0.959928 |
| OP02 | 12135.18 | 12135.18 | +0.00% | 1.000000 |
| OP03 | 7918.62 | 7917.19 | -0.02% | 1.000181 |
| OP04 | 3348.06 | 3350.80 | +0.08% | 0.999182 |
| OP05 | 44675.28 | 46042.42 | +3.06% | 0.970307 |
| OP06 | 20250.40 | 20479.65 | +1.13% | 0.988806 |
| OP07 | 28397.27 | 28805.31 | +1.44% | 0.985835 |
| OP08 | 11421.17 | 11528.65 | +0.94% | 0.990677 |
| OP09 | 48573.99 | 48578.70 | +0.01% | 0.999903 |
| OP10 | 6973.42 | 7138.70 | +2.37% | 0.976847 |
| OP11 | 6285.16 | 6285.31 | +0.00% | 0.999976 |
| OP12 | 7011.71 | 7014.49 | +0.04% | 0.999604 |
| OP13 | 38460.90 | 38458.98 | -0.00% | 1.000050 |
| OP14 | 6016.02 | 6011.82 | -0.07% | 1.000699 |
| OP15 | 2587.32 | 2303.52 | -10.97% | 1.123203 |
| OP16 | 25.60 | — | — | SKIP — catalog-deleted, anchor uncomputable |
| P | 18142.13 | 24075.14 | +32.70% | 0.753563 |
| PRB01 | 111.67 | 111.67 | -0.00% | 1.000000 |
| PRB02 | 10622.07 | 10618.65 | -0.03% | 1.000322 |
| ST01 | 15631.11 | 15692.61 | +0.39% | 0.996081 |
| ST02 | 503.43 | 503.44 | +0.00% | 0.999980 |
| ST03 | 2244.91 | 2416.28 | +7.63% | 0.929077 |
| ST04 | 1580.18 | 1579.37 | -0.05% | 1.000513 |
| ST05 | 36.35 | 36.31 | -0.11% | 1.001102 |
| ST06 | 911.96 | 911.09 | -0.10% | 1.000955 |
| ST07 | 1122.09 | 1146.40 | +2.17% | 0.978794 |
| ST08 | 25.33 | 25.33 | +0.00% | 1.000000 |
| ST09 | 51.36 | 51.36 | +0.00% | 1.000000 |
| ST10 | 3723.14 | 3723.14 | +0.00% | 1.000000 |
| ST11 | 21.07 | 20.37 | -3.32% | 1.034364 |
| ST12 | 559.10 | 551.80 | -1.31% | 1.013229 |
| ST13 | 1876.38 | 1875.69 | -0.04% | 1.000368 |
| ST14 | 152.47 | 152.48 | +0.01% | 0.999934 |
| ST15 | 1169.79 | 1169.79 | +0.00% | 1.000000 |
| ST16 | 429.33 | 429.60 | +0.06% | 0.999372 |
| ST17 | 1528.86 | 1515.31 | -0.89% | 1.008942 |
| ST18 | 1487.99 | 1487.98 | -0.00% | 1.000007 |
| ST19 | 6.73 | 6.73 | +0.00% | 1.000000 |
| ST20 | 3.43 | 3.43 | +0.00% | 1.000000 |
| ST21 | 2080.43 | 2080.43 | +0.00% | 1.000000 |
| ST22 | 68.01 | 68.01 | +0.00% | 1.000000 |
| ST23 | 14.22 | 14.22 | +0.00% | 1.000000 |
| ST24 | 9.81 | 9.81 | -0.00% | 1.000000 |
| ST25 | 2.91 | 2.91 | +0.00% | 1.000000 |
| ST26 | 581.74 | 581.74 | +0.00% | 1.000000 |
| ST27 | 2.26 | 2.26 | +0.00% | 1.000000 |
| ST28 | 1.94 | 1.94 | +0.00% | 1.000000 |
| ST29 | 0.00 | 0.00 | — | empty — zero rows mirrored |
| ST30 | 0.00 | 0.00 | — | empty — zero rows mirrored |

### Rows written — before / after (live-verified after the run)

| snapshot_date | before | after | written |
| --- | ---: | ---: | ---: |
| 2026-06-21 | 0 | 51 | 51 |
| 2026-06-28 | 0 | 51 | 51 |
| 2026-07-05 | 0 | 51 | 51 |
| 2026-07-12 | 0 | 50 | 50 |
| 2026-07-19 | 0 | 51 | 51 |
| 2026-07-23 | 53 | 53 | 0 (stored — untouched) |
| 2026-07-26 | 53 | 53 | 0 (stored — untouched) |
| **total set rows** | **106** | **360** | **+254** |

Each clean week = 49 anchored sets + 2 empty (ST29/ST30 zero rows, classified 'empty' —
mirrors cron semantics). `chg_7d`/`chg_30d` NULL on every row; `region='en'`,
`price_basis='tcg_market'`, `metric_version=1`, `set_id` resolved by exact code (0 nulls);
`captured_at` = actual run time. Upsert was `ON CONFLICT (game_id, entity_type,
entity_key, snapshot_date) DO NOTHING`.

### Skips (16 total)

| set | weeks | reason |
| --- | --- | --- |
| EB04 | all 5 | median carried-price staleness 40.5–68.5d > 10d (EB04's history only became dense in mid-July; a backfilled value would be a carry-forward plateau) |
| OP16 | all 5 | catalog-deleted (0 cards in any region today) — anchor uncomputable; per approved brief |
| PRB01 | 2026-07-12 only | median staleness 11.2d > 10d |
| N | all 5 | catalog re-parse artifact code, outside the 53 stored codes — excluded per approved brief |

### Disclosure — backfilled values are anchored, not direct sums

The 5 written weeks carry `index_value = anchor_factor × Σ price_history.tcg_market`
(as-of), **not** the `Σ price_stats.tcg_market` a real capture run computes. The schema
has no field to mark this (and no DDL was permitted), so this section is the disclosure
of record: method, per-set anchor factors (table above), affected rows = all 254 rows
with `snapshot_date ∈ {2026-06-21, 06-28, 07-05, 07-12, 07-19}`. Rows with
`snapshot_date ≥ 2026-07-23` are genuine capture output. `card_count`/`priced_count` on
backfilled rows reflect the reconstruction population (today's catalog), which on OP15
(146) and P (291) differs from the stored batches' pre-churn basis (147/297) — the
`index_value` is anchored to the stored basis, the counts are what was actually counted.

### Anomaly worth recording — the cron saw a pre-churn catalog

The stored 07-26 batch (written 23:40 UTC Sunday) carries card/priced counts **identical
to 07-23 for all 53 codes** — OP16 present (1 card), OP15 147, P 297, no "N" — while this
repo's live reads on 07-26 daytime (§3) *and* on 07-27 both show the churned catalog
(OP16 gone, OP15 146, P 291, "N" present with 6 cards). So the catalog was evidently
restored to its pre-churn state before the cron fired and re-churned afterwards —
Codex-machine catalog churn is oscillating, not monotonic. Nothing in this backfill
depends on which state is "right" (the anchor absorbs it, out-of-sample proof above),
but anything else that joins `cards` should expect this instability.
