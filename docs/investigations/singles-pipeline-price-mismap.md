# Singles pipeline defect: JP-variant price mis-mapped onto EN base card

**Date:** 2026-07-28 · **Caught by:** `npm run audit:booster-baseline` (detector B,
price vs slot-median) · **Status:** FILED, not fixed — `price_stats` is written by
the out-of-repo singles pipeline (Codex machine domain). Terminal code is correct;
this is a data bug upstream of it.

## The defect

Plain `OP09-051` "Buggy (051)" (rarity **MR**, region **en** — the base manga rare)
carries `price_stats.tcg_market = $1,740.54`, **identical to the cent** with its JP
super-parallel row. The provider price for the JP chase variant has been mapped
onto the EN base card. The row refreshes daily (updated 06:01 UTC today), so this
is live, recurring sync behavior — not a stale one-off.

This is the same *class* of defect as the price_history-vs-price_stats variant
divergence documented in `set-value-backfill.md` §3 and `set-value-v2.md` §3
(ST23-004, OP10-119_r1, EB01-001_p2): **variant identity is not stable across the
singles pipeline's write paths.**

## Downstream cost, quantified (live figures, 2026-07-28)

| Surface | Impact |
|---|---|
| **OP09 set-baseline index (v2, feeds Value Ratio)** | $22,322.72 includes the bogus $1,740.54 → **~7.8% inflation**; OP09's BASELINE RATIO reads ~7.8% hot on the dashboard and detail pages |
| **OP09 top-10 tiles (§3.4)** | $1,740.54 tiles at/near **#1** of the baseline top-10; "TOP CARD ALONE" share (~7.8%) describes a price that doesn't exist |
| **OP09 Box EV (§3.5)** | **$0 today** — OP09's seeded slots (AA/TR/SR/L/BULK) include no MR slot (cut in the EN-observed-only decision). If an MR slot is ever seeded, the error enters EV at `per_box × $1,740` vs the true base price |
| **v1 set snapshots (`entity_type='set'`)** | Also inflated (the full-population sum includes the same row), on top of the known 45.5% promo overlap |

## Fix locus and verification

Fix belongs in the singles sync's variant mapping (wherever `price_stats` rows are
attributed to `card_image_id`s), not in Terminal and not in the booster-baseline
classifier — the card genuinely is baseline booster paper; only its price is wrong.

After the pipeline fix: `npm run audit:booster-baseline` must return to zero flags
(it will keep failing until then — that is its job), and the next Sunday
`set-baseline` capture self-corrects OP09's index.
