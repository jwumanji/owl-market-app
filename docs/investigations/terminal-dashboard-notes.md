# Terminal dashboard (Phase D) — build notes

**Date:** 2026-07-27 · **Branch:** `feat/moon-terminal` · **Agent:** Phase D UI subagent
**Scope:** discoveries during the dashboard build that contradict the spec or the phase brief. Implementation itself is documented in the code.

## 1 · The snapshot state moved mid-phase — pg_cron job 1 appears to fire

The brief (and a live probe at the start of this session) said exactly **one** `entity_type='set'` snapshot date existed: `2026-07-23`. Mid-session, a second full set appeared: **`2026-07-26`, 53 rows** — same shape as the 07-23 capture.

2026-07-26 was a **Sunday**; pg_cron job 1 is `40 23 * * 0` calling `capture_market_index_snapshots(…, current_date)`, which at 23:40 UTC Sunday produces exactly `snapshot_date = 2026-07-26`. This is the first empirical evidence the cron fires on schedule — spec §7's "has the cron ever fired?" open question now has a data point (a concurrent Phase C agent writing the rows is the alternative explanation; `cron.job_run_details` still settles it, per plan D2).

The dashboard needed no changes: the §2.3 carry-forward join picked up the second snapshot transparently. Value Ratio now has two points instead of one.

## 2 · `release_date` is null on all 44 tracked products

The brief flagged `display_name` nulls (handled — falls back to `name`) but not `release_date`: **all 44 tracked rows have `release_date = null`** (`msrp_usd` too, though the dashboard doesn't use it). Consequences:

- The spec §4 **RELEASE ranking chip** ships and reverses per spec, but every metric value renders as an em-dash and the sort is inert (null keys sort stably by name) until the column is backfilled.
- Product meta lines show only the set code, no release month.

No code change needed when data lands — it lights up automatically. Worth adding `release_date` backfill to the Phase C/E catalog work.

## 3 · Zero-snapshot games hide SET VALUE as well as VALUE RATIO

Spec §4's second empty state names only the VALUE RATIO chip/column. **SET VALUE reads the same service-role-only `market_index_snapshots` table**, so for a game with zero set snapshots a SET VALUE ranking mode would be precisely the "full grid of em-dashes" the spec forbids. The build hides **both** chips (and the table's SET VALUE / RATIO / RATIO-step columns) behind `hasSetSnapshots`, with the one-line explanation covering both. Verified live on `/games/lorcana/terminal/sealed`, where it composes with the no-tracked-products empty state.

## 4 · The `sets` embed needs an explicit FK hint

