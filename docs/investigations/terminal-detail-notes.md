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

## Phase F build notes

**Date:** 2026-07-27 · **Agent:** Phase F UI subagent · **Scope:** §3.3 market stats + §3.4 top 10, extending the Phase E files only. All live numbers below are read-only PostgREST probes (2026-07-27) plus SSR curls against a fresh dev server on :3002.

### 1 · Price basis holds up — snapshot vs card-sum agree on OP09 (0.15%)

Tile prices are `price_stats.tcg_market` via the `price_stats!price_stats_card_game_fk` embed — the same per-card figure `/sets` and `/card/[id]` display, and the same basis `capture_market_index_snapshots` sums into `index_value`. So `% OF SET` divides like by like. Probed for OP09 (emperors-in-the-new-world-booster-box): full deduped card-sum **$48,560.82** vs latest snapshot (2026-07-26) **$48,632.90** — 0.15% apart, explained by intra-day drift since capture. **No visible promo-basis disagreement on this set**; top-10 share **70.8%**, top card **18.5%** — both plausible. The known promo-card basis defect (set-value-backfill.md) did not surface on the sets behind the tracked 44; nothing was "fixed".

### 2 · The printed_set_code population puts tournament promos at #1 — correct, will look odd

OP09's top card is **"Uta (Treasure Cup 2025)" — rarity R, `P-OP09-002`, $8,999**, outranking Manga Gol.D.Roger (`OP09-118_p2`, $5,500). Event/tournament promo variants print the set's code, so §2.2's population (`printed_set_code`, deduped on `card_image_id`) includes them — and the set-value snapshot groups on `printed_set_code` too, so numerator and denominator agree. **This is the honest population, not a bug.** Recording it so nobody later "fixes" the top 10 onto `set_id` (which is the 65%-low trap) or regex-filters promos out.

### 3 · SEALED RANK is honest to frozen tails — Wave 1 Blue ranks #1 of 22 cases

Rank uses each cohort member's own latest history row (spec §2.3), so the provider-stale Romance Dawn Wave 1 Blue case ranks **#1 OF 22 · BOOSTER BOX CASE** on its single legacy 07-14 row of **$49,499**. The rank math is right; the input price is the open data question already queued in §1 of these notes (whether stale-tail products stay `is_tracked`). Not render-blocking — cases remain behind `CASES · SOON`.

### 4 · Volatility: 13 weekly anchors, min 4 observations, stale products read *low* by design

`volatility12w` samples the last price at or before each of 13 weekly anchors ending at the product's **own** last data day, then averages abs w/w. Anchors before the first row drop out; **< 4 observations → null → em-dash** (the 1-point case renders `— · NO W/W DATA`, verified live; never NaN). Unrepriced weeks carry forward as honest 0% swings, so provider-stale products read low-volatility — the staleness signal itself lives in PRICE ACTIVITY (`FLAT 23D`), keeping volatility stated exactly once per spec §3.3. OP09 box: **1.6% over 12 obs** (hand-recomputed identically outside the loader).

### 5 · Pre-existing defect found, out of scope: set-detail top-card clicks 404

`SetDetailClient.tsx:448` pushes `/card/${c.id}` where `c.id` is `cards.id` (uuid), but `/card/[id]` resolves `.eq("card_image_id", id)` — probed: `id` ≠ `card_image_id` on every card checked, so those row clicks land on 404s today. Every other surface (MarketTable/MarketGrid/RaritiesClient/warm route) links by `card_image_id`; Phase F's tiles do too (`gamePath(gameRouteSlug, "/card/<card_image_id>")`, verified `P-OP09-002` / `OP09-118_p2` hrefs in SSR). Not fixed here — outside the Phase F file scope; needs its own small fix.

### 6 · Mechanics worth knowing

