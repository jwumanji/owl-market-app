# Moon Terminal — Sealed Module · Spec v2.0

> **Routes:** `/games/[game]/terminal/sealed` and `/games/[game]/terminal/sealed/[productSlug]`, each mirrored at `/terminal/sealed…` for the default game
> **Mockups:** `mockups/17-moon-terminal-sealed.html`, `mockups/18-moon-terminal-sealed-detail.html`
> **Design system:** C1.5 Playful Modern
> **Supersedes v1.1**

---

## 0 — What changed from v1.1, and why

v1.1 was written from the mockups without verifying the repo. Recon found twelve conflicts. All are resolved below; this section is the summary so you don't have to diff.

| # | v1.1 claimed | Reality | Resolution |
|---|---|---|---|
| 1 | files in `docs/specs/` | doesn't exist; mockups are numbered at repo root | `docs/` + `mockups/17|18-*` |
| 2 | `--gain` / `--loss` | repo has `--gain-2` / `--loss-2` | use repo names, **no aliases** |
| 3 | `--line` exists | it doesn't | add it as a real token |
| 4 | `--grad-terminal` is a token add | it's a brand-bible change | add it, and log it as a system change |
| 5 | `.container`, 1460px | no `.container`; canvas is 1280px | per-page shell class, **stay at 1280** |
| 6 | add to `body:has()` bg list | no such rule; body is already cream | drop the instruction entirely |
| 7 | nav has PROMOS/PORTFOLIO/ALERTS | those don't exist; Catalog does | use the real nav |
| 8 | tables have no `game_id` | every public query is game-scoped, v40 enforces it | **`game_id` on all four tables** |
| 9 | `language` column | repo models this as `region` (v45) | use `region` |
| 10 | reuse `RarityBadge` | repo chips are solid-fill, mockup chips are outline | **use `RarityBadge`**; mockup palette does not ship |
| 11 | sub-nav in the nav component | `Nav` variant is `public\|admin` only | separate `TerminalSubNav` via a route-group layout |
| 12 | hand-rolled SVG chart | `chart.js` + `react-chartjs-2` already ship | **use chart.js** for the main chart |

**Three of these change the build, not just the wording:** #8 (game scoping), #10 (the pages will not look like the mockups in the rarity chips), and #12 (chart library).

**Standing correction:** where this spec and a mockup disagree, **the spec wins**. The mockups were built standalone and carry tokens and a canvas width the repo doesn't have.

---

## 1 — Scope and order

Five sections on the detail page, one dashboard.

| Phase | Deliverable | Blocked on |
|---|---|---|
| A | Tokens + Terminal shell + sub-nav | nothing |
| B | Migration v46 (four tables) | hand-application, no DDL via client |
| C | Catalog seed + ingestion + backfill | JustTCG sealed coverage confirmed |
| D | Dashboard | B, C |
| E | Detail §3.1 hero + §3.2 price history | D |
| F | Detail §3.3 stats + §3.4 top 10 | E |
| G | Detail §3.5 Box EV | F + `pull_rates` seeded |

Box EV is last because it's the only section needing hand-curated data that doesn't exist yet.

---

## 2 — Data model

### 2.1 Game scoping — read this first

Every public table in this repo carries `game_id`, every public query filters on it, migration **v40** enforces the boundary, and `npm run audit:game-boundaries` will fail a build that violates it.

All four new tables therefore carry `game_id`. Match the column type used by `cards.game_id` — do not assume uuid.

`region` follows the v45 convention (`'en'`, `'jp'`), lowercase. There is no `language` column anywhere in this codebase and we are not introducing a second vocabulary.

### 2.2 Migration v46

Head is currently v45. Numbering has collided historically (two each of v14, v22, v24, v25, v34, v41, v44), so **verify no v46 exists before writing it**.

There is no DDL access through the Supabase client. This migration is hand-applied via the SQL editor, same as v44 `jp_prices`.

