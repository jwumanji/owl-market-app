# Moon Terminal — Sealed Product Detail · Spec v1.1

> Route: `/terminal/sealed/[productSlug]`
> Visual reference: `mockups/moon-terminal-sealed-detail.html`
> Dashboard reference: `mockups/moon-terminal-sealed.html`
> Parent: `/terminal/sealed` (the grid/table dashboard)
> Design system: C1.5 Playful Modern (unprefixed tokens)

---

## 0 — Scope

One page, six stacked sections. Entered by clicking any product row in the Sealed Tracker grid, table, or card view.

| # | Section | Blocks on |
|---|---|---|
| 1 | Hero rail | nothing — ships first |
| 2 | Price history (chart + table) | `sealed_weekly_prices`, `set_weekly_values` |
| 3 | Market stats | `sellers` from JustTCG |
| 4 | Top 10 cards | existing card data |
| 5 | Box EV | `pull_rates` table (new, admin-seeded) |

Ship 1→2→3→4, then 5. Box EV last because it's the only section needing new hand-curated data.

**Note:** an earlier draft had a separate sixth "Weekly snapshots" section. It's been folded into §2.2's table view — selecting `1Y + TABLE` *is* the weekly history, and 30D/90D give daily resolution the standalone section couldn't. Sellers moved into that table.

---

## 1 — Data model

### 1.1 New tables

```sql
-- sealed products catalog
create table sealed_products (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,       -- 'op-05-booster-box-en'
  set_code          text not null,              -- 'OP-05'  (FK-ish to sets)
  product_type      text not null,              -- 'booster_box' | 'case' | 'starter_deck' | 'premium'
  language          text not null default 'EN', -- 'EN' | 'JP'
  display_name      text not null,              -- 'Awakening of the New Era'
  packs_per_unit    int,                        -- 24
  cards_per_pack    int,                        -- 12
  msrp_usd          numeric(10,2),              -- 103.68
  release_date      date,
  justtcg_variant_id text,                      -- pricing join key
  image_url         text,
  is_tracked        boolean not null default true,
  created_at        timestamptz default now()
);
create index on sealed_products (set_code, language);

-- weekly price snapshots (one row per product per week)
create table sealed_weekly_prices (
  product_id   uuid not null references sealed_products(id) on delete cascade,
  week_ending  date not null,                   -- always a Saturday, UTC
  market_price numeric(10,2) not null,
  low_price    numeric(10,2),
  sellers      int,
  source       text not null default 'justtcg',
  captured_at  timestamptz not null default now(),
  primary key (product_id, week_ending)
);

-- set singles rollup, snapshotted weekly (powers Value Ratio)
create table set_weekly_values (
  set_code    text not null,
  week_ending date not null,
  total_value numeric(12,2) not null,           -- sum of one copy of every card
  card_count  int not null,
  primary key (set_code, week_ending)
);

-- pull rates, hand-curated per set (powers Box EV)
create table pull_rates (
  set_code       text not null,
  rarity         text not null,                 -- 'MR' | 'GMR' | 'SEC' | 'SP' | 'TR' | 'AA' | 'SR' | 'L' | 'BULK'
  per_box        numeric(6,3) not null,         -- expected count per box (0.35 = 1 per ~3 boxes)
  source_note    text,                          -- 'community box breaks, n=412'
  confidence     text not null default 'medium',-- 'high' | 'medium' | 'low'
  updated_at     timestamptz default now(),
  primary key (set_code, rarity)
);
```

**`card_image_id` reminder:** when averaging singles prices per rarity slot, group on `card_image_id`, never `card_number` — parallels and alt-arts share numbers. Use explicit `includes()` checks for `_p1` / `_p2` suffixes, no regex catch-alls.

### 1.2 Derived values (compute, don't store)

| Value | Formula |
|---|---|
| `off_ath` | `(current − ath) / ath × 100`, ath = max over all snapshots |
| `vs_msrp` | `(current − msrp) / msrp × 100` |
| `value_ratio` | `set_weekly_values.total_value / market_price` for the same `week_ending` |
| `volatility_12w` | mean of `abs(w/w %)` over trailing 12 weeks |
| `price_per_pack` | `market_price / packs_per_unit` |
| `box_ev` | `Σ (pull_rates.per_box × avg_price_of_rarity)` |
| `sealed_premium` | `(market_price − box_ev) / box_ev × 100` |
| `sealed_rank` | rank by `market_price` among `is_tracked = true`, same type + language |

