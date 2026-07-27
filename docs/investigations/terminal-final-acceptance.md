# Moon Terminal — Phase G final acceptance + C–G closing sweep

**Date:** 2026-07-27 · **Branch:** `feat/moon-terminal` (Phase G uncommitted in working tree)
**Verifier:** independent acceptance agent. Read-only DB; no fixes applied; no commits.
**Method:** build gates run locally · live-DB assertions via PostgREST (service role, GETs only) ·
EV recomputed end-to-end by a script importing the **actual** `booster-baseline.ts` module (Node 24
type-stripping) · rendered checks against the build's prerendered SSG HTML (`.next/server/app`) and
against `next start` for non-prerendered routes (lorcana mirror).

**Verdict: PASS with one failing gate and one flagged data-quality finding.**
Everything Phase G shipped behaves as specced — EV math is drift-free and reproduces to the cent,
gating/hiding is correct on all 44 product pages, the chip hide and retrofit are live. The two
items that keep this from a clean sweep:

1. **`npm run audit:game-boundaries` FAILS** — `riftbound should remain private until launch
   approval`. Live DB has `games.riftbound.is_public = true`. Pre-existing code/DB split (CLAUDE.md
   §11 explicitly names this failure as real, not noise); nothing in the Phase G diff causes or can
   fix it. But §8's "audit passes" is strictly red until the flag or the code expectation changes.
2. **Four non-booster ids survive the classifier** (hit-class rarities bypass rule 4; their id
   markers are not in `EVENT_ID_MARKERS`) — details in §C13b below. Two sit inside OP09's L
   average, the very slot its caution strip already flags. Recommend a D8 marker addition, not a
   silent fix.

---

## A · Build gates

| # | Check | Expected | Observed | Status |
|---|---|---|---|---|
| 1 | `npm run lint` | pass | ✔ No ESLint warnings or errors | **PASS** |
| 2 | `npm run build` | pass; lens gate first; static gen hits live DB; both `[productSlug]` routes SSG | exit 0; `owl-lens:check-types` ran first; `/terminal/sealed/[productSlug]` and `/games/[game]/terminal/sealed/[productSlug]` both `● SSG`, 44 paths each; dashboards prerendered | **PASS** |
| 3 | `npm run audit:game-boundaries` | pass (retry on timeout) | **exit 1, twice — no timeout.** Cross-game issues 0, missing game_id 0, all dup-key checks 0; sole failure line: `riftbound should remain private until launch approval` (live `is_public=true`, confirmed by direct query). Pre-existing DB-state split, outside Phase G's file scope | **FAIL** (pre-existing, not a Phase G regression) |

Caution: an earlier backgrounded run piped through `tail` masked the exit code as 0 — the audit
prints `Result: FAIL` and exits 1. Re-run un-piped to confirm.

## B · Seed state (live DB, read-only)

| # | Check | Expected | Observed | Status |
|---|---|---|---|---|
| 4a | pull_rates rows / sets | 58 rows, 13 sets | 58 rows, 13 distinct set_ids (OP02–04, 06–12, 14, 15, EB01) | **PASS** |
| 4b | per-set `per_box` sums | 288.000 exactly | all 13 sets sum to exactly 288 (3-dp arithmetic) | **PASS** |
| 4c | BULK rows null `rarity_id` | yes | exactly 13 null-rarity rows, one per set, all `slot_label='R / UC / C bulk'` | **PASS** |
| 4d | non-BULK `rarity_id` resolves in `game_rarities`, matching `game_id` | all | 45/45 resolve, 0 game mismatches, 0 wrong-game rows | **PASS** |
| 4e | region | 'en' everywhere | 0 non-en rows | **PASS** |
| 4f | confidence enum | high/medium/low | 0 out-of-enum values | **PASS** |

## C · Box EV (§3.5 + §8)

