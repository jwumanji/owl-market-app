# Moon Terminal — D7 briefing: pull-rates questions, D3 result, Value Ratio audit

**Date:** 2026-07-27 · **For:** Justin's D7 call · **Status:** complete except §6 (audit running)
Sources: `pull-rates-research.md` (incl. sensitivity appendix §S.1–S.4), `set-value-backfill.md`,
`sealed-catalog-reconcile.md`, `value-ratio-population-audit.md`.

---

## 1 · D3 — set-value backfill: executed, method validated out-of-sample

Run with **option 2 (per-set anchoring to the stored 07-23 snapshot)**. The decisive new evidence:
pg_cron independently wrote its own 07-26 snapshot Sunday night — *after* the anchor factors were
fixed from 07-23 — giving the method a genuine out-of-sample test:

> **Anchored prediction of the stored 07-26 batch: median |Δ| 0.00%, worst |Δ| +0.50% (EB02), across
> 50 comparable sets.** The history-vs-stats divergence is a stable per-set offset; chain-linking's
> core assumption holds empirically, not just in argument.

**254 rows written** (five Sundays 2026-06-21 → 07-19: 49 anchored + 2 stored-style empty rows each,
one week at 50). Stored batches untouched. `chg_*` NULL unconditionally. **Value Ratio depth: 1 → 7
weekly points.** Skips: EB04 all weeks (carried-price staleness 40–68d), OP16 (catalog-deleted,
anchor uncomputable), artifact code "N".

**Anomaly for the record:** the Codex machine's catalog churn *oscillates* — OP16 was present in the
catalog when the cron fired Sunday 23:40 UTC and deleted again by Monday. Snapshot batches may be on
a different catalog basis than same-day live reads.

## 2 · Q1 — the JP→EN ×2 heuristic is inference, cross-checked; not observed EN data

Pure card-count scaling: JP box = 24 packs × 6 cards (144), EN = 24 × 12 (288); JP per-box rates are
doubled assuming equal hit density per card. **No EN break data underlies it.** Validation is
*reconvergence* — everywhere independent EN community figures exist, ×2 lands inside them:

| Slot | JP ×2 | EN consensus |
|---|---|---|
| SR | 6–10 | 7–10 |
| MR (single-card) | ~1/36–48 boxes | "1 per 3–4 cases" |
| SEC | 0.7–1.0/box | ~1/box |

Triangulated on the three biggest classes; **untested on every set/slot where only JP data exists.**
All 62 ×2-derived rows are `confidence='low'` with the derivation in `source_note`. Restricting to
observed-EN-only collapses coverage to roughly SR/SEC/AA/BULK on OP02–OP09.

## 3 · Q2 — top-slot 2× sensitivity: the real finding is a population defect

Strict Phase-F population semantics give a useless-but-instructive answer: **15/17 sets exceed ±30%**
— because the `printed_set_code` population includes **promos and event reprints carrying base
rarities** ($8,999 Uta promo classed "R" in OP09; $9,950 serial Ace in OP07; $3,499 Boa in OP14's
11-card SR class), which the ~271-card BULK multiplier amplifies into a **median ~15× EV inflation**.
Every `sealed_premium` would print absurd negatives.

**Prerequisite: Box EV must price a booster-baseline population** (promo/event ids excluded — rule
drafted in the sensitivity appendix). With it, the honest ±30% cut list is **8 sets**, split:

- **Genuine rate sensitivity** (top slot `low`, trim candidates): **OP01 (L) · OP05 (MR) · OP13 (SAR)
  · EB02 (AA)** — three of four JP-derived.
