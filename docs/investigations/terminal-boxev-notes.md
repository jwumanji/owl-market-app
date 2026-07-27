# Moon Terminal Phase G — Box EV implementation notes

**Date:** 2026-07-27 · **Branch:** `feat/moon-terminal` · **Status:** built; `npm run lint` and `tsc --noEmit` pass; `npm run build` deliberately NOT run (verification agent follows)
Implements the D7 decisions (see `moon-terminal-d7-briefing.md` §7) on top of Phase F.

Files touched: `src/lib/games/one-piece/booster-baseline.ts` (new) ·
`src/app/terminal/sealed/[productSlug]/load-sealed-detail.ts` ·
`src/app/terminal/sealed/[productSlug]/SealedDetailContent.tsx` ·
`src/app/terminal/sealed/[productSlug]/sealed-detail.css` ·
`src/app/terminal/sealed/SealedTrackerClient.tsx` ·
`docs/investigations/pull-rates-seed-final.json` (+ this file).
The only DB write was the `pull_rates` insert (§2). No DDL, no commits.

---

## 1 · The classifier (D7 #1) — `src/lib/games/one-piece/booster-baseline.ts`

ONE rule, one module, imported by Box EV and the top-10 retrofit; written so set-value v2
(`metric_version=2`) imports the same function. A card is **excluded** from the booster baseline when any of:

1. `card_image_id` starts with `P-` (promo ids);
2. `card_image_id` contains an event/venue id marker — the appendix §S.4 nine
   (`-winner-pack`, `-regional-prize`, `-championship-prize`, `-cs-pack`, `-judge-pack`,
   `-premium-card-collection`, `-welcome-pack`, `-learn-together`, `-other`) **plus seven found
   leaking through them in a live-catalog sweep (2026-07-27)**: `-event-pack`, `-tournament-pack`,
   `-beginners-deck-party`, `-illustration-box`, `-convention-promo`, `-official-playmat`,
   `-st15-reprint`;
3. rarity `PR`;
4. rarity ∈ {R, UC, C} and not vanilla bulk: id contains `_p`, **or name contains a variant/venue
   marker** — `Box Topper`, `(SP)`, `(Dash Pack)`, `(Pirate Foil)`, plus defensive twins of the id
   markers (`(Tournament Pack`, `(Winner Pack`, `(Treasure Cup`, `(Illustration Box`,
   `(Convention Promo`, `(Official Playmat`, `(Participation Pack`, `(Online Regional`,
   `(Offline Regional`);
5. curated id list: **`OP04-015`** ($201 on a plain-id base R; honest OP04 bulk avg ~$0.13).

All matching is explicit `startsWith`/`includes` — no regex (CLAUDE.md §8). `_r*` reprint ids and
hit-class parallels (`_p*`/`_sp_*` under L/SR/AA/MR/SP) stay included, per the appendix's population-C
definition.

**The four residual-pollution cases, resolved:**

| Case | What the probe found (2026-07-27) | Fixed by |
|---|---|---|
| OP04 | `OP04-015` "Roronoa Zoro" $201.13, rarity R, plain id, single row | rule 5 (curated) — named in the D7 brief |
| OP06 | `OP06-047` "Charlotte Pudding (SP)" $84.15, rarity R, plain id | rule 4 `(SP)` name marker |
| OP03 | no single big card today — pollution is plain-id "(Dash Pack)" event cards (`OP03-070` $7.71, `-081`, `-050`, `-032`, `-116`) plus `OP03-116-event-pack` | rule 4 `(Dash Pack)` + rule 2 `-event-pack` |
| EB01 | `EB01-003-regional-prize` $189.66 **is caught by the existing `-regional-prize` marker today** — the appendix's "still leaks via plain-suffix id" claim is not reproducible against the current catalog (likely Codex-machine id churn since the probe). The defensive `(Online Regional` / `(Offline Regional` name markers cover a recurrence | rule 2 (already), rule 4 (defensive) |

Post-refinement bulk averages: OP02 $0.15 · OP03 $0.16 · OP04 $0.13 · OP06 $0.30 · OP09 $0.16 ·
OP10 $0.17 · EB01 $0.71 — all in the honest range; no surviving bulk card ≥ $8 anywhere.

## 2 · Seed (D7 #3/#4/#5) — `pull_rates` 0 → 58 rows

Draft 109 rows / 17 sets → final **58 rows / 13 sets** (`pull-rates-seed-final.json`; insert via
service role, `ON CONFLICT (game_id,set_id,region,slot_label) DO NOTHING`, 2026-07-27; before-count 0,
after-count 58, inserted 58).

