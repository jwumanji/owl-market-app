# Moon Terminal — Phases C–G execution plan

**Date:** 2026-07-26 · **Branch:** `feat/moon-terminal` · **Status:** awaiting Justin's approval
**Spec:** `docs/moon-terminal-sealed-spec.md` v2.0 · **Findings:** `docs/moon-terminal-justtcg-findings.md`

Subagents working any phase read this file plus the spec plus the findings doc before starting.
All investigation output goes to `docs/investigations/`, never chat-only.

---

## 0 — Verified starting state (live probes, 2026-07-26)

Probed via PostgREST with the service key; matches the findings doc exactly:

| Fact | Value |
|---|---|
| `sealed_products` | 380 rows, **0 tracked**, 44 opt-in candidates (box/case + set_id + active) |
| `sealed_product_price_history` | 356 rows, **all `price_date = 2026-07-14`**, source `justtcg` |
| `market_index_snapshots` `entity_type='set'` | 53 rows, **all `snapshot_date = 2026-07-23`** |
| `pull_rates` | exists, empty |
| v49 (`20260726143000_terminal_sealed`) | **applied** — columns live, `external_ref` backfilled |
| v50 (`20260726150000_…index_cleanup`) | file exists; applied state **unverifiable via PostgREST** (indexes invisible) — in the SQL check bundle below |

Repo facts that shape Phase C:

- **No sealed catalog/price sync exists in any git ref** — this branch or any of the codex branches. The 380-row catalog and the one-day price history were written by the out-of-repo Codex machine. The "existing sync" is not code we can read; our job is greenfield and must not assume a cooperating writer beyond idempotency.
- **The cron manifest machinery (`config/game-sync-jobs.json` + `scripts/sync-schedule-manifest.mjs`) exists only on codex branches** (commit `d15a08e`, present on `codex/market-index-snapshots-prod` among others). Our branch's `vercel.json` is hand-written and carries `maxSets=4` — the known dangerous drift (prod runs 1).
- The manifest script only manages `/api/sync/*?game=` entries; warm jobs pass through untouched. Script names on codex: `audit:sync-schedule` (check) / `sync-schedule:generate` (write).
- Sync routes authenticate with `Bearer $CRON_SECRET` (see `src/app/api/sync/justtcg/route.ts:70`).
- Phase A already scaffolded: both `terminal` layouts, both sealed `page.tsx`, `SealedTrackerContent.tsx`, `terminal.css`. `SealedTrackerClient.tsx` and `load-sealed.ts` do not exist yet — that's Phase D.

---

## 1 — Decisions reserved for Justin

