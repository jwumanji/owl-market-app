# Value Ratio population audit — promos and event reprints in `index_value`

**Date:** 2026-07-27 · **Status:** COMPLETE — read-only audit, no DB writes, no code changes
**Question (Justin, verbatim):** *"market_index_snapshots.index_value is the set value behind Value
Ratio, and it groups on printed_set_code. Check whether promos and event reprints inflate it the same
way [as Box EV]. If they do, Value Ratio is wrong on every set with heavy promo overlap — and that
already shipped in the Phase D dashboard."*

**Verdict: yes — same mechanism, same population, larger blast radius.** The `printed_set_code`
population that polluted Box EV (pull-rates sensitivity appendix §S.2) is byte-for-byte the population
`capture_market_index_snapshots` sums into `index_value`. Game-wide, **45.5% of the total One Piece
set-value index ($170,554 of $374,888) is promo/event/non-booster cards**; 36 of 50 non-empty sets
carry >15% promo share; under the shipped VALUE RATIO ranking mode **7 of 22 booster boxes move more
than 2 positions** when the numerator is restricted to the booster-baseline population. It is
predominantly **level** inflation — week-over-week trends were intact across the two stored snapshot
dates — but promo repricing events inject episodic set-level spikes (a live +23.8% OP07 example below).

---

## 1 · Method

Read-only probe against the live DB (PostgREST, service role, GETs only), 2026-07-27. Script run from
the session scratchpad (`value-ratio-audit.mjs`); everything needed to reproduce is stated here.

- **Population** — exactly the capture function's: `cards` where `game_id = one_piece`,
  `region = 'en'`, grouped on `printed_set_code`, deduped on `card_image_id` (max price kept;
  0 duplicates and 0 null image ids found — 4,678 cards). Codes iterated = the 53 stored snapshot
  codes; the churn artifact code `"N"` (6 DON!! cards) exists in today's catalog, is absent from the
  stored 53, and is excluded here as the backfill did.
- **Price basis** — `price_stats.tcg_market` via the `price_stats!price_stats_card_game_fk` embed,
  prices > 0 only. This is the basis `capture_market_index_snapshots` sums
  (`set-value-backfill.md` §3), so reconstructed totals are directly comparable to stored
  `index_value`.