Filter actually applied (deterministic, in this order):
1. **Sets cut** (D7 #3): OP01, OP05, OP13, EB02 — all rows.
2. **SP rows dropped** (D7 #5) — all sets.
3. **×2 JP-derived rows dropped** (D7 #4): every row whose `source_note` carries the explicit
   marker "JP figure doubled for EN" (26 draft rows), **plus** two blend classes whose seeded figure
   was JP-×2-anchored rather than EN-observed: OP10 SEC (0.5 sits between JP×2 0.2–0.4 and EN 1.0)
   and the modern-era SR rows OP10–OP15 (§6.5 conflict; appendix S.3 classifies OP10 SR as
   JP-derived). TR rows kept (EN single-source, low — D7 #5). **L rows kept** — see §6.3.
4. **OP08 AA dropped** (not in the D7 list): the class resolves ZERO cards under
   `printed_set_code='OP08'` (appendix §S.1/S.4 #3), so the slot could never price — see §6.2.
5. **BULK recomputed** per set as `288 − Σ(surviving hits)`; per-set `per_box` sums verified
   **exactly 288.000** in the DB after insert (= weights sum to 100%).

| Set | Rows | Slots | BULK per_box |
|---|---|---|---|
| OP02 · OP03 · OP04 · OP06 | 5 each | SEC 1 · SR 9 · AA 2 · L 5 · BULK | 271.0 |
| OP07 | 6 | SEC 1 · SR 9 · AA 2 · L 5 · TR 0.5 · BULK | 270.5 |
| OP08 | 5 | SEC 1 · SR 9 · L 5 · TR 0.5 · BULK | 272.5 |
| OP09 | 5 | SR 9 · AA 2 · L 5 · TR 0.5 · BULK | 271.5 |
| OP10 · OP11 · OP12 | 4 each | AA 2 · L 5 · TR 0.5 · BULK | 280.5 |
| OP14 · OP15 | 3 each | AA 2 · L 5 · BULK | 281.0 |
| EB01 | 4 | SEC 0.5 · SR 9 · AA 2 · BULK | 276.5 |

**Schema constraint hit:** `per_case` is `numeric(6,3)` (max 999.999); BULK per_case = per_box × 12
≈ 3,246–3,372 **overflows the column**, so every BULK row carries `per_case = null` with the
derivation in `source_note`. The draft's BULK per_case values (3252 etc.) would have failed insert.
No UI consumes per_case; if it ever should, the column needs widening (migration).

## 3 · §3.5 Box EV UI

Static server JSX in `SealedDetailContent.tsx` at the Phase G seam (below top 10). Two columns
`1fr | 330px`, stacking at 1080px. Left: slot table (RARITY SLOT · PER BOX · AVG PRICE · VALUE / BOX ·
WEIGHT with `--gain-2`/ink proportional bar) + an OPENING EV tfoot row so §8's "total = Σ contributions"
is visually checkable. BULK renders `slot_label` as plain text — `RarityBadge` is only ever called
with a real `game_rarities` code (resolved via the `pull_rates_rarity_game_fk` embed — two FKs exist,
the embed must be named or PGRST201). Right: peach (`--bg-3`) hero with OPENING EV, two comparison
bars scaled by max(price, EV) so box price renders 100% ink in the normal case, sealed premium
(positive = box costs more than contents) with the plain-language read beneath.

- **No rounding drift:** each contribution is cents-rounded BEFORE totalling; total = Σ(rounded).
  Rendered at cents (`fmtMoney2`) in both table and hero.
- **Weights** = rounded contribution / total; data-level Σ = 100%.
- **Caution strip (amended trigger, D7 #5):** only when the top slot by VALUE/BOX has
  `confidence='low'`. Fires on OP09/OP10-class sets (L slot top), not on OP02/EB01.
- **Disclaimer (permanent property):** "PULL RATES ARE COMMUNITY-ESTIMATED AND UNOFFICIAL — BANDAI
  PUBLISHES NONE…" — no improves-later implication.
- **Section absent entirely** when no rows (cut sets + OP16/EB03/PRB01/PRB02) — and on
  **non-`booster_box` products** (see §6.1).
- Em-dash for null avg/weight; zero premium renders `t-flat` (`--ink-3`); all `var(--*)` used exist
  in `globals.css`/`terminal.css`.
- Loader cache key bumped `terminal-sealed-detail-v2` → `-v3` (payload shape changed).

**Boxes shipping Box EV (13):** OP02 OP03 OP04 OP06 OP07 OP08 OP09 OP10 OP11 OP12 OP14 OP15 EB01.
**Hidden (9 boxes):** OP01 Wave 1 + Wave 2, OP05, OP13, EB02 (D7 #3 cuts) · OP16, EB03, PRB01,
PRB02 (no rows — pre-existing gaps). All 22 cases hide (product-type gate).

## 4 · EV spot-checks (script-computed, 2026-07-27 prices — compare against rendered)

Replicated the loader math end-to-end against the live DB (`spotcheck-boxev.mjs`, session scratchpad):

| Set | Opening EV | Slots (value/box) | Top slot → caution | Box price → premium |
|---|---|---|---|---|
| OP02 | **$159.27** | AA $66.35 (41.7%) · SR $46.55 · BULK $39.85 · SEC $5.04 · L $1.48 | AA medium → **no strip** | $605.01 → **+279.9%** |
| OP09 | **$378.93** | L $216.57 (57.2%) · AA $79.16 · BULK $44.36 · SR $22.32 · TR $16.52 | L low → **strip** | $672.23 → **+77.4%** |
| OP10 | **$205.08** | L $58.56 (28.6%) · AA $57.90 · BULK $48.65 · TR $39.97 | L low → **strip** | $239.06 → **+16.6%** |
| EB01 | **$310.28** | BULK $195.39 (63.0%) · AA $66.64 · SR $40.16 · SEC $8.09 | BULK medium → **no strip** | $872.21 → **+181.1%** |

Drift check passed in all four (Σ cents-rounded contributions == total). OP02's EV reproduces the
appendix's population-C figure ($159) exactly. Every premium is positive — the absurd-negatives
failure mode from §S.1 is gone. Prices move daily; a rendered-page comparison should re-run the
script the same day.

§3.4 spot-checks (same run): OP09 baseline $24,214.17, top-10 $20,853.81 → 86.1% of baseline, top
card OP09-118_p2 $5,500 → 22.7%; promo callouts `P-OP09-002` Uta $8,999 + `P-OP09-076` $4,000.
OP02 callouts: `P-OP02-099` $2,200 + `P-OP02-096` $1,900.

## 5 · Retrofit + chip hide

**§3.4 (D7 #6):** tiles rank the baseline population (shared module). Promo callout strip renders
between the summary strip and the grid when excluded cards would have placed in the unfiltered top
10 — top 1–2, name + price, dashed-border strip labeled "PROMO / EVENT CARDS — NOT PULLED FROM
BOOSTERS, EXCLUDED FROM THESE TILES", each linking to `/card/[id]`. Summary strip: SET VALUE stays
the official snapshot; TOP 10 SHARE and TOP CARD ALONE are computed against the page-local baseline
sum and labeled "OF BASELINE VALUE". The baseline sum is computed per request from already-fetched
cards — display denominator, not a stored rollup.

**Dashboard (D7 #2):** `SealedTrackerClient.tsx` gains `RATIO_RANKING_ENABLED = false` — the VALUE
RATIO chip is filtered out of `visibleModes` and `effectiveMode` coerces a stale `ratio` mode to
`trending`. The whole ratio-mode code path (grid unit switch, stacked metric cell, cards footer)
stays intact behind the flag, with a comment naming the revival task (set-value v2 /
`metric_version=2`) and the audit numbers. Per-row ratio values outside the ranking mode — table
columns SET VALUE / RATIO / RATIO Δ, cards secondary stat, footnote — are untouched, as is the
detail page's ratio overlay + facts row (audit: per-product trends honest).

## 6 · Contradictions, judgment calls, surprises

1. **Cases were about to get a per-box EV.** Tracked `booster_box_case` products share the detail
   page; nothing in the brief gated §3.5 by product type, and comparing a case price against a
   per-box EV prints a nonsense premium (~+1,100%). Gated `boxEv` to
   `product_type === 'booster_box'`. When CASES ship, multiply slots by 12 rather than reusing
   per-box rows verbatim (and note the BULK per_case overflow, §2).
2. **OP08 AA dropped without an explicit D7 line-item** — appendix §S.4 #3 said drop-or-resolve;
   seeding a permanently unpriceable slot violates the em-dash-never-zero spirit. Its ~2 pulls/box
   are documented in OP08's BULK source_note (OP08 parallels retained base rarities, so its SR
   average already blends parallels — also noted in the SR row).
3. **The briefing's surviving-coverage shorthand ("SR/SEC/AA/BULK on OP02–OP09 + TR") is not exactly
   what the literal rule produces.** Differences, all flagged rather than silently absorbed:
   (a) **L rows survive** everywhere (EN-sourced, no ×2 derivation) — and L is now the TOP EV
   contributor on OP09/OP10-class sets because the L class averages include leader parallels
   (appendix S.3 documented this), which is what drives their caution strips. If Justin intended L
   dropped, remove the 12 L rows and re-derive BULK (+5 each).
   (b) **OP09 SEC is dropped** (its row carries the explicit ×2 marker) although the shorthand reads
   as SEC-through-OP09.
   (c) **EB01 SEC survives** ("no per-box source", a conservative guess — not ×2-derived); it is the
   weakest kept row and is labeled as such in its source_note.
4. **OP10–OP15 EVs are structurally understated:** with SEC/SR dropped as JP-anchored, ~7–9 real hit
   cards per box sit inside the BULK remainder at bulk prices. Every affected BULK source_note says
   so. If this reads worse than hiding those sets, the fix is a D8 call (seed SEC/SR from EN breaks
   at low, or cut the sets), not a code change.
5. **Per-tile "% OF SET" became "% OF BASELINE".** Decision 6 named the strip's share figures; the
   per-tile share is the same class of figure fed by the same polluted denominator, so it moved to
   the baseline denominator too (field renamed `pctOfSet` → `pctOfBaseline`). If Justin wanted the
   per-tile figure left on the snapshot denominator, revert the denominator in the loader's
   `pctOfBaseline` fill and relabel.
6. **Appendix's EB01 leak not reproducible** (§1 table) — today's `EB01-003-regional-prize` id is
   caught by the original marker list. Catalog churn between probes is the likely cause; defensive
   name markers added.
7. **Sealed premium uses the delta color convention** (positive green) to satisfy §8's blanket
   delta rule; semantically a premium is neutral, so if design review prefers ink, change
   `deltaCls` → static class in the premium block only.
8. **BULK per_case overflow** (§2) — the draft would not have inserted as written; recorded here
   because the verification agent should not "fix" the nulls back to ×12 values.

## 7 · What the verification agent should do

- `npm run build` (static generation hits the DB — pull_rates now has rows) and
  `npm run audit:game-boundaries`.
- Render OP02 + OP09 detail pages; compare Box EV numbers to §4 (re-run the spot-check script
  same-day; prices drift daily). Check: OPENING EV equals the VALUE/BOX column sum on the page,
  caution strip on OP09 but not OP02, promo strip present on both, no §3.5 section on
  romance-dawn/awakening/carrying-on/anime-25th/OP16/EB03/PRB pages, no §3.5 on any case page.
- Dashboard: VALUE RATIO chip absent; SET VALUE chip present; table view still shows the three
  ratio columns.

## Classifier hardening

**Date:** 2026-07-27 · **Files:** `src/lib/games/one-piece/booster-baseline.ts` (restructured),
`scripts/audit-booster-baseline.mjs` (new tripwire), `package.json` (`audit:booster-baseline`).
Prompted by the final-acceptance §C13b finding: `EVENT_ID_MARKERS` only ever caught what someone
had already noticed (four hit-class leaks needed a fourth round of marker additions).

### The id grammar (full-catalog sweep, 2026-07-27, 5,053 one_piece ids, all regions)

Every `card_image_id` decomposes as `<PRINTEDCODE>-<number>[_<variant>]` for booster paper, while
product/venue-origin cards append **extra hyphen segments after the number**
(`OP09-001-magazine-promo`, `EB01-003-regional-prize`). Variant axes (`_p1` parallels ×1,007,
`_r1` reprints ×328, `_sp_*`, `_jp_*`, `_tr_*`) are always underscore-spelled; zero ids carry
both a hyphen suffix and an underscore suffix. Shape census: 4,063 plain · 656 `P-` promo ids ·
327 hyphen-suffixed · 7 malformed. The 327 hyphen-suffixed ids span **33 distinct suffix tokens,
every one a product/event/venue distribution** — the entire 20-entry `EVENT_ID_MARKERS` list was
one structural rule wearing twenty disguises.

**False-exclusion hunt (why the rule has two guards, not an allowlist):**

- `OP07-OP07-037` "More Pizza!!" (UC $0.09) and `OP16-OP16-011-TR` "Vista (TR)" ($23.26) —
  malformed doubled-code ids for real booster cards. Guard: the segment after the set code must
  be all digits or the grammar does not apply.
- `OP09-078-r1` "Gum-Gum Giant (Reprint)" (R $0.36) — a hyphen-spelled twin of the `_r1` reprint
  ids; reprints stay included by design. Guard: a lone trailing `r<digits>` segment is a variant,
  not a product origin.

With both guards: **zero false exclusions across the catalog.** `EVENT_ID_MARKERS` is deleted;
rule 2 is now `hasProductOriginIdSuffix()` — explicit `indexOf`/`split`/`charCodeAt` parsing of a
measured grammar, not a regex catch-all (CLAUDE.md §8 honored in letter and intent: the sweep is
the evidence that the shape means what we claim). `P-` rule, PR-rarity rule, base-rarity
parallel/name rules, and the curated list are unchanged; the `"event-id"` reason literal is kept
so no consumer changes.

### Exclusion diff (structural rule vs the 20-marker list, whole catalog)

**Newly excluded — 18 leaks the marker list missed** (17 structural + 1 name-marker, below):
7× `-gift-collection` (ST01-006 at **$309.95**, ST01-013 $76.15, ST01-008 $70.63, ST03-008
$31.52, OP01-021 $25.74, ST01-005 $14.31, ST09-012 —), 2× `-sound-loader` (EB02-010 $46.54,
OP05-098 —), 3× `-tournament-prize` (ST13, unpriced), 2× `-crossover-promo` (EB02-010 Dodgers,
ST13-003 BVB, unpriced), 1× `-treasure-booster` (ST10-006 $11.58), 1× `-sealed-battle-kit`
(OP04-083, unpriced), 1× `-special-event` (ST01-007, unpriced). **Lost exclusions: zero.**
9 already-excluded PR promo ids flip reason `pr-rarity`→`event-id` (rule order), inclusion
unchanged.

**EV impact: none.** No newly excluded card lands in a seeded set's priced slot (they sit in
ST/OP01/OP05/OP13/EB02 populations or carry no price). All 13 Box EVs recomputed old-vs-new with
the real module: identical to the cent — OP09 **$293.32** (post-§C13b figure, slots AA 79.16 ·
TR 16.52 · SR 22.32 · L 130.96 · BULK 44.36), OP02 **$159.27** (AA 66.35 · SEC 5.04 · SR 46.55 ·
L 1.48 · BULK 39.85) — matching the final-acceptance recompute.

**One new plain-id leak found by the calibration sweep:** `OP13-084` "St. Shepherd Ju Peter
**(Parallel)**" — R rarity, plain id, $18.12 vs OP13 R-base median $0.21 (86×). Its Gorosei
siblings `OP13-080_p2`…`OP13-091_p2` are R parallels at $399–494; this is parallel data landed on
the base id (jp row `OP13-084_jp_10106` prices the true base at $0.21). It is the only plain-id
row in the catalog named "(Parallel)" — every other one sits on a `_p*` id — so `"(Parallel)"`
joins `BULK_NAME_MARKERS` (same precedent as `"(SP)"`/OP06-047). OP13 is unseeded: no EV change.

### The tripwire — `npm run audit:booster-baseline`

Sweeps the live catalog (en, priced, deduped — loader parity) with the **real classifier module**
(Node type-stripping import, never a re-implementation) and flags included cards via three
detectors; nonzero exit + named rows on any flag:

- **A · grammar invariant** — an included card with a `P-` id, a product-origin suffix, or PR
  rarity. Zero by construction; fires on classifier regressions.
- **B · peer-median multiple** — within `(printed_set_code, rarity, variant-bucket)` peers
  (base/parallel/reprint/other buckets stop chase parallels being compared to bulk), flag
  price > **250×** group median, groups of **8+**. Calibration: largest legit multiple today is
  211× (ST21-009 "Nami" $31.62 vs $0.15 median — real chase paper, must not flag); smallest
  known-leak multiple is 382× (OP06-047 were its name rule to regress); the OP09 L leaks sit at
  909–965×, OP04-015 at ~1,000×.
- **C · base-bucket absolute ceiling** — any plain-id card above **$400**. The most expensive
  legit plain-id card in the catalog is ST10-010 (TR) $141.80; ~2.8× headroom. Covers sparse
  groups B must skip (the $1,582 anniversary-set MR had no peers to median).

**Acceptance, both proven 2026-07-27:** normal run → 4,390 priced cards, 3,369 included, **0
flags, exit 0**. `--selftest` (re-includes the four §C13b leaks) → `OP09-001-magazine-promo`
caught via A+B, `OP09-061-special-edition` A+B, `OP09-051-anniversary-set` A+C,
`OP07-051-alt-art-promo` A. Documented blind spot: a plain-id product card priced *inside* the
legit envelope with no same-class peers (the OP07-051 $141.90 pattern) is invisible to price
detectors — only its id gives it away, which is exactly what the structural rule now reads.

`npm run lint` clean after the restructure.
