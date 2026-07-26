# JustTCG sealed coverage — probe findings

**Date:** 2026-07-26
**Probe scripts:** `C:\tmp` (run in a separate session; not committed to this repo)
**Status:** answers the open questions in `moon-terminal-sealed-spec.md` §7

> **CORRECTIONS — 2026-07-27, from Phase C execution.** Four claims below are
> superseded; the sections are left as written for the record.
>
> 1. **§2 — the param name was wrong, but the conclusion survives.** The history
>    param is **`priceHistoryDuration`**; `historyDuration` is not recognized, so
>    §2's "1y" probe was actually measuring the silent ~7-day default. Re-probed
>    2026-07-27 with the correct name: `=90d` returns the full 90 daily points;
>    `=1y` still degrades to ~7 recent points. **~90 days remains the hard
>    ceiling**; 30D/90D launch scope is unchanged. "4 requests, median 90 points"
>    holds **only** with `priceHistoryDuration=90d` explicitly set.
> 2. **§4 — the 86-vs-23 box gap was a probe artifact, not a real gap.** "86" was
>    a name-match (`box|display` minus `case`) that swept in starter-deck, tin and
>    deck-set displays. Matching the full 364-product feed on `justtcg_id`:
>    358/364 already had live rows, every real API booster box is present, and the
>    6 genuinely-new products all postdate the 07-14 catalog sync. The catalog was
>    neither stale nor filtered. Full diff: `sealed-catalog-reconcile.md`.
> 3. **§8 — the reconstruction method is blocked; the cutoff-skew explanation is
>    falsified.** Matching the capture run's exact cutoff does NOT remove the
>    residual. Root cause: `price_history` and `price_stats` record different
>    variants' prices for a class of promo/prize cards (5–700× disagreement), and
>    the capture function sums `price_stats` while the reconstruction sums
>    `price_history`. Worst set delta +33%. Zero rows were backfilled; three
>    candidate corrections await a decision. Full evidence:
>    `investigations/set-value-backfill.md`.
> 4. **§5 — the sealed table now has a scheduled writer**: `/api/sync/sealed-prices`,
>    daily 06:10 UTC via `config/game-sync-jobs.json` (Phase C), pending deploy.

This file exists because these results were derived once, in another session's
scrollback, and would otherwise have to be re-derived. Items 1–3 are from the JustTCG
API probe. Items 4–6 are from live-database recon done while writing migration v49.

---

## 1. Sealed price history EXISTS

**354 of 364 sealed products carry `{p, t}` daily history. Median 90 points.**

The §7 open question — *"confirm sealed variants carry price history"* — is answered
yes. Phase E is not at risk, and the backfill is trivial: **full catalog plus history
is 4 requests.**

This supersedes the earlier worry that snapshots would have to accumulate from day one
before the chart had anything to draw.

## 2. The `1y` duration parameter is BROKEN

**`historyDuration=1y` returns ~7 points, all only days old.** It does not return a
year. **~90 days is the hard ceiling on available history**, regardless of what is
requested.

Consequence for §3.2: **1Y and ALL cannot be served at launch.** Ship **30D and 90D
only**. Gate the longer timeframes on our own accumulated depth — once
`sealed_product_price_history` has been collecting daily for a year, 1Y becomes real
from our own rows rather than the provider's.

Note the existing singles job `/api/sync/justtcg-history` runs with
`historyDuration=1y`. Whether it hits the same ceiling for singles is untested and out
of scope here, but worth checking before trusting any 1Y singles chart.

## 3. No `sellers` field exists

**No `sellers`, `listings`, or `quantity` field is present on sealed variants.**
Confirmed by inspecting the payload, not inferred from absence in docs.

The supply-tightening signal in §3.3 cannot be built from JustTCG. Two real
liquidity signals are available instead:

| Replaces | Use | Reads as |
|---|---|---|
| sellers count | `priceChangesCount30d` | **PRICE ACTIVITY** — how often the price moved in 30 days |
| sellers W/W delta | age of `lastUpdated` | **LAST MOVE** — how long since it moved at all |

Both measure liquidity honestly: a product whose price has not moved in three weeks is
illiquid, which is the same thing a thin seller count was meant to tell us.

The `sellers` column stays on `sealed_product_price_history` (added by v49), nullable,
reserved for a possible eBay-sourced future. It is simply never populated by the
JustTCG job.

---

## 4. Catalog discrepancy — unresolved

The API returns **86 booster boxes and 29 cases**. The live `sealed_products` table
holds **23 and 23**. Either the existing sync filters them or the catalog is stale.

Not chased. Resolve during Phase C before backfilling, or Terminal launches missing
roughly two thirds of the boxes that exist.

## 5. Only the sealed price job is greenfield

