# Terminal sealed detail (Phase E) — build notes

**Date:** 2026-07-27 · **Branch:** `feat/moon-terminal` · **Agent:** Phase E UI subagent
**Scope:** discoveries during the §3.1 hero + §3.2 price history build that contradict the spec or the phase brief. Implementation itself is documented in the code (`src/app/terminal/sealed/[productSlug]/`).

## 1 · "~90 daily points per tracked product" is not uniform — 6 of 44 are stale or near-empty

The brief stated the history table holds "~90 daily points per tracked product (2026-04-28..2026-07-26), one row per (product, day)". Probed live (2026-07-27): **38 of 44 tracked products** match that. Six `booster_box_case` products do not — they have no 2026-07-26 row and materially fewer points:

| slug | rows | first row |
|---|---:|---|
| `kingdoms-of-intrigue-booster-box-case` | 85 | 2026-04-28 |
| `paramount-war-booster-box-case` | 69 | 2026-04-28 |
| `pillars-of-strength-booster-box-case` | 38 | 2026-04-28 |
| `memorial-collection-booster-box-case` | 35 | 2026-04-28 |
| `romance-dawn-booster-box-case-wave-2-white` | 35 | 2026-04-28 |
| `romance-dawn-booster-box-case-wave-1-blue` | **1** | **2026-07-14** (the legacy pre-backfill write; $49,499) |

This is almost certainly the Phase C writer working as designed — writes are gated on provider-observed points (`lastUpdated`, CLAUDE.md §9's flat-history trap), so a product JustTCG stopped repricing simply stops accruing rows. Two consequences the brief didn't flag:

- **"One row per (product, day)" is a uniqueness guarantee, not completeness.** Row counts like 35 over an 04-28-anchored span imply missing days *inside* the window, not just a truncated tail. The detail page's CHANGE column (table + CSV) is therefore **row-over-row**, which for gapped products can span more than one day. The chart uses a category axis (per the repo's `SetChartClient`/`PriceChartClient` pattern), which visually compresses those gaps — same caveat the Phase D verification recorded for sparklines.
- The detail page anchors every window to the product's **own** last data day (never "today"), so stale products still render a full hero/chart; their LAST MOVE / PRICE ACTIVITY figures read against their own frozen tail. The single-row product renders the degenerate case: all delta chips em-dash, `1-DAY RANGE`, `AT ATH` (flat guard), one visible chart point. Verified rendering live in dev for `romance-dawn-booster-box-case-wave-1-blue`.

Cases are behind `CASES · SOON` on the dashboard, so today these six are reachable only by direct URL — but Phase F's SEALED RANK / 12W VOLATILITY cards and any future CASES launch will read this uneven depth. Worth a Phase C follow-up: decide whether stale-tail products should stay `is_tracked`.

## 2 · Confirmations, not contradictions (for later phases)

- `image_url` on tracked rows is `https://product-images.tcgplayer.com/fit-in/1000x1000/<id>.jpg` — host already allowed in `next.config.mjs` `remotePatterns`; `next/image` works as-is.
- The `sets!sealed_products_set_game_fk` embed hint (Phase D notes §4) was required here too, as predicted.
- `msrp_usd`, `release_date`, `packs_per_unit`, `cards_per_pack` are null on all 44 tracked rows — the MSRP / VS MSRP facts rows hide, RELEASED renders an em-dash, and the box-art pack-count suffix is omitted (spec §9.2 pattern). All light up from data alone when backfilled.

## Phase E verification