```sql
-- schema-migration-v46-terminal-sealed.sql

create table sealed_products (
  id                 uuid primary key default gen_random_uuid(),
  game_id            <match cards.game_id> not null references games(id),
  slug               text not null,
  set_code           text not null,
  product_type       text not null,          -- 'booster_box' | 'case' | 'starter_deck' | 'premium'
  region             text not null default 'en',
  display_name       text not null,
  packs_per_unit     int,
  cards_per_pack     int,
  msrp_usd           numeric(10,2),
  release_date       date,
  justtcg_variant_id text,
  image_url          text,
  is_tracked         boolean not null default true,
  created_at         timestamptz default now(),
  unique (game_id, slug)
);
create index on sealed_products (game_id, region, set_code);

create table sealed_weekly_prices (
  product_id   uuid not null references sealed_products(id) on delete cascade,
  game_id      <match> not null references games(id),
  week_ending  date not null,               -- Saturday, UTC, always
  market_price numeric(10,2) not null,
  low_price    numeric(10,2),
  sellers      int,
  source       text not null default 'justtcg',
  captured_at  timestamptz not null default now(),
  primary key (product_id, week_ending)
);
create index on sealed_weekly_prices (game_id, week_ending);

create table set_weekly_values (
  game_id     <match> not null references games(id),
  set_code    text not null,
  region      text not null default 'en',
  week_ending date not null,
  total_value numeric(12,2) not null,
  card_count  int not null,
  primary key (game_id, set_code, region, week_ending)
);

create table pull_rates (
  game_id     <match> not null references games(id),
  set_code    text not null,
  rarity      text not null,                -- 'GMR'|'MR'|'SEC'|'SP'|'TR'|'AA'|'SR'|'L'|'BULK'
  per_box     numeric(6,3) not null,
  source_note text,
  confidence  text not null default 'medium', -- 'high'|'medium'|'low'
  updated_at  timestamptz default now(),
  primary key (game_id, set_code, rarity)
);
```

RLS: public read, no public write, matching how existing public tables are configured.

**`card_image_id` is the canonical key.** Anywhere singles are aggregated — set value rollup, rarity averages for Box EV, top 10 — group on `card_image_id`, never `card_number`. Parallels and alt-arts share numbers but have unique `_p1` / `_p2` suffixed image ids. Variant detection uses explicit `includes()` checks; **no regex catch-alls**.

### 2.3 Derived values — compute, never store

| Value | Formula |
|---|---|
| `off_ath` | `(current − ath) / ath × 100`, ath = max across all snapshots |
| `vs_msrp` | `(current − msrp) / msrp × 100` |
| `value_ratio` | `set_weekly_values.total_value / market_price`, same `week_ending` |
| `volatility_12w` | mean of `abs(w/w %)` over trailing 12 weeks |
| `price_per_pack` | `market_price / packs_per_unit` |
| `box_ev` | `Σ (pull_rates.per_box × avg_price_of_rarity)` |
| `sealed_premium` | `(market_price − box_ev) / box_ev × 100` |
| `sealed_rank` | rank by `market_price` among `is_tracked`, same `game_id` + `product_type` + `region` |

---

## 3 — Detail page sections

### 3.0 Layout shell

No `.container` class exists. Follow the per-page pattern:

```css
.terminal-page { padding: 24px; max-width: 1280px; margin: 0 auto; }
```

**Canvas stays at 1280.** The mockups were built at 1460 and both pages were tuned for it. Do not widen the site for one module. Consequences to absorb:

- Hero grid `200px | 1fr | 300px` gets tight — reflow the facts panel to full-width one breakpoint earlier than the mockup does
- Stat rail goes 6-up → **3-up at 1180px**, not the mockup's later breakpoint
- The dashboard grid already has `min-width` plus sticky metric and product columns. Horizontal scroll there is **designed behavior**, not a failure — do not remove it to fit

### 3.1 Hero rail

Breadcrumb, then a three-column grid: box art (5:6, 1.5px ink border, `6px 6px 0` hard shadow) · main · key facts panel.