---

## 2 — Section specs

### 2.1 Hero rail

3-column grid: `200px | 1fr | 300px`. Collapses to `170px | 1fr` at 1080px (facts panel spans full width), single column at 720px.

**Left** — box art, 5:6 aspect, 1.5px ink border, `--r-lg`, `6px 6px 0` hard shadow. Fallback: gradient panel with set code + product type.

**Center** — mono eyebrow (`SEALED PRODUCT · ENGLISH`), H1 with the last two words in Caveat gradient (**needs `padding-right: 13px`** — Caveat clips its tail under `background-clip:text`), then:
- Price at 48px JetBrains Mono, `-1.8px` letter-spacing
- Four delta chips: 7D / 30D / 90D / 1Y. Ink border, white fill, mono label in `--ink-3`
- 52-week range bar: gradient track (loss-tint → peach → gain-tint), 4px ink marker positioned at `(current − atl) / (ath − atl) × 100%`, value label above. ATL and ATH below with dates.

**Right** — key facts panel (MSRP, vs MSRP, released, set value, value ratio, sellers with W/W delta), then `+ WATCHLIST` (ink fill) and `CSV` buttons.

**Edge cases:** `msrp_usd` null → hide both MSRP rows. Fewer than 52 weeks of history → label the bar with the actual span (`"38-WEEK RANGE"`). `ath === current` → marker at 100%, show `AT ATH` in `--gain` instead of the off-ATH figure.

### 2.2 Price chart

Inline SVG, `viewBox="0 0 1000 320"`, no chart library needed. Chart.js is already in the repo if preferred — either is fine, but the overlay-normalization logic below is the part that matters.

**View toggle:** cobalt `CHART | TABLE` segment, chart default. The table renders the active timeframe's raw snapshots — date, box price, change, set value, ratio, sellers — newest first, sticky header, `max-height: 452px` with internal scroll. Footer strip states the resolution (`DAILY` / `WEEKLY` / `MONTHLY`) so a row's meaning is unambiguous.

Overlay buttons **hide** in table mode. They only affect the chart, and leaving them visible implies they filter columns.

**Timeframes:** 30D (daily) · 90D (daily) · 1Y (weekly) · **ALL** (monthly, since release). Default 90D. Timeframe drives both views.

**Overlays:** two independent toggles — `SET VALUE` (gold, dashed) and `VALUE RATIO` (cobalt `--select`, dashed).

**The scale rule — important.** With no overlay active, the y-axis is raw USD and the box price line gets a 12%-opacity area fill. The moment *any* overlay is on, all series switch to **indexed at 100 = first point in window**, the area fill is dropped, and the axis label becomes `INDEXED · 100 = <start date>`. Mixing dollars and a multiplier on one axis is meaningless; indexing makes them comparable. This is the CoinGecko "compare against BTC" behavior.

**Hover:** transparent `<rect>` over the plot area, `mousemove` → nearest index → dashed vertical crosshair + ink tooltip listing every active series with color swatches. Bind `touchmove` too (passive) for mobile. Clamp the tooltip inside the wrapper.

**Footer strip:** peach, 1.5px ink top border, legend for active series, right-aligned point count and date span.

**Charts are always green** per the established convention (`#2D9961` line and fill). Gold and cobalt are overlay-only.

### 2.3 Market stats

6-up grid of stat cards, 3-up at 1180px, 2-up at 720px. Hover: `translate(-2px,-2px)` + `4px 4px 0` ink shadow.

Off ATH · 12W volatility · sellers (with direction and a `TIGHTENING` / `LOOSENING` note) · cards per box · $ per pack (with MSRP per pack beneath) · sealed rank.

Sellers falling while price rises is the supply-drying signal — the sub-label should say so.

### 2.4 Top 10 cards

Sits **above** Box EV — it's the section that explains why the box moved, and it reads faster than the EV table.

**Summary strip** above the grid, peach with 1.5px ink border: top 10 combined value · set value · share of set · and the top card's own share. That last figure is the story on most sets (Katakuri alone is 12.3% of OP-05).