**Date:** 2026-07-27 · **Agent:** Phase E verification subagent · **Verdict: PASS (19/19), three notes flagged**
Scope: uncommitted working-tree files `src/app/terminal/sealed/[productSlug]/*` + `src/app/games/[game]/terminal/sealed/[productSlug]/page.tsx`, against spec §3.0–§3.2, §6, §8. Runtime checks ran against a fresh `npm run dev` on **:3001** (:3000 was another session's server, which returned 500 on `/terminal/sealed` — not this build; killed nothing, verified nothing there).

### A · Build gates

| # | Check | Result |
|---|---|---|
| 1 | `npm run lint` | PASS — "No ESLint warnings or errors" |
| 2 | `npm run build` | PASS (exit 0, lens type-gate included) — 4,726 static pages; **both** `[productSlug]` routes appear as ● SSG with generated params (44 slugs each): `/terminal/sealed/[productSlug]` and `/games/[game]/terminal/sealed/[productSlug]` |
| 3 | `npm run audit:game-boundaries` | PASS on first try — cross-game issues 0, missing game_id 0 |

### B · Code-level (§8)

| # | Check | Result |
|---|---|---|
| 4 | Service-role isolation | PASS — loader imported only by the two server `page.tsx` files and `SealedDetailContent.tsx`; `SealedDetailClient.tsx:17` uses `import type` only |
| 5 | Timeframe state / config | PASS — `tf` is independent `useState("90D")`, never reset by the view toggle (survives CHART↔TABLE both directions); `TIMEFRAMES` is a data-driven const array of exactly `30D`/`90D`; exactly three delta chips (7D/30D/90D), no 1Y |
| 6 | Scale rule | PASS — `anyOverlay` gates `indexTo100()` on the price series, `fill: !anyOverlay`, axis label flips to `INDEXED · 100 = <date>` and y-ticks drop the `$`; deactivating all overlays restores raw USD + 12% area fill (memo recompute). *Note (a) below* |
| 7 | Overlays hidden in table mode | PASS — overlay buttons render inside `{view === "chart" && …}` |
| 8 | Range bar one-source + clamps | PASS — loader's `sealed_products` select list contains no `ath`/`atl`; extremes computed from history rows only. Marker: `atAth → 100`, `ath===atl → 100` guard, else clamped `Math.min(100, Math.max(0, …))` (ATL case yields 0 naturally). Label computed from real span. `"52-WEEK"` renders nowhere. *Note (b) below* |
| 9 | Facts panel | PASS — both MSRP rows conditional on `msrpUsd != null`; PRICE ACTIVITY / LAST MOVE derived in `priceActivity()` from our own rows; WATCHLIST is a `disabled` stub; CSV is client-side Blob |
| 10 | Greps (6 files) | PASS — `sellers` 0, `RarityBadge` 0, `useSearchParams` 0 as code (one comment stating its absence), bare `--gain`/`--loss` 0 (only `-2` forms); every `var(--*)` resolves — 15 tokens + `--breadcrumb-*` in `globals.css` `:root`, `--font-{space-grotesk,caveat,jetbrains-mono}` from `src/app/layout.tsx` next/font |
| 11 | Caveat clip guard | PASS — `.sd-script { padding-right: 13px }` (`sealed-detail.css:94`) on the H1 gradient |
| 12 | Mobile 380 | PASS by static CSS analysis — table is the only fixed-min-width element (`min-width: 560px`) and lives inside `.sd-ph-scroll { max-height: 452px; overflow: auto }` with sticky `thead th`; hero collapses to `1fr` at 720px, chips/controls `flex-wrap`, `.sd-card` is `overflow: hidden`. *Note (c) below* |
| 13 | Table view | PASS — rows reversed (newest first), footer renders `DAILY RESOLUTION`, no sellers column; CSV header `date,box_price,change_pct,set_value,value_ratio` matches the five table columns |

### C · Runtime (dev :3001, curl on SSR HTML)

| # | Check | Result |
|---|---|---|
| 14 | `/terminal/sealed/emperors-in-the-new-world-booster-box` | PASS — 200; `13-WEEK RANGE`; `$672`; chips `7D −0.7% · 30D −0.7% · 90D +14.3%`; RELEASED em-dash; zero MSRP rows |
| 15 | Same slug under `/games/one-piece/…` | PASS — 200, identical hero shape and values |
| 16 | 404s | PASS — unknown slug 404; the one-piece slug under `/games/lorcana/…` 404 |
| 17 | Single-point product (`romance-dawn-booster-box-case-wave-1-blue`) | PASS — 200; `1-DAY RANGE`; `AT ATH` with marker `left:100%`; all three chips em-dash (`t-flat`); SET VALUE / VALUE RATIO em-dash (both snapshots post-date the lone 2026-07-14 row — correct per §2.3's "null before the first snapshot ever"); grep for `NaN` in the HTML: zero |
| 18 | Set value / ratio spot-check | PASS — live DB: latest price 672.23 (2026-07-26), OP09 set snapshot 2026-07-26 `index_value` 48632.90 → expected `$48,633` and 48632.90/672.23 = 72.3456 → `72.3×`; SSR renders exactly `SET VALUE $48,633` and `VALUE RATIO 72.3×`. Marker `left:83.08%` is consistent with ATH $689 (JUL 05 2026) / ATL $588 (MAY 04 2026) endpoints from our own rows |
| 19 | Dashboard regression | PASS — `/terminal/sealed` 200 on :3001 (Phase D intact) |

### Notes / ambiguities flagged

- **(a) Indexing base per series.** `indexTo100()` indexes each series to its *own* first non-null point; the axis label names the window's first date, which is the price series' base. A set-value overlay that begins mid-window (first snapshot after the window start) is based at its own first point, so the label's date is strictly true only for the price line. Reasonable reading of §3.2's "100 = first point in window"; recorded so a later reviewer doesn't re-litigate it.
- **(b) `"52-WEEK"` literal.** Appears exactly once — inside a comment (`SealedDetailClient.tsx:201`) saying it must never render. Zero occurrences in rendered strings or SSR HTML. The check's phrasing was "appears nowhere"; comment-only judged compliant.
- **(c) Mobile 380 was not browser-rendered.** Verified by CSS analysis + SSR curl only; no live 380px viewport measurement was taken. If a device pass matters, do it at deploy-time PSI per §11.
