# Sealed sync verification (Phase C4) — all checks PASS

**Date:** 2026-07-27 · **Branch:** `feat/moon-terminal` · **HEAD:** `d3d52e6` (tree clean)
**Verifier:** independent C4 subagent per phases plan §2·C4. Every live number below is a fresh
PostgREST probe (service key, read-only GET/HEAD only — zero writes of any kind); every build number
is a fresh local run. Nothing was taken from the C1/C2 execution record on trust.

Method notes: history duplicate/null/source/sellers checks were computed client-side over the full
table, paginated 1,000 rows/page ordered by `id` (30 pages; fetched row count matched the
`count=exact` header exactly, so no pagination loss). PostgREST cannot see indexes/constraints
(CLAUDE.md §3), so uniqueness is asserted on data, not on the constraint's existence — the
constraint-level check remains in Justin's D2 SQL bundle.

---

## A · Live data assertions

| # | Check | Expected | Observed | Verdict |
|---|---|---|---|---|
| 1a | `sealed_products` total | 386 | **386** | PASS |
| 1b | `is_tracked = true` | 44 | **44** | PASS |
| 1c | tracked with null `set_id` | 0 | **0** | PASS |
| 1d | tracked with null `slug` | 0 | **0** | PASS |
| 2a | tracked slugs kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) | 44/44 | **44/44, 0 violations** | PASS |
| 2b | duplicate slugs per game | 0 | **0** (44 rows, 1 game_id) | PASS |
| 3a | `sealed_product_price_history` total | 29,648 | **29,648** (header = fetched) | PASS |
| 3b | distinct `price_date` | 90 | **90** | PASS |
| 3c | date range | 2026-04-28 .. 2026-07-26 | **2026-04-28 .. 2026-07-26** | PASS |
| 3d | duplicate `(sealed_product_id, price_date)` pairs | 0 | **0** | PASS |
| 3e | rows with null `game_id` | 0 | **0** | PASS |
| 3f | rows with `price <= 0` or null | 0 | **0** | PASS |
| 3g | rows with `source <> 'justtcg'` | 0 | **0** | PASS |
| 3h | rows with non-null `sellers` | 0 | **0** | PASS |
| 4a | tracked per-product point count median | ~90 | **90** (min 1, max 90, 44 products, 0 with zero points) | PASS |
| 4b | tracked products with < 10 points | exactly 1 | **exactly 1: Romance Dawn - Booster Box Case (Wave 1 - Blue), 1 point** (provider-stale, legacy 07-14 row) | PASS |
| 5a | 5 sampled tracked products' `set_id` has an `entity_type='set'` snapshot at 2026-07-23 | 5/5 | **5/5** (Romance Dawn Box W2 White, Romance Dawn Box W1 Blue, Paramount War Box, Adventure on Kami's Island Box, Memorial Collection Box) | PASS |
| 5b | carry-forward join (latest `snapshot_date <= price_date`) non-null for `price_date >= 2026-07-23` | all | **4/4 dates non-null on all 5 products** (07-23..07-26) | PASS |
| 5c | carry-forward join null for `price_date < 2026-07-23` | all | **86/86 dates null on all 5 products** | PASS |
| 6a | `market_index_snapshots` `entity_type='set'` count | 53 | **53** | PASS |
| 6b | distinct `snapshot_date` on those rows | only 2026-07-23 | **only 2026-07-23** — confirms the C5 backfill agent wrote nothing (see `set-value-backfill.md`) | PASS |
| 7 | `pull_rates` rows | 0 | **0** | PASS |

Snapshot columns observed (for the record, since the §2.3 join relies on `set_id` being a real
column): `market_index_snapshots` carries `set_id` directly alongside `entity_key` — the join needs
no code→id resolution.

Drift note: today is 2026-07-27 and the history max date is still 2026-07-26 with the total frozen
at 29,648 — consistent with the cron being undeployed and the out-of-repo Codex writer not touching
this table since the backfill. Expect these numbers to move (+~364/day, max date advancing) once the
cron ships; 3a/3b/3c are point-in-time assertions, not invariants.

## B · Build gates (all run at `d3d52e6`, post-backfill DB)

| # | Check | Result |
|---|---|---|
| 8 | `npm run lint` | **PASS** — "No ESLint warnings or errors" (exit 0) |
| 9 | `npm run build` | **PASS** (exit 0) — `owl-lens:check-types` gate included; static generation ran against the live post-backfill DB; `/terminal/sealed` and `/games/one-piece/terminal/sealed` both present in the route manifest (SSG, 1h revalidate) |
| 10 | `npm run audit:game-boundaries` | **PASS on first attempt** (no timeout retry needed) — "Games checked: one_piece, riftbound · Cross-game issues: 0 · Missing game_id rows: 0". No `riftbound should remain private` failure occurred. |

## C · Config sanity

| # | Check | Result |
|---|---|---|
| 11 | `npm run audit:sync-schedule` | **PASS** — "Game sync schedule PASS: 9 jobs / 12 Vercel cron entries" (exit 0) |
| 12a | `vercel.json`: sealed-prices entry | **PASS** — `/api/sync/sealed-prices?game=one_piece` at `"10 6 * * *"`, exactly one entry |
| 12b | all one_piece justtcg entries `maxSets=1` | **PASS** — 4× `/api/sync/justtcg?game=one_piece&cursor=1&maxSets=1` (00/06/12/18) plus `/api/sync/justtcg-history?game=one_piece&maxSets=1&…`; zero `maxSets=4` remain (the known drift is reconciled downward, per plan §2·C3) |
| 12c | `/api/warm` entries untouched | **PASS** — all 11 warm entries verified **set-identical (path + schedule)** between the pre-C3 `vercel.json` (`875d2b7^`) and current; the manifest regeneration only reordered them |

## D · Route code (`src/app/api/sync/sealed-prices/route.ts`)

| # | Check | Result |
|---|---|---|
| 13a | upsert conflict target | **PASS** — `HISTORY_CONFLICT = "sealed_product_id,price_date"` (line 50), passed as `onConflict` to the single `.upsert()` (line 341). No `source` in the key — targets the real `sealed_product_price_history_product_day_key`, not v49's condemned triple |
| 13b | writes only `sealed_product_price_history` | **PASS** — the file's only mutating call is that one `.upsert()`. Other DB access: read-only `.select()` on `sealed_products` and a `head: true` count on the history table. The `sealed_products` price columns (`tcg_price`, `market_avg`, `chg_*`, `ath`, `atl`, `price_updated_at`) appear only in a comment declaring them Codex-writer-owned — never as write targets |
| 13c | `sellers` / `low_price` hardcoded null | **PASS** — both typed `null` in the `HistoryUpsert` interface and set to literal `null` in the row builder (lines 320–322) |
| 13d | `CRON_SECRET` auth | **PASS** — 500 when unset; `Authorization: Bearer` or `?secret=` accepted, else 401 (lines 193–202). Matches the existing sync-route convention (`justtcg/route.ts`) |

## Verdict

**23/23 checks PASS.** The C1/C2 execution record (`sealed-catalog-reconcile.md` §8/§9/§12) is
confirmed by independent probes on every number it claims: 386/44/0/0 catalog state, 29,648 history
rows over exactly 90 dates with zero duplicate product-day pairs, median 90 points per tracked
product with the single expected provider-stale outlier, untouched 53-row/single-date snapshot
table, empty `pull_rates`, and all four build/config gates green. Nothing was fixed or written to
the DB in the course of this verification; the only file created is this document.