- **Classifier** — the booster-baseline population rule from the pull-rates sensitivity appendix
  (populations B/C, §S.4 exclusion list, §5 PR line), explicit `includes()` only, never regex
  (CLAUDE.md §8). A card is **excluded** from the booster baseline when any of:
  1. `card_image_id` starts with `P-` (promo ids);
  2. `card_image_id` contains one of `-winner-pack`, `-regional-prize`, `-championship-prize`,
     `-cs-pack`, `-judge-pack`, `-premium-card-collection`, `-welcome-pack`, `-learn-together`,
     `-other` (event ids);
  3. rarity ∈ {R, UC, C} and (`card_image_id` contains `_p` or name contains "Box Topper")
     (base-rarity parallels — population C's vanilla-bulk rule);
  4. rarity = `PR` (appendix §5: "not pulled from boosters; excluded").
- **Attribution** (game-wide excluded value): promo `P-*` ids **$159,624 over 651 cards** ·
  event ids $7,025 / 219 · base-rarity parallels $3,570 / 284 · plain-id `PR` rarity $335 / 15.
  The `P-*` prefix is ~94% of the damage. Known residual leaks (appendix §S.4: plain-id promos like
  `OP04-015`) are not caught by this classifier — the shares below are floors, not ceilings.
- **Shipped Value Ratio** — recomputed exactly as `load-sealed.ts` does: latest
  `sealed_product_price_history` price per tracked product (38 of 44 at 2026-07-26; 5 at 07-14, 1 at
  07-21), set value = carry-forward of stored `market_index_snapshots` `index_value` by `set_id` at
  that date (= the stored 2026-07-26 batch for current rows), ratio = set value ÷ box price.
  **Booster-baseline Value Ratio** = (reconstructed total − excluded sum) ÷ the same box price.
- **Ranking mode** — `SealedTrackerClient.tsx`: the VALUE RATIO chip renders **booster boxes only**
  (cases are disabled "SOON"), sorted descending on `valueRatio`, nulls last, name tiebreak. Cases are
  ranked separately below under identical semantics since they ship next.

## 2 · Basis validation — PASSED

Reconstructed stats-basis sums vs the stored `snapshot_date = 2026-07-26` batch
(captured 2026-07-26T23:40:00.225203Z by pg_cron): **median |Δ| 0.26% over 51 comparable sets** —
the basis reproduces. Every delta beyond ±2% was chased to a named cause before proceeding; all are
post-capture price movement or documented catalog churn, not method failure:

| set | stored 07-26 | recon (today) | Δ | cause (verified per card) |
|---|---:|---:|---:|---|
| OP07 | 28,413.19 | 35,173.41 | **+23.8%** | `P-OP07-119` Ace (Serial Numbered) repriced $3,200 → $9,950 at 2026-07-27T00:01 — +$6,750 of the +$6,760 set delta. A promo card, and itself a live demo of the defect |
| OP05 | 44,892.51 | 48,856.54 | +8.8% | `P-OP05-091` Rebecca repriced $4,000 → $8,000 at 07-27T00:01 |
| EB01 | 12,380.93 | 11,576.94 | −6.5% | `EB01-006_p2` Chopper Manga (MR — a legitimate booster card) repriced $3,200 → $2,400 at 07-27T06:01 |
| OP15 | 2,587.24 | 2,243.31 | −13.3% | catalog churn: stored batch is pre-churn (147 cards), today 146 — the known ~$284 deletion (`set-value-backfill.md` §3) plus movement |
| OP16 | 25.60 | 0 | −100% | catalog-deleted set (0 cards today) — known churn |
| ST23 / ST05 / ST26 / OP04 | — | — | +23.0% / +9.5% / +5.1% / +6.1% | small sets, small absolute moves (+$3.38, +$3.45, +$29.86, +$206.63) — ordinary daily repricing |

All other card counts match the stored batch exactly (the stored batch's counts are pre-churn:
OP15 147, P 297, OP16 present — per the backfill doc's "cron saw a pre-churn catalog" anomaly).
Deltas were documented, not chased further, per brief.

## 3 · Full 53-set table (stats basis, 2026-07-27)

stored = `index_value` @ 07-26 · recon = reconstructed total · excl = excluded (promo/event/non-booster)
sum · share = excl ÷ recon · baseline = recon − excl (booster-baseline set value) · top excluded card.

| set | stored 07-26 | recon | Δ% | excl $ | share % | baseline $ | largest excluded card |
|---|---:|---:|---:|---:|---:|---:|---|
| EB01 | 12,380.93 | 11,576.94 | −6.49 | 6,030.76 | 52.1 | 5,546.18 | `P-EB01-012` $1,850.00 |
| EB02 | 9,173.21 | 9,166.16 | −0.08 | 1,492.96 | 16.3 | 7,673.20 | `P-EB02-010` $1,370.98 |
| EB03 | 7,244.31 | 7,244.31 | 0.00 | 0 | 0 | 7,244.31 | — |
| EB04 | 1,467.32 | 1,482.26 | +1.02 | 0 | 0 | 1,482.26 | — |
| OP01 | 24,678.43 | 24,646.17 | −0.13 | 11,040.93 | 44.8 | 13,605.24 | `P-OP01-120` $2,900.00 |
| OP02 | 12,049.27 | 12,333.11 | +2.36 | 7,559.68 | 61.3 | 4,773.43 | `P-OP02-099` $2,200.00 |
| OP03 | 7,892.63 | 7,931.25 | +0.49 | 4,949.80 | 62.4 | 2,981.45 | `P-OP03-013` $999.99 |
| OP04 | 3,362.86 | 3,569.49 | +6.14 | 340.31 | 9.5 | 3,229.18 | `P-OP04-010` $100.05 |
| OP05 | 44,892.51 | 48,856.54 | +8.83 | 13,367.32 | 27.4 | 35,489.22 | `P-OP05-091` $8,000.00 |
| OP06 | 20,548.72 | 20,926.87 | +1.84 | 7,479.66 | 35.7 | 13,447.21 | `P-OP06-069` $2,782.67 |
| OP07 | 28,413.19 | 35,173.41 | +23.79 | 20,189.79 | 57.4 | 14,983.62 | `P-OP07-119` $9,950.00 |
| OP08 | 11,408.27 | 11,418.79 | +0.09 | 2,682.21 | 23.5 | 8,736.58 | `P-OP08-020` $700.00 |
| OP09 | 48,632.90 | 48,560.82 | −0.15 | 24,343.57 | 50.1 | 24,217.25 | `P-OP09-002` $8,999.00 |
| OP10 | 6,983.47 | 6,990.63 | +0.10 | 5,348.54 | 76.5 | 1,642.09 | `P-OP10-005` $2,499.98 |
| OP11 | 6,276.00 | 6,292.26 | +0.26 | 3,350.19 | 53.2 | 2,942.07 | `P-OP11-119` $899.00 |
| OP12 | 6,996.49 | 7,028.65 | +0.46 | 4,463.20 | 63.5 | 2,565.45 | `P-OP12-015` $1,866.67 |
| OP13 | 38,394.04 | 38,404.54 | +0.03 | 2,413.59 | 6.3 | 35,990.95 | `OP13-091_p2` $494.11 |
| OP14 | 6,016.02 | 6,035.89 | +0.33 | 3,499.78 | 58.0 | 2,536.11 | `P-OP14-112` $3,499.78 |
| OP15 | 2,587.24 | 2,243.31 | −13.29 | 0 | 0 | 2,243.31 | — |
| OP16 | 25.60 | 0 | −100 | 0 | — | 0 | — (catalog-deleted) |
| P | 18,142.13 | 18,265.96 | +0.68 | 18,265.96 | 100 | 0 | `P-P-001` $1,800.00 |
| PRB01 | 111.67 | 110.99 | −0.61 | 0 | 0 | 110.99 | — (2-card population, §7 of pull-rates) |
| PRB02 | 10,622.07 | 10,633.74 | +0.11 | 8,898.99 | 83.7 | 1,734.75 | `P-PRB02-005` $8,898.99 |
| ST01 | 15,637.64 | 15,622.67 | −0.10 | 9,211.77 | 59.0 | 6,410.90 | `P-ST01-013` $3,000.00 |
| ST02 | 502.73 | 511.16 | +1.68 | 301.47 | 59.0 | 209.69 | `P-ST02-008` $89.12 |
| ST03 | 2,246.94 | 2,249.59 | +0.12 | 1,283.33 | 57.1 | 966.26 | `P-ST03-008` $780.32 |
| ST04 | 1,580.35 | 1,583.34 | +0.19 | 1,426.06 | 90.1 | 157.28 | `P-ST04-008` $700.00 |
| ST05 | 36.35 | 39.80 | +9.49 | 28.03 | 70.4 | 11.77 | `P-ST05-004` $18.66 |
| ST06 | 911.24 | 910.98 | −0.03 | 825.29 | 90.6 | 85.69 | `P-ST06-012` $779.68 |
| ST07 | 1,122.09 | 1,121.88 | −0.02 | 1,113.02 | 99.2 | 8.86 | `P-ST07-010` $950.00 |
| ST08 | 25.33 | 25.99 | +2.61 | 15.51 | 59.7 | 10.48 | `P-ST08-002` $15.51 |
| ST09 | 51.36 | 51.84 | +0.93 | 42.56 | 82.1 | 9.28 | `P-ST09-012` $39.13 |
| ST10 | 3,718.68 | 3,743.53 | +0.67 | 3,436.62 | 91.8 | 306.91 | `P-ST10-010` $1,251.96 |
| ST11 | 21.07 | 22.11 | +4.94 | 15.97 | 72.2 | 6.14 | `P-ST11-003` $12.64 |
| ST12 | 559.59 | 560.03 | +0.08 | 462.69 | 82.6 | 97.34 | `P-ST12-008` $449.99 |
| ST13 | 1,877.31 | 1,875.09 | −0.12 | 1,506.49 | 80.3 | 368.60 | `P-ST13-003` $730.27 |
| ST14 | 171.59 | 171.76 | +0.10 | 1.65 | 1.0 | 170.11 | `ST14-013_p1` $0.55 |
| ST15 | 1,170.21 | 1,170.83 | +0.05 | 885.00 | 75.6 | 285.83 | `P-ST15-005` $885.00 |
| ST16 | 432.43 | 437.76 | +1.23 | 183.61 | 41.9 | 254.15 | `P-ST16-005` $180.20 |
| ST17 | 1,528.86 | 1,527.52 | −0.09 | 1,491.44 | 97.6 | 36.08 | `P-ST17-003` $899.50 |
| ST18 | 1,493.62 | 1,493.45 | −0.01 | 728.96 | 48.8 | 764.49 | `P-ST18-003` $724.94 |
| ST19 | 6.73 | 6.85 | +1.78 | 3.53 | 51.5 | 3.32 | `P-ST19-002` $3.36 |
| ST20 | 3.43 | 3.37 | −1.75 | 0.15 | 4.5 | 3.22 | `ST20-003_p1` $0.15 |
| ST21 | 2,151.43 | 2,151.23 | −0.01 | 1,847.31 | 85.9 | 303.92 | `P-ST21-014` $1,720.22 |
| ST22 | 68.01 | 68.09 | +0.12 | 26.42 | 38.8 | 41.67 | `ST22-010_p1` $7.02 |
| ST23 | 14.69 | 18.07 | +23.01 | 0 | 0 | 18.07 | — |
| ST24 | 9.81 | 9.81 | 0.00 | 0 | 0 | 9.81 | — |
| ST25 | 2.91 | 2.91 | 0.00 | 0 | 0 | 2.91 | — |
| ST26 | 581.67 | 611.53 | +5.13 | 0 | 0 | 611.53 | — |
| ST27 | 2.26 | 2.26 | 0.00 | 0 | 0 | 2.26 | — |
| ST28 | 2.16 | 2.16 | 0.00 | 0 | 0 | 2.16 | — |
| ST29 | 0 | 0 | — | 0 | — | 0 | — (empty set) |
| ST30 | 0 | 0 | — | 0 | — | 0 | — (empty set) |

Clean sets (0% share): EB03, EB04, OP15, PRB01, ST23–ST28 — plus near-clean OP13 (6.3%), OP04 (9.5%),
ST14, ST20. The set `P` is definitionally 100% promo — its baseline set value is $0.

## 4 · Tracked-product ranking impact (44 products: 22 boxes + 22 cases)

### 4.1 Booster boxes — the shipped VALUE RATIO mode

shipped = ratio the dashboard renders today (stored 07-26 snapshot carry-forward ÷ latest box price) ·
baseline = booster-baseline set value ÷ same price. Rank: desc, nulls last (dashboard semantics).
**14 of 22 boxes change rank; 7 move more than 2 positions (marked ▲▼).**

| shipped rank → baseline rank | set | product | price | shipped ratio | baseline ratio |
|---|---|---|---:|---:|---:|
| 1 → 1 | OP13 | Carrying On His Will | $393.74 | 97.5× | 91.4× |
| 2 → 2 | OP07 | 500 Years in the Future | $348.61 | 81.5× | 43.0× |
| 3 → 3 | OP09 | Emperors in the New World | $672.23 | 72.4× | 36.0× |
| 4 → 5 | OP06 | Wings of the Captain | $383.33 | 53.6× | 35.1× |
| 5 → 4 | OP08 | Two Legends | $242.57 | 47.0× | 36.0× |
| 6 → 6 | OP05 | Awakening of the New Era | $1,184.67 | 37.9× | 30.0× |
| **7 → 14 ▼** | OP10 | Royal Blood | $239.06 | 29.2× | 6.9× |
| **8 → 19 ▼** | PRB02 | Premium Booster Vol. 2 | $395.05 | 26.9× | 4.4× |
| 9 → 10 | OP12 | Legacy of the Master | $271.83 | 25.7× | 9.4× |
| **10 → 7 ▲** | EB03 | Heroines Edition | $302.45 | 24.0× | 24.0× |
| 11 → 9 | OP14 | The Azure Sea's Seven | $266.31 | 22.6× | 9.5× |
| 12 → 13 | OP02 | Paramount War | $605.01 | 19.9× | 7.9× |
| 13 → 11 | OP01 | Romance Dawn (Wave 2) | $1,553.16 | 15.9× | 8.8× |
| **14 → 17 ▼** | OP03 | Pillars of Strength | $541.76 | 14.6× | 5.5× |
| 15 → 16 | EB01 | Memorial Collection | $872.21 | 14.2× | 6.4× |
| **16 → 8 ▲** | EB02 | Anime 25th Collection | $802.18 | 11.4× | 9.6× |
| **17 → 12 ▲** | OP15 | Adventure on Kami's Island | $257.16 | 10.1× | 8.7× |
| 18 → 18 | OP11 | A Fist of Divine Speed | $639.75 | 9.8× | 4.6× |
| **19 → 15 ▲** | OP04 | Kingdoms of Intrigue | $504.56 | 6.7× | 6.4× |
| 20 → 20 | OP01 | Romance Dawn (Wave 1) | $6,294.17 | 3.9× | 2.2× |
| 21 → 21 | PRB01 | Premium Booster | $948.49 | 0.1× | 0.1× |
| 22 → 22 | OP16 | The Time of Battle | $207.36 | 0.1× | 0.0× |

The podium (OP13 / OP07 / OP09) survives — those sets' values are large enough that even halving the
numerator doesn't unseat them — but the mid-table scrambles. The worst distortions are single-card:
PRB02 falls 11 places because $8,899 of its $10,634 "set value" is one promo (`P-PRB02-005`); OP10
falls 7 places on 76.5% promo share. Clean sets (EB03, OP15, EB02, OP04) are all currently
**under-ranked** — every polluted set above them borrows rank from promo paper that is not in the box.
Note also that even rank-stable rows are level-wrong: OP07 shows 81.5× where the booster population
supports 43.0×.

### 4.2 Cases — same semantics, not yet rendered (cases are "SOON" in the client)

**16 of 22 change rank; 7 move more than 2 positions:** PRB02 7→18 ▼, OP10 8→16 ▼, OP03 11→15 ▼,
EB03 13→7 ▲, OP01 Wave 2 14→10 ▲, EB02 16→9 ▲, OP15 18→13 ▲. Same drivers as the boxes —
whenever cases ship, they inherit the identical distortion.

## 5 · Trend stability — level inflation, with episodic spikes

Promo share per set at both stored snapshot dates, computed on a consistent per-card as-of basis from
`price_history` at each capture's exact cutoff (2026-07-23T09:45:14.932882Z and
2026-07-26T23:40:00.225203Z; 89,657 rows). Caveat: the history basis diverges from the stats basis on
a class of promo cards (`set-value-backfill.md` §3), so absolute history-basis shares can run hot —
but the *delta between the two dates* is basis-consistent, which is what trend stability needs.

**Result: shares are static across the window. Per-set share delta 07-23 → 07-26: median |Δ| 0.01
percentage points, max 2.93 pts (ST21, 88.80% → 85.87%), n = 50.** Examples: OP07 48.02% → 48.00%,
OP10 74.80% → 74.73%, PRB02 83.81% → 83.81%. So over this window the pollution is a **level** effect:
W/W and M/M ratio deltas on the dashboard were essentially undistorted, because the promo component
moved with (i.e., barely at all, like) the rest.

**But the stability is episodic, not guaranteed — measured live this morning.** After the 07-26
capture, `P-OP07-119` (Ace, Serial Numbered) repriced $3,200 → $9,950 and `P-OP05-091` (Rebecca)
$4,000 → $8,000 (both at 2026-07-27T00:01). On today's stats basis OP07's promo share is already
57.4% (from 48.0%) and OP05's 27.4% (from 23.2%). When the next Sunday capture (2026-08-02) lands,
OP07's official set value will print roughly **+24% W/W on a serial-numbered promo alone** — a trend
spike with zero booster-population signal in it. Thin, erratically-priced promo chase cards are
precisely the cards most likely to do this. Verdict: **(b) trend distortion is real but episodic;
(a) level distortion is chronic and large.**

## 6 · Heavy promo overlap — sets above ~15% share

36 of 50 non-empty sets, spanning 16.3%–100%. The ones that back tracked sealed products (15 of the
21 box-backed sets — see §3 for each set's largest excluded card and price):

| share | sets (largest excluded card) |
|---|---|
| ≥ 75% | P 100% (`P-P-001` $1,800) · PRB02 83.7% (`P-PRB02-005` $8,899) · OP10 76.5% (`P-OP10-005` $2,500) |
| 50–75% | OP12 63.5% (`P-OP12-015` $1,867) · OP03 62.4% (`P-OP03-013` $1,000) · OP02 61.3% (`P-OP02-099` $2,200) · OP14 58.0% (`P-OP14-112` $3,500) · OP07 57.4% (`P-OP07-119` $9,950) · OP11 53.2% (`P-OP11-119` $899) · EB01 52.1% (`P-EB01-012` $1,850) · OP09 50.1% (`P-OP09-002` Uta $8,999) |
| 15–50% | OP01 44.8% (`P-OP01-120` $2,900) · OP06 35.7% (`P-OP06-069` $2,783) · OP05 27.4% (`P-OP05-091` $8,000) · OP08 23.5% (`P-OP08-020` $700) · EB02 16.3% (`P-EB02-010` $1,371) |
| starter decks | every ST set with promo variants sits 39–99% (ST07 99.2%, ST17 97.6%, ST10 91.8%, ST06 90.6%, ST04 90.1%, ST21 85.9%, …) — relevant when deck products ever get a Value Ratio |

## 7 · What this means

**(a) Level inflation — cross-set ranking distortion, and it shipped.** The Phase D dashboard's VALUE
RATIO mode ranks boxes on a numerator that is 6–84% promo/event paper for box-backed sets. That is not
a uniform tax — it varies per set by a factor of ~13 — so the *comparison between sets* is wrong, which
is the one job a ranking mode has. 7 of 22 rendered boxes are more than 2 positions from where the
booster-baseline population puts them; clean sets are systematically under-ranked. The same numerator
feeds SET VALUE mode, the ratio stat rail ("AVG VALUE RATIO"), the detail page's VALUE RATIO fact and
`pctOfSet` on the §3.4 top-10 (whose promo contamination the sensitivity appendix already flagged:
9 of 17 sets' #1 "top card" is a promo).

**(b) Trend distortion — episodic, not chronic.** Across 07-23 → 07-26 promo share was static
(median delta 0.01 pts), so W/W movement on the dashboard has been honest so far. But single promo
repricings measurably inject set-level spikes (OP07 will print ~+24% W/W at the next capture off one
serial-numbered card). Ratio *trends* are mostly intact; occasional spikes are promo artifacts.

**(c) What changing the definition costs.** The fix is not a loader tweak:

- `index_value` is produced by **`capture_market_index_snapshots` — a live DB function** (pg_cron
  job 1, weekly), and the table serves consumers beyond the sealed dashboard (sealed detail hero,
  `pctOfSet`, anything future that joins `entity_type='set'`). Changing the population means changing
  the function body — DDL through the approved hand-apply path, never the client (CLAUDE.md §2).
- **Every stored row is on the polluted basis** — the 2×53 genuine captures (07-23, 07-26) *and* the
  254 anchored backfill rows (06-21 → 07-19) written on 2026-07-27. Redefining the population in
  place creates a step-function cliff at the changeover date in exactly the series the backfill work
  just spent a cycle de-cliffing. Any in-place fix needs the same anchoring discipline (per-set
  factors, out-of-sample gate) — or an explicit decision to truncate and restart the series.
- The cleaner path is a **parallel metric, not a redefinition**: the table already carries
  `metric_version` (=1 everywhere). A booster-baseline series as `metric_version=2` (or a new
  `entity_type`) can accumulate alongside the existing one, leaving history intact and letting the
  dashboard opt in per surface. That also keeps the existing series comparable with its own past —
  "total printed-code paper value" is not a *wrong* metric, it is the wrong metric *for a box's
  Value Ratio*.
- Whatever mechanism, the exclusion rule itself has maintenance cost: the classifier here is the
  string-based booster-baseline rule, which the sensitivity appendix already noted leaks on plain-id
  promos (`OP04-015`-class). A flag column or curated exclusion list ages better than suffix matching
  — that decision should be made once, jointly for Box EV (§3.5) and Value Ratio, since both need the
  identical population.

**Answer to Justin's question, in one paragraph:** Confirmed — `index_value` is inflated by exactly
the population defect that broke Box EV, because both sum the same `printed_set_code` + `region='en'`
population; game-wide 45.5% of the One Piece set-value index is promo/event/non-booster cards, with
36 of 50 sets above 15% share (OP10 76.5%, PRB02 83.7%, OP07 57.4%). So Value Ratio as shipped is
wrong as a *cross-set* signal on every heavy-overlap set: 14 of the 22 rendered boxes change rank
under a booster-baseline numerator and 7 move more than 2 positions, with clean sets (EB03, OP15,
EB02) systematically under-ranked. It is mostly level inflation — promo share was static across the
two stored snapshot dates, so the shipped W/W trends have been honest — but promo repricings inject
episodic spikes (OP07 is about to print ~+24% W/W off one $9,950 serial-numbered promo). The fix is a
population change in `capture_market_index_snapshots` (a live DB function feeding other consumers),
and doing it in place would recreate the basis-cliff problem the backfill just solved — a parallel
booster-baseline series (e.g. `metric_version=2`) with the same anchoring discipline is the shape of
the fix.