Main column: mono eyebrow, H1 with the last two words in Caveat gradient (**`padding-right: 13px` required** — Caveat clips its tail under `background-clip:text`), price at 48px mono, four delta chips (7D/30D/90D/1Y), then the 52-week range bar.

Range bar: gradient track, 4px ink marker at `(current − atl) / (ath − atl) × 100%`, value label above, ATL and ATH with dates below.

Facts panel: MSRP · vs MSRP · released · set value · value ratio · sellers with W/W delta. Then `+ WATCHLIST` and `CSV`.

**Edge cases.** Null `msrp_usd` → hide both MSRP rows. Fewer than 52 weeks of history → relabel to the real span (`"38-WEEK RANGE"`). `ath === current` → marker at 100%, show `AT ATH` in `--gain-2` instead of an off-ATH figure.

### 3.2 Price history

**Use `chart.js` + `react-chartjs-2`.** Both already ship. Follow the existing pattern in `SetChartClient.tsx` / `CardDetailClient.tsx`: a `"use client"` component calling `ChartJS.register(...)` at module scope with only the elements it needs.

Do not port the mockup's hand-rolled SVG chart. It exists because the mockup was standalone.

**View toggle:** cobalt `CHART | TABLE`, chart default. **Timeframes:** 30D (daily) · 90D (daily) · 1Y (weekly) · ALL (monthly, since release). Default 90D. Timeframe drives both views and survives toggling between them.

**Overlays:** `SET VALUE` (gold, dashed) and `VALUE RATIO` (`--select` cobalt, dashed), independent toggles.

**The scale rule — this is the part that's easy to get wrong.** With no overlay, the y-axis is raw USD and the price line carries a 12%-opacity area fill. The moment *any* overlay activates, all series switch to **indexed at 100 = first point in window**, the area fill drops, and the axis label becomes `INDEXED · 100 = <start date>`. Plotting dollars against a multiplier on one axis is meaningless. This is the CoinGecko "compare against BTC" behaviour.

**Table view:** active timeframe's raw snapshots — date, box price, change, set value, ratio, sellers — newest first, sticky header, `max-height: 452px` with internal scroll. Footer states the resolution (`DAILY` / `WEEKLY` / `MONTHLY`).

Overlay buttons **hide** in table mode. They only affect the chart; leaving them visible implies they filter columns.

Chart hover works on mouse and touch; tooltip stays inside its container at both edges.

### 3.3 Market stats

6-up stat cards, **3-up at 1180px**, 2-up at 720px. Hover: `translate(-2px,-2px)` + `4px 4px 0` ink shadow.

Off ATH · 12W volatility · sellers · cards per box · $ per pack · sealed rank.

Sellers falling while price rises is the supply-drying signal. The sub-label says so (`TIGHTENING` / `LOOSENING`) rather than just printing a number.

### 3.4 Top 10 cards

Sits **above** Box EV — it explains why the box moved and reads faster than the EV table.

Summary strip above the grid: top 10 combined · set value · share of set · top card's own share. That last figure is usually the story (Katakuri alone is ~12% of OP-05).

Grid 5-up × 2 rows → 4-up at 1180 → 3-up at 940 → 2-up at 640. Column count rises as width drops so total height stays roughly flat.

Tile: **4:3** art panel (not 5:7 — portrait made the block dominate the page), rank badge top-left, `RarityBadge` top-right inside the art panel, name on one line with ellipsis, card number, price, then one combined line of `7D delta · % OF SET`.

Sorted by price descending. Whole tile links to `/card/[card_image_id]` — game-scoped variant where applicable.

### 3.5 Box EV

Two columns `1fr | 330px`, stacking below 1080px.

**Left — slot table.** Columns: rarity slot · `PER BOX` · `AVG PRICE` · `VALUE / BOX` · `WEIGHT`. Weight is the percentage plus a proportional bar (`--gain-2` fill, ink border) so concentration is scannable rather than read. MR and GMR together are ~49% of a box's value off 0.45 expected cards — the bars make that obvious at a glance.