- **Residual single-card pollution** (refine the rule, don't cut): OP03 · OP04 · OP06 · EB01.

Corollary: the shipped §3.4 top-10 shows a **promo as the set's #1 card on 9/17 sets**. That is
spec-consistent (§2.2 population; matches the set-value denominator) but is a product call. Box EV,
unlike top-10, has no defensible reading that includes promos.

## 4 · Q3 — what 'high' confidence would require: no reachable source

Either official Bandai rate publication (**does not exist**, any set, ever) or a large EN per-set
break aggregate. Hunted: r/OnePieceTCG compilations (not surfaced via search), egmanevents /
onepiece.gg (no pull-rate content), **ripster.gg — the one named candidate, blocks automated fetch
(403); a human with a browser could check it in minutes**. Absent those: **medium is the permanent
ceiling.** UI consequence: phrase the disclaimer as a permanent property ("community-estimated,
unofficial"), no improves-later implication, and reserve the caution strip for genuinely thin sets
(top-value slot `low`) instead of wallpapering every set.

## 5 · Q4 — the four uncovered sets

All hide Box EV cleanly per §3.5 (no zeros). Not equal in expectation:

| Set | Why | Expected by users? |
|---|---|---|
| **OP16** | zero EN cards in our card catalog (EN release 06-12; catalog lag) — top-10 and set value also impossible | **Yes — newest main set.** Gap is upstream (Codex catalog), worth chasing independently of Terminal |
| EB03 | god-pack odds only; no per-slot base rates | Niche |
| PRB01 | only 2 cards carry the printed code (reprint box) — EV join structurally unpriceable | Low |
| PRB02 | same class of problem (39 cards) | Low |

## 6 · Value Ratio population audit (Justin's addition) — CONFIRMED

Full tables: `value-ratio-population-audit.md`. Basis validated first (reconstructed sums reproduce
the stored 07-26 batch at median |Δ| 0.26%; every outlier chased to a named cause — post-capture
promo repricings and the documented catalog churn).

**Yes — `index_value` sums exactly the polluted population that broke Box EV.**

- **45.5% of the One Piece set-value index ($170,554 of $374,888) is promo/event/non-booster paper**,
  ~94% of it `P-*` promo ids. 36 of 50 non-empty sets exceed 15% share.
- Heavy-overlap sets behind tracked boxes: OP10 76.5% · OP12 63.5% · OP03 62.4% · OP02 61.3% ·
  OP14 58.0% · OP07 57.4% · OP11 53.2% · EB01 52.1% · OP09 50.1% · OP01 44.8%. Near-clean: OP13 6.3%.
- **Shipped ranking impact (VALUE RATIO mode, 22 boxes): 14 change rank under a booster-baseline
  numerator; 7 move more than 2 positions** (OP10 7→14 · PRB02 8→19 · EB03 10→7 · OP03 14→17 ·
  EB02 16→8 · OP15 17→12 · OP04 19→15). The podium holds but levels are wrong (OP07 renders 81.5×
  vs honest 43.0×). Clean sets are systematically under-ranked.
- **Trend verdict: chronic level inflation, trends honest so far** (per-set share delta between the
  two stored dates: median 0.01 pts) — *but episodic spikes are real and one was caught live*:
  `P-OP07-119` serial Ace repriced $3,200 → $9,950 on 07-27, so OP07's next Sunday capture will
  print roughly **+24% W/W off a single promo card** unless something changes.

**Fix shape (recommendation, not decision):** do NOT change `capture_market_index_snapshots` in
place — it is a live DB function feeding other consumers, and an in-place population change
recreates the exact basis cliff the anchored backfill just solved. The clean path is a **parallel
booster-baseline series** (`metric_version=2` is the natural lever), built with the same anchoring
discipline, sharing ONE exclusion mechanism with Box EV — both need the identical population.

## 7 · The decisions on the table after this

1. **Population rule** — approve ONE booster-baseline exclusion mechanism, used by Box EV's rarity
   averages now and by any future set-value v2 series (§6).
2. **The shipped VALUE RATIO mode, near term** — (a) leave as-is with an honest label, (b) hide the
   ranking chip until a v2 series exists, or (c) bless a loader-side booster-baseline set value
   (violates the "no second rollup" rule unless you explicitly waive it). Recommendation: (a) is
   defensible because trends are honest; (b) if the cross-set ranking is the feature's core promise.
3. **Trim** — OP01 / OP05 / OP13 / EB02: cut, or keep at `low` with caution strip.
4. **×2 heuristic** — accept (marked `low`) or restrict to observed-EN-only.
5. Standing smaller items: drop SP slots · skip PRB01/02 · TR stays `low` · amend strip trigger.
6. Product calls surfaced, not blocking: top-10 promo-at-#1; the OP16 catalog gap (upstream).