- **PostgREST's 1000-row cap reconfirmed the hard way:** a hand probe with `limit=10000` silently returned 1,000 ascending rows and produced a wrong "latest price" (and a wrong rank) until paginated. The loader paginates every card/history query with `.range()` at 1000 per §6 — hand probes must too.
- **Cache key bumped** to `terminal-sealed-detail-v2` — payload shape changed and `unstable_cache` serves the old shape stale otherwise (`card-extras-v3` precedent).
- **§3.3/§3.4 are server JSX in `SealedDetailContent`** — zero interactivity (hover is CSS), so the client bundle is untouched; the few formatting helpers are duplicated server-side because runtime values can't cross the `"use client"` boundary.
- CARDS PER BOX and $ PER PACK hide today (`packs_per_unit` / `cards_per_pack` null on all 44 tracked, §2 above) and light up from data alone when backfilled. With them hidden the launch rail is 4 cards.
- All top-10 art on probed sets is mirrored Supabase storage (`…/card-images/…/thumb.webp`), so `FastCardImage` takes its plain-`img` path — no `next/image` host concerns.
- Products whose set has no snapshot yet render the strip honestly: combined price real, SET VALUE and both shares em-dash (verified on the OP01 case product — its lone 07-14 price row predates the first OP01 snapshot, §2.3's "null before the first snapshot ever").

## Phase F verification

**Date:** 2026-07-27 · **Agent:** Phase F verification subagent · **Verdict: PASS (17/17), five notes flagged**
Scope: uncommitted working-tree changes to `load-sealed-detail.ts`, `SealedDetailContent.tsx`, `sealed-detail.css` (+ this file), against spec §3.3, §3.4, §8. `git diff --stat` vs HEAD `a6929ce` confirms **only those four files changed** — `SealedDetailClient.tsx` and both `page.tsx` mirrors untouched. Runtime checks ran on a fresh `npm run dev` on **:3003** (:3000 belongs to another session; nothing verified there). All DB probes read-only PostgREST, paginated at 1000 per the §6 trap.

### A · Build gates

| # | Check | Result |
|---|---|---|
| 1 | `npm run lint` | PASS — "No ESLint warnings or errors" |
| 2 | `npm run build` | PASS (exit 0, lens type-gate included) — both `[productSlug]` routes ● SSG, 3 listed + "[+41 more paths]" = **44 params each** |
| 3 | `npm run audit:game-boundaries` | PASS on first try — cross-game issues 0, missing game_id 0 |
| 4 | Diff scope | PASS — exactly the four permitted files; no untracked strays |

### B · Code-level (§8 + §3.3/§3.4)

| # | Check | Result |
|---|---|---|
| 5 | §3.3 grid | PASS — 6 cards defined (OFF ATH · 12W VOLATILITY · PRICE ACTIVITY · CARDS PER BOX · $ PER PACK · SEALED RANK); the last two conditional on `cardsPerBox`/`pricePerPack` null → hidden today (runtime shows 4); `repeat(3,1fr)` @1180 / `repeat(2,1fr)` @720; hover `translate(-2px,-2px)` + `4px 4px 0 var(--ink)`; zero rendered sellers/supply-signal (note a); VOLATILITY renders exactly once |
| 6 | Volatility | PASS — `MIN_VOLATILITY_OBS = 4`, `swings.length < 4 → null` → em-dash; null/zero guards on both ends of every swing mean NaN is unreachable; input is solely the product's own history rows; hand-recompute 1.6% over 12 obs (OP09 box) matches SSR exactly |
| 7 | Sealed rank | PASS — in the loader; cohort `.eq(game_id)` + `.eq(region)` + `.eq(product_type)` + `.eq(is_tracked, true)`; each member's own latest row; competition ranking `1 + count(price > mine)` so ties share a rank |
| 8 | §3.4 population | PASS — `.eq(printed_set_code, sets.code)` + `.eq(region,"en")` + `.eq(game_id)`; Map-dedupe on `card_image_id` (keep-max); **no variant-detection code at all** (the only regex in the changed files is `productTypeLabel`'s `replace(/_/g," ")` label formatting); sort desc, `slice(0,10)`; all three share figures divide by the hero's snapshot `setValue` only — `top10Combined` is numerator-only, no second rollup exists |
| 9 | RarityBadge | PASS — imported from `@/components/ui/RarityBadge`, `<RarityBadge rarity={c.rarity} />` only, inside `.sd-ic-art`; no non-rarity literal anywhere (note c) |
| 10 | Tile link target | PASS — `/card/[id]`'s `card-detail-data.ts:130` resolves `.eq("card_image_id", id)`; Phase F builds `gamePath(gameRouteSlug, "/card/" + c.cardImageId)` — it did **not** copy the SetDetailClient uuid defect (build notes §5); runtime confirm in C15 |
| 11 | Name truncation | PASS — `.sd-ic-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }` in the base rule, overridden by no media query; `.sd-icard { min-width: 0 }` so the grid child actually ellipsizes; `.sd-ic-line` gets the same treatment |
| 12 | Greps | PASS — `sellers` 0 rendered (note a); bare `--gain`/`--loss` 0 (only `-2` forms); all 16 `var(--*)` tokens verified present in `globals.css` `:root` + 3 font vars from `layout.tsx` next/font; `EM` ("—") is the only missing-value rendering (all `fmt*` helpers null→EM); `deltaCls(0) → t-flat → var(--ink-3)` (`terminal.css:162`) |

### C · Runtime (dev :3003, curl on SSR HTML)

| # | Check | Result |
|---|---|---|
| 13 | OP09 box, both mirrors | PASS — 200 both; 4 visible stat cards (`OFF ATH −2.5%` · `12W VOLATILITY 1.6%` · `PRICE ACTIVITY 20 MOVES · MOVED 1D AGO` · `SEALED RANK #7 · OF 22 TRACKED · BOOSTER BOX`); 10 tiles, rank pills #1–#10, prices strictly descending $8,999 → $1,675; strip shows all 4 figures; mirrors byte-identical on every checked value |
| 14 | Independent strip recompute | PASS — live-DB recompute (printed_set_code=OP09, region en, game-scoped, `card_image_id` dedupe → 270 priced of 299 rows, 0 dupes; top-10 sum **$34,444.44**; denominator = latest set snapshot ≤ own last data day = **48,632.90** @2026-07-26): expected `$34,444 · $48,633 · 70.8% · 18.5%` — SSR renders exactly that. Rank #7/22 and vol 1.6%/12 obs also independently reproduced |
| 15 | Tile href resolves | PASS — `/games/one-piece/card/P-OP09-002` → 200 |
| 16 | 1-point product (`romance-dawn-booster-box-case-wave-1-blue`) | PASS — 200; volatility `— · NO W/W DATA`; `AT ATH`; `0 MOVES · NEVER MOVED`; `#1 OF 22 · BOOSTER BOX CASE` (matches recompute — the frozen $49,499 legacy point, exactly as build notes §3 predicted); strip: combined $16,115 real, SET VALUE + both shares em-dash; **zero `NaN` in the entire HTML** including RSC payload |
| 17 | Regressions | PASS — `/terminal/sealed` dashboard 200; detail hero `13-WEEK RANGE` label and `sd-chart-canvas` container both present on both mirrors |

### Notes / ambiguities flagged

- **(a) `SELLERS` comment-only.** One occurrence, `SealedDetailContent.tsx:171`, in a comment stating the card *replaces* the mockup's SELLERS card; two comment mentions of "supply" likewise negative statements. Zero occurrences in rendered SSR HTML on any page. Judged compliant per Phase E's identical "52-WEEK" comment precedent.
- **(b) Tile hrefs are game-scoped on the bare mirror too** (`/games/one-piece/card/…` from `/terminal/sealed/…`). This is the repo-wide convention (CLAUDE.md §7: hrefs are always game-scoped) and spec §3.4 permits it; resolves 200. Not a defect, recorded so nobody reads it as one.
- **(c) Rarity `PR` is unmapped in `RarityBadge`.** OP01's tile #2 (`P-OP01-120`, rarity `'PR'` live) falls to the `c-rar-c` fallback styling with "PR" as text. Phase F passes `cards.rarity` verbatim as specced; the gap is `RarityBadge`'s map (has `PROMO`, lacks `PR`) — pre-existing, out of Phase F scope, queue with the SetDetailClient uuid fix.
- **(d) Media-query source order** in `sealed-detail.css` runs 1180 → 940 → 640 → 720. No selector overlaps between the 640 and 720 blocks, so the cascade is correct — noted only because the non-monotonic order invites a wrong "broken breakpoint" read later.
- **(e) Breakpoint behaviour verified by CSS analysis + SSR only** — no live 380px/720px/1180px browser measurement, same caveat as Phase E note (c). Device pass belongs to deploy-time PSI per §11.