Column is named `VALUE / BOX`, not `EV CONTRIB`.

**The BULK row has no rarity code.** `RarityBadge` returns null for null and falls back to `c-rar-c` for anything unrecognised — both wrong here. Render a plain text label (`R / UC / C bulk`) with no badge. Do not pass `'BULK'` to `RarityBadge`.

**Right — summary.** Peach hero with opening EV, two comparison bars (box price at 100% ink, opening EV proportional in `--gain-2`), then sealed premium.

Sign convention: **positive premium = box costs more than its contents.**

The premium figure needs its plain-language read beneath it — the number is counterintuitive alone: *"The box trades 66% above what its cards are worth. Sealed is priced for scarcity, not contents."*

**Behaviour:** sets with no `pull_rates` rows **hide the section entirely** — never render zeros. Any set with a `confidence = 'low'` slot gets a caution strip above the table.

Footnote disclaimer is mandatory: estimates from community-sourced pull rates, not a guarantee of any individual box's contents.

---

## 4 — Dashboard

Route `/games/[game]/terminal/sealed`, mirrored at `/terminal/sealed`.

**Stat rail** — sealed index, breadth, top gainer, top loser. All recomputed from the active period.

**Six ranking chips** — `TRENDING · VALUE RATIO · PRICE · SET VALUE · OFF ATH · RELEASE`. `RELEASE` reverses direction on second click, arrow updates.

**Sticky metric column** showing `#rank` plus the active metric's value; header label follows the mode. Without it the sort order isn't legible in a week grid.

**PERIOD toggle** `WEEKLY | MONTHLY` — changes the grid's time axis (W1–W12 vs M1–M12), cell deltas (W/W vs M/M), the table's delta columns (7D/30D/90D vs M/M / 3M / 12M), stat rail labels, and the legend.

**VIEW toggle** `GRID | TABLE | CARDS` — **grid is default and stays default.** Persist the user's choice to `localStorage` so a returning user gets their last view; do not reorder the buttons.

**Grid** — rows are products, columns are 12 periods, each cell is price plus step delta, background tinted by the delta capped at ±8%.

**`VALUE RATIO` mode switches the grid's unit** — cells become the multiplier with box/set prices on a sub-line, and the metric column widens to a stacked `BOX / SET / RATIO` block.

`CASES`, `DECKS`, and `JP` render disabled with `SOON` labels.

Missing weeks render as em-dashes, **never zeros**. Exactly-zero deltas render `--ink-3`, **never green**.

Sparklines in table view stay hand-rolled inline SVG — one chart.js instance per row is not worth it. chart.js is for the detail page's main chart only.

---

## 5 — Chrome

### 5.1 Main nav — the real one

`Nav.tsx` builds links per-game via `publicLinks(gameRouteSlug)`. The actual set:

**Home · Markets · Catalog · Rarities · Sets · Characters**, plus a single **Sign in**.

There is no PROMOS, no PORTFOLIO, no ALERTS, no search input, and no Login/Sign-Up pair. v1.1 invented those from the mockup. **Add one entry — `Terminal`, with the gradient `PRO` chip — and change nothing else.**

Active state uses the existing `isActivePath(pathname, href, exact)`. `PublicNav` deliberately avoids `useSearchParams()` (it bails static prerender and causes CLS) — **do not introduce it**.

### 5.2 Terminal sub-nav

`Nav`'s variant union is `'public' | 'admin'` and it renders once in the root layout. Do not add a third variant.

Build a separate **`TerminalSubNav`** component rendered by a layout at the terminal route segment, so it appears on `/terminal/*` only.

Band: `SEALED · CHASE · MOVERS · SET INDEX · BOX EV`. Only `SEALED` routes anywhere for now; the rest render disabled.

### 5.3 Tokens

Two additions to `globals.css`:

```css
--line: #EEDFC8;
--grad-terminal: linear-gradient(100deg,#1E7FA8 0%,#1C9C9C 40%,#1FAE86 72%,#3EC08A 100%);
```

Use the repo's existing **`--gain-2` / `--loss-2`**. Do not add `--gain` / `--loss` aliases — one name per concept. The mockups use the short names throughout; every one needs rewriting during the port.

Sub-nav band: white links at 86%, full white on hover, active underline `#FFD166`, `inset 0 1px 0 rgba(255,255,255,.28)`, 44px tall. `PRO` chip uses the same gradient so chip and band read as one product.

**`--grad-terminal` is a brand-system change**, not just a token add. The convention has been *gradient = brand only*. This introduces a second, scoped to the Terminal product surface. It's justified — Terminal is a separate paid surface and the blue-green marks it as a different space — but it belongs in the brand bible, not in a component file as a one-off. `mockups/README.md`'s conventions block needs the amendment.

**Do not** add `.terminal-page` to any `body:has()` background rule. `globals.css:115`'s `body:has()` is a nav-offset rule, and `body` is already unconditionally cream at line 107. The v1.1 instruction was a no-op.

The legacy dark shim (`<html className="dark">`, `--void`, `--surface`, `--owl…`) is pre-existing debt for `src/components/lens/*`. **Out of scope. Leave it alone.**

### 5.4 Rarity chips — accept the divergence

Use the repo's `RarityBadge` and its `.c-rar-*` classes.

The mockups use an outline/tinted palette; the repo uses solid fill. Only MR matches. **The pages will not look like the mockups here, and that's the correct trade** — site-wide consistency beats matching a standalone mockup. If the outline palette is genuinely better, that's a separate site-wide change, not something Terminal does unilaterally.

`RarityBadge` takes `{ rarity: string | null }` only — no `size`, `variant`, or `className`. Any sizing happens in the parent.

---

## 6 — Page structure and data access

Follow the existing three-file split exactly, as `/sets` does:

```
src/app/terminal/sealed/page.tsx                    → <SealedTrackerContent />
src/app/games/[game]/terminal/sealed/page.tsx       → <SealedTrackerContent gameRouteSlug={params.game} />
src/app/terminal/sealed/SealedTrackerContent.tsx    → server, calls loader, fallback/error
src/app/terminal/sealed/SealedTrackerClient.tsx     → "use client", all interactivity
src/app/terminal/sealed/load-sealed.ts              → all Supabase access
src/app/terminal/sealed/terminal.css                → page-scoped, imported by the client
```

Same shape for `[productSlug]`.

`page.tsx` carries `export const revalidate = 3600` and `generateStaticParams()` on the `[game]` variant, matching `/sets`.

**Data access rules:**

- `createCachedServiceClient()` from `@/lib/supabase-server` — **server-only, service role**. It must never be reachable from a client component. Service role bypasses RLS entirely.
- Wrap every loader in `cachedPublicData(publicDataCacheKey(...), fn, CATALOG_DATA_TTL_SECONDS)`
- Resolve game scope with `resolveGameScope(supabase, options.game, { defaultToOnePiece: true })`, throw on `gameResult.error`
- Every query carries `.eq("game_id", game.id)` and `.eq("region", "en")`
- Paginate with the manual `while(true)` + `.range()` loop at `pageSize = 1000`
- Unwrap joins with `firstRelation()`

---

## 7 — Ingestion

| Job | Cadence | Writes |
|---|---|---|
| `sealed-weekly-snapshot` | Sat 06:00 UTC | `sealed_weekly_prices` |
| `set-value-rollup` | Sat 06:15 UTC | `set_weekly_values` |

Rollup runs **after** the snapshot so value ratio has both sides for the same `week_ending`. Both idempotent — re-running a week overwrites rather than duplicating. `week_ending` is always the Saturday, UTC.

**Capture `sellers` from the first run.** JustTCG returns a current count and nothing stores it over time. Section 3.2's sellers column and 3.3's supply signal both depend on history that doesn't exist yet.