Approving this plan approves **D1–D4**. **D5–D8** get asked when they become concrete; defaults noted.

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Phase C DML writes to the live DB (service role): (a) `is_tracked` opt-in — already authorized; (b) catalog-reconcile upserts into `sealed_products`; (c) ~32k-row 90-day backfill into `sealed_product_price_history`; (d) `slug` backfill on tracked products | Approve as a bundle — all idempotent, all reversible |
| **D2** | SQL check bundle Justin runs in the editor (read-only): `cron.job_run_details` for pg_cron job 1, v50-applied check via `pg_indexes` | Hand over at C0. Note: job 1's next scheduled fire is **Sunday 07-27 23:40 UTC** — if `job_run_details` is empty, Monday gives an empirical answer |
| **D3** | Set-value backfill (~6 weekly points, ~320 rows into service-role-only `market_index_snapshots`, findings §8 constraints) | **Do it** — half a day, moves Value Ratio from 1 point to ~6, validated to +0.04–4.17% |
| **D4** | Cron: port manifest machinery from `codex/market-index-snapshots-prod`, add sealed job daily **06:10 UTC**, regenerate `vercel.json` | Approve. Side effects flagged in §2·C3 below |
| **D5** | Missing sets (World's Strongest Warriors + ~9 others per findings §7): add `sets` rows so their products can be tracked? Touches public `/sets` | **Defer** — launch without them; exact list + proposed rows delivered in the C boundary report |
| **D6** | Seed `msrp_usd` = $103.68 for standard booster boxes (spec §9.1)? | **Defer** — MSRP rows hide when null, not blocking; ask at E boundary |
| **D7** | `pull_rates` seed data (Phase G): researched draft with sources + confidence presented for sign-off before any insert | Required stop — user-facing estimates |
| **D8** | `+ WATCHLIST` button (§3.1): no backend exists | Ship disabled stub; CSV export works client-side |

---

## 2 — Phase C · Sealed price sync

### C0 — Preflight (orchestrator, no subagent)

1. Run the is_tracked opt-in from v49 §7 (authorized): boxes/cases with non-null `set_id`, active → expect **44** tracked. Verify count live.
2. Hand Justin the D2 SQL bundle (written to `docs/investigations/sealed-preflight-checks.sql`).

### C1 — Catalog reconcile (ingestion subagent)

- Fetch the full JustTCG sealed catalog (`condition=Sealed`, 4 requests total incl. history — findings §1). Diff against the live 380.
- Resolve the **86-vs-23 booster box discrepancy**: classify each API-only product (new vs filtered vs renamed). Upsert missing products with `game_id` (one_piece), mapped `product_type` (real 17-value vocabulary, spec §2.2), `external_source/external_ref`, `set_id` resolved via `sets` by set slug/code. Products whose set doesn't exist in `sets` are inserted **untracked** with null `set_id` and listed for D5.
- Newly inserted boxes/cases with a resolved `set_id` get `is_tracked = true` (same criteria as the opt-in).
- Backfill `slug` for every tracked product (kebab from display name, unique per game — `uq_sealed_products_game_slug`).
- Output: `docs/investigations/sealed-catalog-reconcile.md` — the diff, the mapping table, the D5 list.

### C2 — Sync route (same ingestion subagent)

`src/app/api/sync/sealed-prices/route.ts`, following the existing route conventions (`CRON_SECRET` Bearer auth, JSON status body, `maxDuration` modest).

**Design: the daily job and the backfill are the same code path.** Each run fetches sealed variants with their `{p,t}` history (~90 days, 4 requests) and upserts every point not yet stored, keyed on `(sealed_product_id, source, price_date)`. First run = 90-day backfill; every later run = incremental top-up. This is inherently gated on `source_updated_at`: only provider-observed points are written, so a stale product contributes no manufactured rows — the flat-history trap in CLAUDE.md §9 can't occur. A missed cron day self-heals on the next run.

- Writes `price`, `low_price`, `source_updated_at`; `sellers` stays null (findings §3).
- Writes **only** `sealed_product_price_history`. The `sealed_products` price columns (`tcg_price`, `chg_*`, `ath`, `atl`) stay Codex-machine-owned — two writers on one column set is how silent clobbering starts. Terminal reads prices from our history table (spec §3.1 "pick one source").
- Cursor lessons applied: no cursor needed at 4 requests/run; any error recorded **before** any state write (the JP `writeCursor` trap, CLAUDE.md §9); provider-wide failure aborts rather than marching on (the eBay defect).
- Quota: 4 req/day against 1,000/day — negligible.
- Run the backfill by invoking the route locally against the live DB (D1c). Verify: per-product row counts, ~90 distinct dates, re-run produces zero new rows (idempotency proof).

### C3 — Cron (orchestrator)

Port `config/game-sync-jobs.json`, `scripts/sync-schedule-manifest.mjs`, and the two package.json script entries from `codex/market-index-snapshots-prod`. Add job `one_piece.justtcg.sealed_prices` at **`10 6 * * *`** (spec said 06:00, but 06:00 is taken by justtcg and 06:30 by jp-prices+warm — CLAUDE.md §10 says stagger). Regenerate `vercel.json`.

Two side effects, both intended but flagged:

1. **Our `vercel.json`'s justtcg entries reconcile `maxSets=4` → `1`** — this *fixes* the known drift that would otherwise quadruple quota use if this branch ever deploys.
2. The manifest declares riftbound jobs whose route code (`riftbound-sync.ts`) isn't on this branch. Harmless until this branch deploys; the trunk resolution merges both. Noted so nobody "cleans it up".

**The cron is inert until a production deploy carries the route + `vercel.json`.** That deploy is Justin's, via CLI, on his schedule. Until then the self-healing upsert means we lose nothing — any gap backfills on first fire.

### C4 — Verification (separate verification subagent)

- Live row-count assertions post-backfill; idempotency re-run; Value Ratio join returns non-null for `price_date >= 2026-07-23` (carry-forward per spec §2.3).
- `npm run lint` · `npm run build` · `npm run audit:game-boundaries` (retry on the known timeout).
- Output: `docs/investigations/sealed-sync-verification.md`.

### C5 — Set-value backfill (on D3 approval; ingestion subagent)

Per findings §8, all four constraints: only from 2026-06-14, skip staleness > 10d, `chg_*` null across plateaus, cron-run-time cutoff, regression-check against the stored 07-23 row before writing. Group on **`printed_set_code`**, never `set_id`.

**→ Phase boundary report to Justin.**

---

## 3 — Phase D · Dashboard (blocked on C)

Build `SealedTrackerClient.tsx` + `load-sealed.ts`, flesh out `SealedTrackerContent.tsx`. Spec §4 + §6 in full:

- Loader (service-role, §6 rules: `cachedPublicData`, `resolveGameScope`, `game_id` + `region` on every query, `.range()` pagination, `firstRelation()`): tracked products, history rolled up to 12 weekly/monthly periods (query-time rollup, last price in period), set snapshots joined on `set_id`, carry-forward ratio. `market_index_snapshots` is service-role-only — set value/ratio resolve server-side, passed as props.
- Client: stat rail · 6 ranking chips (RELEASE reverses on second click) · sticky metric column · PERIOD toggle · VIEW toggle (grid default, localStorage persistence) · grid cells tinted ±8% cap · VALUE RATIO unit-switch mode · disabled CASES/DECKS/JP with SOON · em-dashes for missing, `--ink-3` for exactly zero · **both empty states** (no-snapshot-this-week = carry forward; no-snapshots-for-game = hide the ratio chip + column with one-line explanation) · hand-rolled SVG sparklines in table view.
- Liquidity figures (`PRICE ACTIVITY`, `LAST MOVE`) computed from **our own history rows** (moves in trailing 30d; age of last move) — self-contained, no provider field needed at render time.

Two subagents: UI builder, then verification agent walking spec §8's dashboard criteria (3 views × 2 periods × 6 modes render; persistence survives reload; zero-snapshot game renders clean). Verification output: `docs/investigations/terminal-dashboard-verification.md`.

**→ Phase boundary report.**

---

## 4 — Phase E · Detail hero + price history (blocked on D)

New route pair `…/terminal/sealed/[productSlug]` (both mirrors) + content/client/loader/css, same five-file shape.

- §3.1 hero: breadcrumb · box art 5:6 · Caveat gradient H1 (`padding-right: 13px`) · 48px mono price · **three** delta chips (7D/30D/90D — no 1Y) · range bar sourced entirely from our own rows (never `sealed_products.ath/atl`), real-span label, never the string "52-WEEK RANGE" · facts panel with PRICE ACTIVITY + LAST MOVE · edge cases (null MSRP hides both rows; `AT ATH` marker) · CSV client-side; WATCHLIST per D8.
- §3.2 chart: chart.js per `SetChartClient.tsx` pattern · CHART|TABLE cobalt toggle, timeframe survives toggling · data-driven timeframe list, ships 30D/90D · SET VALUE + VALUE RATIO overlays, step-function ratio · **the indexed-axis rule**: any overlay active → all series index to 100 at window start, area fill drops, axis label `INDEXED · 100 = <date>`; none active → raw USD + 12% area fill · table view newest-first, sticky header, internal scroll, `DAILY` footer, overlay buttons hidden.

Verification agent: §8 detail criteria (2 timeframes × 4 overlay combos, axis mode transitions, marker at ATH=100%/ATL=0%, tooltip containment, mobile 380px).

**→ Phase boundary report (includes D6 ask).**

---

## 5 — Phase F · Detail stats + top 10 (blocked on E)

- §3.3: 6-up stat cards (3-up at 1180, 2-up at 720) — off ATH · 12W volatility · price activity · cards/box · $/pack (hidden when `packs_per_unit` null, spec §9.2) · sealed rank. No supply signal, no double-counting volatility.
- §3.4: top 10 by price desc — set membership by **`printed_set_code`**, grouped on **`card_image_id`**, explicit `includes()` variant checks · summary strip (combined, set value, share, top card's share) · 4:3 art tiles, `RarityBadge` as-is, single-line ellipsis names · tile links to `/card/[card_image_id]` (game-scoped variant).

**→ Phase boundary report.**

---

## 6 — Phase G · Box EV (blocked on F + pull_rates)

1. **Research subagent:** community pull rates (MR/GMR/SEC/SR/…) per tracked One Piece set — per-box expected counts, source URLs, confidence grades. Output: `docs/investigations/pull-rates-research.md` + a draft seed SQL/JSON.
2. **Stop — D7:** Justin reviews the draft. Nothing is inserted before sign-off.
3. Seed `pull_rates` (service-role DML; BULK slot with null `rarity_id`).
4. §3.5 UI: slot table (`VALUE / BOX` column name, weight bars) · BULK as plain text, never through `RarityBadge` · summary column (comparison bars, sealed premium **positive = box above contents**, plain-language read) · hide section entirely when no rows · caution strip on any `confidence='low'` · mandatory footnote. Rarity averages computed over the set's cards grouped on `card_image_id`.
5. Verification: EV equals sum of slot contributions with no rounding drift; weights sum to 100%; hide/caution states.

**→ Final report: full spec-§8 acceptance sweep (greps for `sellers`, undefined tokens, service-role reachability; the `set_id is null` snapshot audit assertion; `is_tracked`-implies-`set_id` check), lint/build/boundaries, and the deploy-and-PSI reminder — the deploy itself is Justin's.**

---

## 7 — Working agreements

- All work on `feat/moon-terminal`, committed per phase; no deploys, no DDL, no `pull_rates` inserts without sign-off. DML limited to the D1 bundle + approved D3/D7.
- Subagent file ownership is disjoint: ingestion owns `src/app/api/sync/sealed-prices/**` + config/scripts; UI owns `src/app/**/terminal/**`; neither touches the other's tree. Shared docs land in `docs/investigations/`.
- Every claim about live state comes from a live probe, never a branch or local file.
- Reports at phase boundaries only; mid-phase stops only for D-numbered decisions.