`sealed_products` now has **two** relationships to `sets` (the plain `set_id` FK plus v49's composite `sealed_products_set_game_fk`), so a bare `sets ( … )` embed fails with `PGRST201` (ambiguous). Loaders must write `sets!sealed_products_set_game_fk ( … )`. Phase E/F loaders will hit the same thing.

## 5 · 90D delta needs a tolerance at exactly-90-days depth

With the launch dataset (exactly 90 daily points, 2026-04-28 → 2026-07-26), a strict "row at or before latest − 90 days" lookup finds nothing — the target lands one day before the oldest row, so the whole 90D column would be em-dashes. `load-sealed.ts` allows a documented 7-day fallback to the earliest row for the 30D/90D deltas (0 days for 7D). Self-corrects as history accumulates past the JustTCG ceiling.

## Phase D verification

**Date:** 2026-07-27 · **Agent:** Phase D verification subagent (independent of the builder)
**Files under review (uncommitted, `feat/moon-terminal`):** `src/app/terminal/sealed/{load-sealed.ts, SealedTrackerClient.tsx, SealedTrackerContent.tsx, terminal.css, page.tsx}` + `src/app/games/[game]/terminal/sealed/page.tsx`
**Method:** static read of all six files; live-DB probes via PostgREST (service key, read-only); `npm run lint/build/audit:game-boundaries`; `npm run dev` + curl of all four routes with SSR-HTML inspection. No fixes applied.

### A · Build gates

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `npm run lint` | **PASS** | "No ESLint warnings or errors" |
| 2 | `npm run build` | **PASS** | exit 0 (so `owl-lens:check-types` passed too — it gates the build). Route table shows `○ /terminal/sealed` (static) and `● /games/[game]/terminal/sealed` with `/games/one-piece/terminal/sealed` prerendered, both `1h` revalidate. Static gen ran against the live post-migration DB. |
| 3 | `npm run audit:game-boundaries` | **PASS** | exit 0 first try (no `tcg_source_records` timeout this run). "Result: PASS · Games checked: one_piece, riftbound · Cross-game issues: 0 · Missing game_id rows: 0". No riftbound-private failure. |

### B · Code-level acceptance criteria

| # | Check | Result | Evidence |
|---|---|---|---|
| 4 | No service-role client reachable from client code | **PASS** | `createCachedServiceClient` appears only in `load-sealed.ts`. The only `"use client"` file in the terminal tree is `SealedTrackerClient.tsx`; it imports from `./load-sealed` via `import type` only (type-erased at compile). Data arrives exclusively as the `data` prop from `SealedTrackerContent` (server). |
| 5 | `game_id` on every query; `region` where the column exists | **PASS** | Live OpenAPI probe confirms: `sealed_products` has `region`, `market_index_snapshots` has `region`, `sealed_product_price_history` has `game_id` but **no** `region`. Loader queries: `sealed_products` → `.eq(game_id).eq(region,'en').eq(is_tracked,true)`; `sealed_product_price_history` → `.eq(game_id)` (region correctly absent); `market_index_snapshots` ×2 → `.eq(game_id).eq(region,'en').eq(entity_type,'set')`. All four queries paginate `.range()` at 1000. |
| 6 | Zero refs: `sellers`, `--gain`, `--loss`, `useSearchParams`, `RarityBadge` | **PASS** | Grep over the terminal tree: `sellers` 0; `RarityBadge` 0; every `--gain`/`--loss` occurrence is the `-2` form (client:88 ternary, css:158 comment, css:160/161/593/863 `var(--gain-2)`/`var(--loss-2)`); `useSearchParams` appears once **in a comment** (client:16, stating it is not used) — no code reference. |
| 7 | Every `var(--*)` resolves | **PASS** | 24 unique tokens referenced. Defined in `globals.css`: `--bg/-2/-3`, `--ink/-2/-3`, `--coral`, `--gold`, `--gain-2`, `--loss-2`, `--line`, `--grad-brand`, `--breadcrumb-accent/-active`, `--r-sm/md/lg/pill`. Defined in `terminal.css`: `--w-metric`, `--w-prod` (on `.terminal-dash` + media overrides). Font tokens `--font-jetbrains-mono/space-grotesk/caveat` resolve via `next/font` `variable:` in `src/app/layout.tsx` (not globals.css — they do resolve at runtime). None dangling. |
| 8 | Em-dash for missing, `--ink-3` at exactly zero | **PASS** | `fmtMoney/fmtPct/fmtMult` all return `EM = "—"` on null. `deltaCls(v)` returns `t-flat` for `null \|\| v === 0`; `.terminal-page .t-flat { color: var(--ink-3) }`. `tintStyle(0)` → no tint (`abs < 0.15` guard). Missing grid periods render `<span class="t-cell t-flat">—</span>`. Nuance, not a failure: a cell **with** a price but a null step delta shows a mid-dot `·` on the delta sub-line (the price value itself is never dash-substituted); zero deltas render `0.0%` in t-flat. |
| 9 | localStorage view persistence | **PASS** | Key `owl-terminal-sealed-view`; written in `setView()` on every change; read in `useEffect(…, [])` **after mount** with value whitelist — initial state `"grid"` on server and first client render, so no hydration mismatch. Grid is default; button order GRID·TABLE·CARDS is static JSX. try/catch on both storage calls. |
| 10 | Ratio chips/columns hidden at zero snapshots + composition | **PASS** | `hasSetSnapshots` computed game-wide (query 4, not just tracked sets). `visibleModes` drops both `ratio` **and** `setval` chips; table view's SET VALUE / RATIO / RATIO-step columns gated on `hasRatio`; `effectiveMode` falls back to `trending`. One-line explanation `.terminal-ratio-note`. Composes with `boxes.length === 0` empty state — both render together (verified live on lorcana, below). Hiding SET VALUE too goes beyond the spec's literal text but is the documented §3 decision above — correct, since both metrics read the same table. |
| 11 | §2.3 carry-forward with the new 07-26 snapshot | **PASS** | `carryForward()` returns the latest snapshot with `snapshot_date ≤ day` over an ascending list — steps, never gaps. Live: `market_index_snapshots` now has 53 rows at 2026-07-23 **and** 53 at 2026-07-26 (one_piece, entity_type='set'). SSR payload for "500 Years in the Future - Booster Box" (OP07, latest price_date 2026-07-26): `setValue: 28413.19` = the **07-26** row's `index_value` (07-23's 28397.27 appears nowhere in the page); `valueRatio: 81.504…` = 28413.19 / 348.61 exactly. Weekly `setValues`: `[null ×11, 28413.19]` — nulls are correct (no snapshot exists ≤ any period end before 07-23; W11 ends 07-19). Nuance: series-level carry-forward keys on the period **end** day rather than the last price date inside the period — identical today (anchor = last-day-with-data) and inert, but if ingestion froze mid-month the monthly set value could post-date the month's last price by a few days. Top-level `setValue`/`valueRatio` use the strict price-date rule. |