| # | Check | Expected | Observed | Status |
|---|---|---|---|---|
| 5 | EV total = Σ slot contributions, no drift; recompute OP02/OP09 vs SSR | match | Independent recompute (real classifier module + live `price_stats.tcg_market`): OP02 **$159.27**, OP09 **$378.93** — rendered pages show the identical totals and identical per-slot cells to the cent (OP02: AA 66.35 / SEC 5.04 / SR 46.55 / L 1.48 / BULK 39.85; OP09: AA 79.16 / TR 16.52 / SR 22.32 / L 216.57 / BULK 44.36). Parsed **all 13** rendered EV tables: Σ(VALUE/BOX cells) == tfoot total on every page, drift 0.00 everywhere. Premiums match: OP02 +279.9% ($605.01), OP09 +77.4% ($672.23). Matches build-notes §4 same-day figures | **PASS** |
| 6 | Weights sum to 100% per rendered table | 100% | Data-level Σ is exactly 100% by construction. Rendered 1-dp columns: 11/13 read 100.0; **OP09 reads 100.1, OP04 reads 99.9** vs the tfoot's hardcoded `100.0%` (display rounding, no largest-remainder correction). Minor cosmetic; flagged, not failed | **PASS** (minor display note) |
| 7 | BULK plain text, never RarityBadge | plain span | Code: `slot.rarityCode == null → <span class="sd-ev-bulk">{slot_label}</span>`; RarityBadge only called with a resolved `game_rarities` code. Rendered: all 13 pages show `sd-ev-bulk">R / UC / C bulk`; no `'BULK'` string reaches RarityBadge anywhere in `src/` | **PASS** |
| 8 | Section entirely absent for cut sets, gap sets, ALL cases | absent | Zero `OPENING EV` / EV markup on: OP05, OP13, OP01 (both waves), EB02 (cuts) · OP16, EB03, PRB01, PRB02 (gaps) · **all 22 `-case` pages** (one re-verified live via `next start`, product-type gate). The lone `sd-ev-` grep hit on hidden pages is the page's inlined CSS class definitions, not markup | **PASS** |
| 9 | Caution strip iff top VALUE/BOX slot is `low`; disclaimer permanent-property | OP09/OP10 strip; OP02/EB01 none | Rendered strips on **OP07, OP08, OP09, OP10, OP15**; none on OP02/OP03/OP04/OP06/OP11/OP12/OP14/EB01 — exactly matches the independent recompute of top-slot confidence on all 13 sets (OP07 TR-low, OP08/09/10 L-low, OP15 AA-low). Expected OP09✔/OP10✔ strip, OP02✔/EB01✔ none. Disclaimer present on every EV page: "PULL RATES ARE COMMUNITY-ESTIMATED AND UNOFFICIAL — BANDAI PUBLISHES NONE…" — no improves-later language | **PASS** |
| 10 | Sealed premium sign + plain read | positive = box above contents | `premiumPct = (price − EV)/EV`; all 13 premiums positive today; read renders beneath ("The box trades 280% above what its cards are worth…" on OP02). Zero-case renders `t-flat`. Note (build-notes call #7): premium uses delta colors, so positive premium renders green — semantically neutral figure, design may later prefer ink | **PASS** |

**C13b · Flagged finding — residual classifier leaks (not a check failure; record for D8).**
A live sweep of all hyphen-suffix ids surviving the classifier across the 13 seeded sets found four
non-booster product/venue cards INCLUDED in the baseline:

| Card | Rarity | Price | Where it lands |
|---|---|---|---|
| `OP09-001-magazine-promo` (2025 PSA Magazine Promo) | L | $159.22 | inside OP09's **L average — the top slot** |
| `OP09-061-special-edition` (Jumbo) | L | $149.99 | same L average |
| `OP09-051-anniversary-set` (2nd Anniversary Set Buggy) | MR | $1,582.24 | **tiles at #8** of OP09's top-10 and inflates `baselineValue` (no MR slot on OP09, so EV unaffected) |
| `OP07-051-alt-art-promo` (Binder Set Boa) | AA | $141.90 | inside OP07's AA average |

Mechanism: rules 1–2 don't know these markers (`-magazine-promo`, `-special-edition`,
`-anniversary-set`, `-alt-art-promo`) and rule 4's name/parallel guards apply only to R/UC/C.
Removing the two OP09 L leaks would drop the L average 43.31 → ~26.19 and OP09's EV
$378.93 → ~$293 (−23%) — material, but sitting behind the caution strip that already labels the
slot low-confidence. Same category as the seven markers the Phase G sweep added; recommend adding
these four to `EVENT_ID_MARKERS` as a D8 call (deliberately **not** fixed by this verification).

## D · Retrofit + chip