JustTCG notes: auth header is `x-api-key`; `OP01-001` format returned natively; price history as `{p, t}` objects with Unix seconds; set slugs are full descriptive slugs.

**Verify sealed coverage before building the jobs** — confirm boxes *and* cases return, and confirm sealed variants carry price history. If history is missing, snapshots accumulate from day one and the ALL timeframe stays short until enough weeks land.

---

## 8 — Acceptance criteria

- `npm run lint` passes
- `npm run build` passes — note it runs `owl-lens:check-types` first, so unrelated lens type errors will gate this
- `npm run audit:game-boundaries` passes
- No `--gain` / `--loss` / `--line` references resolve to nothing — grep both pages for undefined custom properties
- No service-role client reachable from any client component
- Every new query carries `game_id` and `region` filters
- Dashboard: 3 views × 2 periods × 6 ranking modes render without error
- View preference persists across reload
- Detail: 4 timeframes × 4 overlay combinations render; overlay activation switches the axis to indexed mode and deactivating all restores USD + area fill
- `CHART | TABLE` preserves timeframe in both directions
- Range bar marker correct at ATH (100%) and ATL (0%)
- Box EV total equals the sum of slot contributions, no rounding drift; weights sum to 100%
- Box EV hides cleanly for a set with no `pull_rates`; low-confidence sets show the caution strip
- Top 10 names truncate rather than wrapping, at every breakpoint
- Deltas: green above zero, red below, `--ink-3` at exactly zero
- Mobile 380px: no horizontal page scroll — tables scroll within their own containers only
- Cold-page PSI after deploy, per the standing retest rule. Hero art is the likely LCP element on detail — confirm it isn't webfont-blocked

---

## 9 — Open questions

1. **MSRP source.** No API provides it. Hand-maintained in `sealed_products`, admin-editable. Spec assumes $103.68 ($4.32 × 24) for standard boxes — confirm.
2. **Case products.** `product_type = 'case'` is in the schema but CASES is disabled in the UI. Detail page must handle `packs_per_unit = null` by hiding the per-pack stat.
3. **JP.** `region` already supports it. Once JP sealed coverage is confirmed, hero gains an EN/JP switch and the chart gains a JP overlay. No schema change needed.
4. **Sub-nav placement.** `TerminalSubNav` needs a layout at the terminal segment — confirm this works cleanly with the `/games/[game]/…` mirror without duplicating the component.

---

## 10 — Backlog: PSA graded data (not in v1)

Recorded so the schema isn't designed into a corner.

**Two surfaces:** a set-level graded panel here (total pop, grade distribution, pop growth W/W — rising pop means singles supply is inflating, a real bear signal sealed price doesn't show), and per-card gem rate as a `GEM %` column in the top 10 with full breakdown on `/card/[id]`.

**Blocking decision — source.** PSA's public API covers cert verification and order status, not pop reports.

| Option | Trade-off |
|---|---|
| Third-party aggregator (GemRate-style) | Paid, structured, stable |
| Scrape PSA pop report pages | Free, fragile, ToS exposure |
| Cert-lookup crawl | Slow, incomplete |

Pick before writing schema — row shape differs materially.

**Design constraints.** Pop is monotonic, so momentum requires snapshots from the first day the source lands, same as `sellers`. Gem rate is **submitter-biased** — people grade copies that already look clean, so 45% gem rate is not a 45% population estimate. Label it *submitted* gem rate, never implied population quality. That bias is precisely the argument for Owl Pregrade: measured centering is the unbiased signal gem rate can't be.

```sql
create table psa_pop_snapshots (
  card_image_id text not null,
  game_id       <match> not null references games(id),
  psa_spec_id   text,
  week_ending   date not null,
  total_graded  int not null,
  pop_10 int, pop_9 int, pop_8 int, pop_7 int, pop_6_and_below int,
  source        text not null,
  primary key (card_image_id, week_ending)
);
```

`gem_rate = pop_10 / total_graded`, computed not stored.