### C · Runtime (npm run dev, localhost:3000)

| # | Check | Result | Evidence |
|---|---|---|---|
| 12 | `/terminal/sealed` | **PASS** | 200. SSR HTML contains `terminal-stat-rail` (SEALED INDEX / BREADTH / TOP GAINER / TOP LOSER), all six ranking chips (`TRENDING·VALUE RATIO·PRICE·SET VALUE·OFF ATH·RELEASE`), `terminal-grid-view` + legend, GRID/TABLE/CARDS buttons. No "Data unavailable", no empty state. 23 `<tr>` = header + 22 booster_box rows (client filters `product_type === 'booster_box'`; the other 22 tracked rows are `booster_box_case`, behind CASES·SOON). |
| 13 | `/games/one-piece/terminal/sealed` | **PASS** | 200, byte-for-byte same content shape (all markers identical, 442 $-figures vs 434). |
| 14 | `/games/lorcana/terminal/sealed` | **PASS** | 200. Composed empty state: `.terminal-empty` "No tracked sealed products for Disney Lorcana yet…" **and** `.terminal-ratio-note` "SET VALUE & VALUE RATIO UNAVAILABLE — NO SET-VALUE SNAPSHOTS EXIST FOR DISNEY LORCANA YET." Ratio/set-value chips absent, no grid markup, no em-dash grid (14 em-dashes total = the four stat-rail tiles' placeholders), no error. |
| 15 | `/games/riftbound/terminal/sealed` | **PASS** (with a dev/prod nuance) | 200, renders the same composed empty state as lorcana. Nuance: in dev `allowsPrivateGamePreview()` is true (`NODE_ENV !== 'production'`), so the private game resolves and shows its name. In production `publicOnly` becomes true → `resolveGameScope` errors → the content's catch renders the "Data unavailable" placeholder at 200. Both are defined states; no 500 path. Riftbound is not in `generateStaticParams` (build prerendered only one-piece). |
| 16 | Real prices + 07-26-informed set values in SSR | **PASS** | Visible grid carries real dollars — 434 `$n` figures incl. `$349` for the 500 Years box ($348.61 rounded, price_date 2026-07-26); SEALED INDEX tile `$815 ▲ +0.2% W/W`. Set values live in the RSC flight payload (the set-value **column** only renders in table/ratio views, which are client state): `setValue: 28413.19` matches the live `market_index_snapshots` row (set `d2092b0d…` = OP07, `snapshot_date: 2026-07-26`, `index_value: 28413.19`) — independently probed before fetching the page. |

### Verdict

**16 / 16 PASS. No blocking defects found.** Phase D meets the checked subset of spec §8 (build gates, service-role isolation, game/region scoping, token hygiene, missing-data and zero-delta rendering, view persistence, both empty states, carry-forward including the new 07-26 snapshot, and live rendering on all four routes).

Non-blocking observations, in case later phases care:

1. **`globals.css` gain/loss values differ from CLAUDE.md §6** — repo has `--gain-2: #1F6F47` / `--loss-2: #B83232`; CLAUDE.md documents `#2D9961` / `#E04E4E`. Tokens exist and resolve (which is what the criterion checks); the value drift is pre-existing on this branch, not a Phase D change.
2. **"12M %" is an 11-step delta** — `monthDelta(monthlyPrices, 11)`: 12 calendar-month columns span 11 month-over-month steps. Defensible (current month vs oldest column) but the header reads "12M".
3. **Sparklines compress gaps** — `Spark` filters nulls and spaces surviving points evenly, so a series with missing middle periods draws without visual gaps.
4. **Delta placeholder is `·` not `—`** inside populated cells (see check 8) — a deliberate sub-line placeholder, distinct from the em-dash used for genuinely missing values.
5. **`useSearchParams` survives as a comment** (SealedTrackerClient.tsx:16) — a naked grep for the string will hit it; it is documentation, not usage.