**Corrects an earlier claim in this file.** An earlier pass said "neither table is on a
schedule". That checked `vercel.json` and Supabase edge functions but **not `pg_cron`**,
which was unreachable without SQL access. It is scheduled.

| table | scheduled? | by what |
|---|---|---|
| `market_index_snapshots` | **yes** | `pg_cron` job 1, active, `40 23 * * 0` — Sunday 23:40 UTC, calling `capture_market_index_snapshots(games.id, current_date)` for one_piece |
| `sealed_product_price_history` | **no** | nothing — no cron, no route, no function |

So **the set-value job already exists.** Phase C only needs the sealed price job plus a
cron entry. That is materially smaller than "build two jobs".

**Open question — has the cron ever fired?** The only snapshot is `2026-07-23`, a
**Thursday**, captured at `09:45 UTC`. A Sunday 23:40 job would produce Sunday dates at
23:40. So the existing rows came from a manual invocation, not the schedule, and there
are no rows for the preceding Sundays (07-19, 07-12). Either the job was created after
07-19 and has not yet fired, or it is failing silently. **Check `cron.job_run_details`
before relying on it.**

Both tables still hold exactly one date each — 356 price rows sharing one `recorded_at`
(2026-07-14), 751 index rows sharing one `captured_at` (2026-07-23).

Consequence today: **Value Ratio computes to null for every product.** The only price
date is 07-14 and the only index snapshot is 07-23; there is no snapshot at or before
any price, so the §2.3 join finds nothing.

## 6. `capture_market_index_snapshots` — body retrieved

Signature: `capture_market_index_snapshots(p_game_id uuid default null,
p_snapshot_date date default null) returns json`. **Three INSERTs, all with explicit
column lists** — which is why v49's `add column region` is safe and was applied whole.

What the body revealed:

1. **Value Ratio's source already exists.** For `entity_type='set'`, `index_value =
   sum(tcg_market)` over priced cards in the set. That *is* set value — already
   computed, scheduled and game-scoped. **Do not build a second rollup.** Join on
   `set_id` + `snapshot_date`.

2. **It is weekly**, against daily box prices. Consumers must **carry forward the last
   known set value between snapshots and never blank the ratio** (see §2.3).

3. **Natural key: `market_index_snapshots_entity_day_key` on `(game_id, entity_type,
   entity_key, snapshot_date)`. No `region`.** v49 deliberately did not touch it, so
   `region` is inert until *both* the function and this constraint change. JP rollups
   need both.

4. **`cards.region = 'en'` is hardcoded** for one_piece, so `region='en'` on existing
   rows is accurate rather than assumed.

5. **The grouping key is `printed_set_code`, not `set_id`** — see §8. `set_id` is
   resolved for display via a lateral join matching `sets` by code.

## 7. `set_id` join integrity — clean today, not guaranteed

Checked because `capture_market_index_snapshots` populates `set_id` via a lateral join
matching `sets` by **code** (`entity_key`), so a code with no matching `sets` row would
leave `set_id` null and only `entity_key` populated.

**Result: 0 of 53 `entity_type='set'` rows have a null `set_id`.** Every sealed product
that has a `set_id` also has a matching snapshot — 44/44 boxes and cases, 366/366
overall. **An `entity_key` fallback would recover exactly 0 rows.**

Join on `set_id`. Do **not** build the fallback — it earns nothing and adds a second
join path to maintain. **Do** add an audit assertion that fails when
`entity_type='set' and set_id is null` returns more than 0, so a future code mismatch
surfaces as a build failure instead of a silently null Value Ratio.

Three reasons not to read this as "the FK is always there":

1. **It is a single-day sample.** All 53 snapshots come from one capture (2026-07-23)
   against a fully-populated One Piece set list. The join has not yet had an
   opportunity to fail.

2. **The same failure is already visible from the other side.** 14 sealed products have
   a null `set_id`, and every one is for a set absent from `sets`: *The World's
   Strongest Warriors*, Starter Decks 31–36, and the *Set Sail* / *Learn Together* deck
   sets. **The `sets` table is behind the JustTCG sealed catalog** — the same root cause
   as the 86-vs-23 box discrepancy in §4. When those sets are added, the rollup will
   match them by code, and any divergence between JustTCG's naming and the Bandai code
   is exactly when `set_id` lands null.

   Two of the 14 are a booster box and a case, so they can carry no Value Ratio at all.
   **The fix is assigning them a set, not a join fallback.**

3. **Game coverage is the larger gap.** All 53 set snapshots are One Piece. Riftbound
   has 7 sets and Lorcana 18 — **zero snapshots for either**. Value Ratio is null for
   every non-One-Piece product, not from a null `set_id` but because the rollup has
   never run for those games. `capture_market_index_snapshots(p_game_id)` takes a game
   parameter and was evidently only ever invoked with One Piece. Terminal launches on
   One Piece so this does not block v1, but the dashboard must degrade cleanly on
   "no snapshots for this game" — a different failure mode from "no snapshot for this
   set".

---

## 8. Backfilling set values from `price_history` — feasible, but shallow

**Investigated, not built.** Question: can historical set values be reconstructed from
`price_history` (which predates the 90-day sealed ceiling) to backfill
`market_index_snapshots`?

### The population is `printed_set_code`, not `set_id`

The single most important detail, and it is not obvious. A first attempt grouping cards
by `set_id` came out **65% low**. The function groups on **`cards.printed_set_code`**
with `region='en'`; `set_id` is only resolved afterwards for display. OP05 has 137 cards
by `set_id` but **287** by `printed_set_code` — the difference is OP05-numbered cards
living in promo and alt-art set rows.

Verified exactly against three stored snapshots:

| set | `printed_set_code` + `region='en'` | stored `card_count` |
|---|---:|---:|
| OP05 | 287 | 287 |
| OP01 | 245 | 245 |
| OP12 | 168 | 168 |

### The method validates

Reconstruction = for each card, latest non-null `tcg_market` at or before the target
date (as-of / carry-forward), summed per `printed_set_code`:

| set | stored `index_value` | reconstructed | delta |
|---|---:|---:|---:|
| OP12 | 7,011.71 | 7,014.49 | **+0.04%** |
| OP05 | 44,675.28 | 46,042.42 | **+3.06%** |
| OP01 | 24,617.93 | 25,645.59 | **+4.17%** |

The residual is intra-day skew: the cutoff used was end-of-day 07-23 while the function
ran at 09:45, so a few later-same-day prices leak in (OP05 rebuilt 273 priced vs 270
stored). **Matching the cron's actual run time removes it.** Do that — otherwise
backfilled weeks run ~3% hot against future cron output and the series has a visible
step at the join.

### Depth is the real limit — about 6 usable weeks

Walking OP05 backwards, with median staleness of the carried-forward prices:

| week ending | priced | staleness p50 | reconstructed |
|---|---:|---:|---:|
| 2026-07-19 | 273/287 | 1d | $46,025 |
| 2026-07-12 | 272/287 | 4d | $46,525 |
| 2026-07-05 | 272/287 | 1d | $46,587 |
| 2026-06-28 | 272/287 | 2d | $46,221 |
| 2026-06-21 | 272/287 | 1d | $43,854 |
| 2026-06-14 | 269/287 | **67d** | $32,676 |
| 2026-05-10 → 04-12 | 260/287 | 32→4d | **$27,583 every week** |

Below 2026-06-21 the values freeze — five consecutive "weeks" return an identical
$27,583 because no new prices landed. **That is not history, it is a flat line.** The
global picture agrees: weekly catalog coverage sits at ~20% from January to mid-March,
is patchy through April–May, and only reaches 100% consistently from **2026-06-14**.

`price_history` spans 2025-12-27 → 2026-07-25 (91,783 rows; 88,089 One Piece, 100% with
non-null `tcg_market`), but depth ≠ usable depth.

### Verdict

**Worth doing, modest payoff.** It moves Value Ratio from 1 point to **~6 weekly
points** immediately. It does not deliver deep history — the singles pipeline only
became dense in mid-June, so there is nothing further back to recover.

Note the asymmetry: sealed box prices have ~13 weekly points available from JustTCG,
but Value Ratio needs both sides, so **the set-value side caps the chart at ~6 points**
regardless.

**Cost: roughly half a day.** ~89 paginated reads to pull One Piece `price_history`,
group into 53 codes × ~6 weeks ≈ 320 rows, upsert on the existing natural key. Low
risk — idempotent, and it never touches the function.

**Constraints if built:**

- Backfill **only from 2026-06-14 onward**. Skip any (set, week) whose median staleness
  exceeds ~10 days rather than emitting a frozen value.
- Write `chg_7d` / `chg_30d` as **null**, not 0, wherever the prior week is not
  credible. Computing them across carry-forward plateaus would render "0.0%" for five
  straight weeks, which is a fabrication.
- Use the cron's run time as the as-of cutoff, per above.
- Regression-check against the stored `2026-07-23` row before writing anything.

---

## What this changes in the spec

- §3.1 — sellers row in the facts panel → PRICE ACTIVITY / LAST MOVE
- §3.2 — timeframes drop to 30D · 90D; sellers column drops from the table view
- §3.3 — sellers stat card → PRICE ACTIVITY; TIGHTENING/LOOSENING removed
- §7 — both jobs greenfield; history backfill is 4 requests; sellers unavailable
- §8 — acceptance criteria drops from 4 timeframes to 2