**Grid:** 5-up × 2 rows. 4-up at 1180px, 3-up at 940px, 2-up at 640px — more columns as it narrows so total height stays roughly flat.

**Tile:** art panel at **4:3** (not 5:7 — portrait made the two-row block dominate the page), rank badge top-left, rarity chip top-right inside the art panel, then name (single line, ellipsis), card number, price, and one combined line of `7D delta · % OF SET`.

Sorted by price descending. Whole tile links to `/card/[card_image_id]`. `ALL <n> CARDS →` in the section header goes to set detail.

### 2.5 Box EV

Two columns: `1fr | 330px`, stacks below 1080px.

**Left — slot table.** Columns: rarity slot (chip + name + source note) · `PER BOX` · `AVG PRICE` · `VALUE / BOX` · `WEIGHT`. Weight shows the percentage plus a proportional bar (`--gain` fill, ink border) so concentration is scannable rather than read — MR and GMR together are ~49% of a box's value off 0.45 expected cards, and the bars make that obvious at a glance. Column is named `VALUE / BOX`, not `EV CONTRIB`. Totals row on `#FEF3E0` with a 1.5px ink top border.

Rarity chips use the **Option A palette** — MR/GMR are apex (ink fill, gold border, gold text). Reuse the canonical `RarityBadge` component; no inline chips.

**Right — summary.** Peach hero showing opening EV, then two comparison bars (box price at 100% ink, opening EV proportional in green), then sealed premium.

**Copy matters here.** The premium figure needs a plain-language read beneath it, because the number is counterintuitive on its own: *"The box trades 66% above what its cards are worth. Sealed is priced for scarcity, not contents."* Sign convention: premium positive = box costs more than contents = sealed is expensive.

**Confidence surfacing.** Any set where `pull_rates.confidence = 'low'` on any slot gets a peach caution strip above the table naming the estimate as rough. Sets with no `pull_rates` rows hide section 4 entirely rather than showing zeros.

The footnote disclaimer is mandatory and non-negotiable: estimates from community-sourced pull rates, not a guarantee of any individual box.

## 3 — Chrome

Nav matches the main site exactly: `HOME · MARKETS · RARITIES · PROMOS · SETS · CHARACTERS · PORTFOLIO · ALERTS · TERMINAL`, with LIVE badge, search, Login / Sign Up, and the ticker bar beneath. TERMINAL carries a gradient `PRO` chip.

Third row is the Terminal sub-nav: `SEALED · CHASE · MOVERS · SET INDEX · BOX EV`, gold underline on active.

Breadcrumb above the hero: `TERMINAL / SEALED / OP-05 BOOSTER BOX`.

Responsive nav collapse: search hides at 1180px, main links hide at 1080px (TERMINAL stays), Login and LIVE hide at 720px.

Add `.terminal-page` to the `body:has()` cream-background rule list in `globals.css`.

**Terminal gradient (new token).** The sub-nav band uses a blue→green gradient distinct from the sunset brand gradient:

```css
--grad-terminal: linear-gradient(100deg,#1E7FA8 0%,#1C9C9C 40%,#1FAE86 72%,#3EC08A 100%);
```

Links white at 86% (full white on hover), active underline `#FFD166`, `inset 0 1px 0 rgba(255,255,255,.28)` top highlight, 44px tall. The `PRO` chip in the main nav uses the same gradient so the chip and band read as one product. This is a **second** gradient in a system that reserved gradients for brand use — justified because Terminal is a separate paid surface, but it needs writing into the brand bible rather than living as a one-off.

**Container padding rule — this bit us on this page.** Any element wearing `.container` must use `padding-left` / `padding-right` and `margin-top` / `margin-bottom` **longhand only**. The shorthand silently resets the side padding to 0 and, worse, `margin: Xpx 0 Ypx` overwrites `.container`'s `margin: 0 auto`, so the section stops centering and hugs the viewport edge. Four rules on this page had it (`.crumbs`, `.hero`, `.footnote`, and `.stat-rail` on the dashboard) and it presented as a mysterious left-alignment bug.

---

## 4 — Ingestion

| Job | Cadence | Writes |
|---|---|---|
| `sealed-weekly-snapshot` | Sat 06:00 UTC | `sealed_weekly_prices` |
| `set-value-rollup` | Sat 06:15 UTC | `set_weekly_values` |