| # | Check | Expected | Observed | Status |
|---|---|---|---|---|
| 11 | Tiles exclude classifier-excluded; promo callout; SET VALUE = official snapshot; baseline labels | all | OP09 rendered tile order = recomputed baseline top-10 exactly (`OP09-118_p2` $5,500 #1 → `OP09-051_p5` #10); promo strip renders `P-OP09-002` **Uta $8,999** + `P-OP09-076` $4,000 with "PROMO / EVENT CARDS — NOT PULLED FROM BOOSTERS, EXCLUDED FROM THESE TILES", linking to `/games/one-piece/card/…`; OP02 strip = Sakazuki $2,200 + Kuzan $1,900. Rendered SET VALUE: OP09 **$48,633** vs stored 07-26 snapshot 48,632.90 ✔; OP02 **$12,049** vs 12,049.27 ✔. Share labels: "OF BASELINE VALUE" ×2 in strip, "OF BASELINE" per tile | **PASS** |
| 12 | VALUE RATIO chip absent; five chips work; revival comment; detail overlay + facts intact | all | Rendered dashboard chip row = exactly `TRENDING · PRICE · SET VALUE · OFF ATH · RELEASE` (5 buttons, no VALUE RATIO). Sole "VALUE RATIO" string on the page is the explanatory footnote (kept by design). `RATIO_RANKING_ENABLED = false` with the revival comment naming set-value v2 / `metric_version=2` and the audit numbers; ratio-mode code path intact behind the flag (`visibleModes` filter + `effectiveMode` coercing stale `ratio`→`trending`). Detail page: VALUE RATIO **overlay button** and **facts row** (`19.9×` on OP02) both render | **PASS** |
| 13 | Shared classifier: single definition, both paths | one module | Only ONE code import of `booster-baseline` in `src/`: `load-sealed-detail.ts`, which contains **both** the §3.4 top-10 path and the §3.5 EV path (steps 8 and 9 split/consume the same `baselineCards`). No duplicated population logic elsewhere — the two grep hits (`justtcg-match.ts` Dash-Pack regex, `yuyutei.ts` `P-` check) are pre-existing provider-matching code, unrelated to the population rule | **PASS** |

## E · Full §8 regression sweep

| # | Check | Observed | Status |
|---|---|---|---|
| 14a | zero `sellers` in Terminal files | 0 matches (code + CSS) outside "no seller" comments | **PASS** |
| 14b | zero bare `var(--gain)` / `var(--loss)` | 0 matches repo-wide in terminal/components/games | **PASS** |
| 14c | zero `useSearchParams` as code in Terminal | only comments in the two Terminal clients; the one real call is `AdminNav` in `Nav.tsx` (pre-existing, sanctioned by CLAUDE.md §7) | **PASS** |
| 14d | every `var(--*)` resolves | 24 distinct vars used across `terminal.css` + `sealed-detail.css`; all defined in `globals.css`/terminal CSS except the three `--font-*` vars, which next/font defines in `layout.tsx` (lines 16/23/30) | **PASS** |
| 14e | no service-role client reachable from client components | `supabase-server` imported only by the two loader files; both `"use client"` components import loader modules with `import type` only | **PASS** |
| 14f | every loader query carries `game_id` (+ `region` where the column exists) | `load-sealed.ts`: 4 queries, all `game_id`; `region` on `sealed_products` + both `market_index_snapshots` queries. `load-sealed-detail.ts`: 6 queries, all `game_id`; `region` on `sealed_products`, `market_index_snapshots`, `cards`, `pull_rates`. `sealed_product_price_history` has no region column (verified live; documented in-code) | **PASS** |
| 15 | Dashboard: views/periods/modes; persistence; both empty states | Code-verified: `buildPeriodCfg` weekly/monthly, grid/table/cards renderers, `modeKey` covers all 5 visible modes (+ratio behind flag); RELEASE direction-flip on second click; localStorage persistence read-after-mount (no hydration mismatch). Runtime: one_piece dashboard SSR 200 (grid default); **`/games/lorcana/terminal/sealed` 200, renders clean** — "No tracked products" empty state, chip row correctly drops **both** VALUE RATIO and SET VALUE (4 chips) with the `terminal-ratio-note` one-liner, no em-dash grid, no error boundary. Full 3×2×5 client-state matrix verified by code inspection, not browser automation | **PASS** (client combos by inspection) |
| 16 | Detail interactions | Code-verified: `TIMEFRAMES` = 30D/90D data-driven, default 90D; timeframe state never reset → survives CHART↔TABLE both directions; any overlay → `indexTo100` all series + fill off + axis `INDEXED · 100 = <date>`, none → USD + 12% area fill; marker `= (cur−atl)/(ath−atl)×100`, AT-ATH pins 100, ATL yields 0, clamped [0,100]; no `52-WEEK` string in src or rendered HTML (label computed, `13-WEEK RANGE` renders today); `.sd-ic-name` nowrap+ellipsis with `min-width:0` grid fix at every breakpoint; `t-up`/`t-down`/`t-flat` = `--gain-2`/`--loss-2`/`--ink-3`, zero → `t-flat` | **PASS** |
| 17 | Live audit assertions | `market_index_snapshots` entity_type='set': 360 rows across **7** snapshot_dates (06-21→07-26), **0** null `set_id` on every date; `is_tracked` products: 44 (22 box + 22 case), **0** null `set_id`; `sealed_product_price_history`: 29,648 rows, **0** duplicate (product, date) pairs | **PASS** |
| 18 | Mobile 380 CSS incl. §3.5 | `.sd-ev-table` (min-width 520) inside `.sd-ev-scroll { overflow-x:auto }`; `.sd-ph-table` (560) inside `.sd-ph-scroll`; `.sd-ev-grid` stacks at 1080; hero 1-col at 720; stats 2-up at 720; tiles 2-up at 640 (fluid); strips/chips flex-wrap; promo names capped 220px ellipsis; EV bars fluid (84px+1fr at 380 fits). Dashboard grid's horizontal scroll is inside its own scroller (designed behavior, spec §3.0). No page-level overflow vector found in analysis | **PASS** (static CSS analysis) |

### §8 checklist status

| §8 criterion | Status |
|---|---|
| lint passes | ✔ |
| build passes (lens gate first) | ✔ |
| audit:game-boundaries passes | ✘ — riftbound public/private split (pre-existing DB state) |
| no `--gain`/`--loss`/`--line` resolving to nothing | ✔ (`--line`, `--grad-terminal` defined in globals.css) |
| no service-role client reachable from client components | ✔ |
| every new query carries game_id + region | ✔ (region where the column exists) |
| dashboard 3 views × 2 periods × ranking modes | ✔ (5 modes live; ratio behind flag — D7 #2; client combos by code inspection) |
| view preference persists | ✔ (code) |
| detail 2 timeframes × 4 overlay combos; indexed-axis rule | ✔ (code + SSR) |
| no `sellers` reference in Terminal | ✔ |
| audit: zero set-snapshots with null set_id | ✔ (0/360 across 7 dates) |
| no is_tracked product with null set_id | ✔ (0/44) |
| zero-snapshot game renders without em-dash grid | ✔ (lorcana live render) |
| CHART\|TABLE preserves timeframe | ✔ (code) |
| range-bar marker at ATH 100% / ATL 0% | ✔ (code) |
| Box EV total = Σ contributions, no drift; weights 100% | ✔ (all 13 pages; 1-dp display Σ 99.9–100.1, data-level exact) |
| Box EV hides for no-rows sets; low-confidence caution strip | ✔ (13 shown / 9 boxes + 22 cases hidden; 5 strips match rule) |
| top-10 names truncate at every breakpoint | ✔ (CSS) |
| deltas green/red/`--ink-3` | ✔ |
| mobile 380 no page scroll | ✔ (CSS analysis) |
| cold-page PSI after deploy | **N/A — nothing deployed this phase**; run at deploy time per standing rule |

## Ambiguities / observations for Justin

1. **OP06's L slot renders em-dash** — zero priced baseline L cards resolve for OP06 today, so the
   slot contributes nothing to OP06's EV ($145.52). Correct em-dash-never-zero behavior, but worth
   knowing the EV omits a seeded slot there.
2. **Caution strips fire on five sets, not two** (OP07/OP08/OP15 beyond the notes' OP09/OP10) — all
   five satisfy the amended trigger exactly; the build notes' "OP09/OP10-class" shorthand simply
   undersold it.
3. **Rendered weight columns can read 99.9/100.1** vs the tfoot's fixed `100.0%` (§C6). Cosmetic;
   fix would be largest-remainder rounding at render.
4. **Sealed premium renders green when positive** (§C10 note) — deliberate per §8's blanket delta
   rule; semantically neutral figure.
5. **The classifier leaks in §C13b** — the one substantive data-quality finding; D8 candidate.
6. Lint/build/audit were run against the working tree with Phase G uncommitted, per the task; the
   riftbound audit failure needs a DB flag flip (or a launch-approval decision), not a Phase G edit.

## Addendum 2026-07-28 — the red gate cleared

`audit:game-boundaries` re-run after the `riftbound.is_public` revert: **PASS**
(exit 0, cross-game 0, missing game_id 0; riftbound `is_public=false` probed
live first). The Phase G sweep's sole FAIL was the out-of-band visibility flip,
since reverted — see `codex-coordination.md` §"Game visibility is flipped from
outside this repo". All acceptance gates for phases C–G are now green.