Run the rollup *after* the price snapshot so the ratio has both sides for the same `week_ending`. Both idempotent — re-running a week overwrites rather than duplicating.

JustTCG notes: auth header is `x-api-key`. Sealed products come back through the same `/cards` endpoint using `condition=Sealed` (or `S`); `/sets` exposes `sealed_count` for reconciliation. **Verify One Piece sealed coverage per plan before building the job** — confirm boxes and cases both return, and confirm sealed variants carry price history (`{p, t}` objects, Unix seconds). If history is missing, snapshots start accumulating from day one and the ALL timeframe stays short until enough weeks land.

---

## 5 — Acceptance criteria

- `npm run lint` and `npm run build` clean
- Chart renders correctly at all four timeframes with all four overlay combinations (none / SV / RT / both)
- Overlay activation switches the axis to indexed mode; deactivating all overlays restores USD and the area fill
- Hover tooltip works with mouse and touch, stays inside its container at both edges
- Range bar marker lands correctly for a product at ATH (100%) and at ATL (0%)
- Section 4 hides cleanly for a set with no `pull_rates` rows; low-confidence sets show the caution strip
- Box EV total equals the sum of its slot contributions — no rounding drift in the totals row
- `CHART | TABLE` toggle preserves the selected timeframe in both directions
- Overlay buttons hidden in table mode, restored on return to chart
- Box EV weight bars sum to 100% with no rounding drift
- Top 10 tile names truncate rather than wrapping to a second line at every breakpoint
- Deltas: green above zero, red below, `--ink-3` at exactly zero
- Mobile 380px: no horizontal page scroll; tables scroll within their own containers only
- Cold-page LCP measured after deploy, per the standing PSI-retest rule. The hero art is the likely LCP element — make sure it isn't webfont-blocked.

---

## 6 — Open questions

1. **MSRP source.** No API provides it. Hardcode per product in `sealed_products`, admin-editable. Confirm the OP booster box figure — spec assumes $103.68 ($4.32 × 24).
2. **`sellers` history.** JustTCG returns a current count; nothing stores it over time. Section 2.6's sellers column needs the snapshot job to persist it from week one.
3. **Case products.** `product_type = 'case'` is in the schema but the dashboard has CASES disabled. Detail page should handle a case with `packs_per_unit = null` — hide the per-pack stat.
4. **JP counterpart.** Once JP coverage is confirmed, the hero gains a `JP / EN` switch and the chart gains a JP overlay. Schema already supports it via `language`.

---

## 7 — Backlog: PSA graded data (not in v1)

Deferred, but recorded so the schema isn't designed into a corner.

**Two surfaces**

1. **Set-level graded panel** on this page — total pop across the set, grade distribution, pop growth W/W. Rising pop means singles supply is inflating, which is a genuine bear signal the sealed price doesn't show.
2. **Per-card gem rate** — a `GEM %` column in the Top 10 grid, full grade breakdown on `/card/[id]`.

**Blocking decision: source.** PSA's public API covers cert verification and order status, not pop reports. Candidates, in order of preference:

| Option | Trade-off |
|---|---|
| Third-party aggregator (GemRate-style) | Paid, but structured and stable |
| Scrape PSA pop report pages | Free, fragile, ToS exposure |
| Cert-lookup crawl | Slow, incomplete coverage |

Pick before writing schema — the row shape differs materially between them.

**Design constraints**

- **Pop is monotonic.** It only grows, so momentum requires snapshots. Start capturing from the first day the source lands, exactly as with `sellers`.
- **Gem rate is submitter-biased.** People grade copies that already look clean, so a 45% gem rate is not a 45% population estimate. Label it as *submitted* gem rate, never implied population quality. This bias is the argument for Owl Pregrade — measured centering is the unbiased signal gem rate can't be.
- Join on `card_image_id`, not `card_number` — parallels and alt-arts grade as distinct specs.

**Sketch**

```sql
create table psa_pop_snapshots (
  card_image_id text not null,
  psa_spec_id   text,
  week_ending   date not null,
  total_graded  int not null,
  pop_10        int, pop_9 int, pop_8 int, pop_7 int, pop_6_and_below int,
  source        text not null,
  primary key (card_image_id, week_ending)
);
```

`gem_rate = pop_10 / total_graded`, computed not stored.
