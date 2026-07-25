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
| B | Migration v49 (3 ALTERs + 1 new table) | hand-application, no DDL via client |
| C | Sealed price job + cron + catalog reconcile | nothing — coverage confirmed, set-value job already exists |
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

### 2.2 Migration v49

**This is v49, not v46.** v46 (`character-price-index`), v47 (`character-links`) and v48 (`nullable-price-changes`) were all written on 2026-07-12 and are all applied to the live database. Head is v48. There is no backlog of unapplied migrations — v44 `jp_prices` and v45 `region-aware-cards` are live too (7,740 and 373 rows respectively).

There is no DDL access through the Supabase client. This migration is hand-applied via the SQL editor.

**Three of the four tables already existed.** v1.1 and v2.0 both assumed greenfield. Recon of the live database found otherwise:

| Spec called for | Reality | Resolution |
|---|---|---|
| `create table sealed_products` | exists — `schema.sql:112`, **380 live rows**, read by `/markets`, guarded by v40 | **ALTER**, never create |
| `create table sealed_weekly_prices` | `sealed_product_price_history` exists at **daily** grain (356 rows) | **dropped from the plan** — extend the daily table |
| `create table set_weekly_values` | `market_index_snapshots` exists — `entity_type='set'`, 53 set rows, `index_value`, `card_count`, `chg_7d`, `chg_30d` | **dropped from the plan** — add `region`, use it |
| `create table pull_rates` | nothing in the database; dead TS constant at `src/app/sets/sets-data.ts:109` | genuinely new — the only CREATE TABLE |

**Daily beats weekly.** JustTCG returns 90 days of daily points, so storing a weekly aggregate throws away resolution we already have. The dashboard's `WEEKLY | MONTHLY` toggle is a rollup query over daily rows — last price in each period — not a storage format. `week_ending` as a stored Saturday column does not exist and is not needed.

**No `set_code` anywhere.** `sealed_products.set_id` and `market_index_snapshots.set_id` both FK to `sets(id)`; join for the code rather than denormalizing a second copy. The set-value rollup is keyed on `set_id` for the same reason.

**`game_id` is `uuid`**, `references public.games(id) on delete restrict` — confirmed against `cards.game_id`, not assumed.

```sql
-- schema-migration-v49-terminal-sealed.sql  (abridged; see the file for the
-- idempotency guards, comments, constraints and verification block)

-- 1. sealed_products — extend the live table
alter table public.sealed_products
  add column if not exists slug            text,
  add column if not exists region          text not null default 'en',
  add column if not exists display_name    text,
  add column if not exists packs_per_unit  int,
  add column if not exists cards_per_pack  int,
  add column if not exists msrp_usd        numeric(10,2),
  add column if not exists release_date    date,
  add column if not exists external_source text not null default 'justtcg',
  add column if not exists external_ref    text,
  add column if not exists is_tracked      boolean not null default false;

create unique index uq_sealed_products_game_slug
  on public.sealed_products (game_id, slug) where slug is not null;
create index idx_sealed_products_game_region_set
  on public.sealed_products (game_id, region, set_id);

-- 2. sealed_product_price_history — extend the daily table
alter table public.sealed_product_price_history
  add column if not exists low_price         numeric(10,2),
  add column if not exists source_updated_at timestamptz,
  add column if not exists sellers           int;

create unique index uq_sealed_price_history_product_source_day
  on public.sealed_product_price_history (sealed_product_id, source, price_date);

-- 3. market_index_snapshots — the set-value rollup, plus region
alter table public.market_index_snapshots
  add column if not exists region text not null default 'en';

-- 4. pull_rates — new
create table public.pull_rates (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete restrict,
  set_id      uuid not null references public.sets(id) on delete cascade,
  region      text not null default 'en',
  rarity_id   uuid references public.game_rarities(id) on delete restrict,
  slot_label  text not null,                  -- 'MR', 'GMR', … or 'R / UC / C bulk'
  per_pack    numeric(6,3),
  per_box     numeric(6,3) not null,
  per_case    numeric(6,3),
  source_note text,
  confidence  text not null default 'medium', -- 'high' | 'medium' | 'low'
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_pull_rates_set_slot
  on public.pull_rates (game_id, set_id, region, slot_label);
```

**`external_source` / `external_ref` replace the spec's `justtcg_variant_id`.** A provider-named column would need a migration if sealed pricing ever falls back to eBay completed sales; source-agnostic means only the ingestion job changes. This is not hypothetical — `sealed_products.ebay_avg` is already a live column, so the table is already multi-source. `external_ref` is backfilled from the `justtcg_id` all 380 rows carry; `justtcg_id` is retained for the existing sync and is not dropped.

**`is_tracked` defaults `false`, not `true`.** With 380 pre-existing rows, defaulting true would enrol binders, promo packs and sleeved singles into Terminal. The 46 booster boxes and cases opt in via the separate, reversible data step at the end of the migration file. Two of those 46 have a null `set_id` and are excluded until a set is assigned.

**`rarity_id` FKs to `game_rarities`, nullable for BULK.** One rarity vocabulary, not two. The BULK slot has no rarity code, so `rarity_id` is null there and `slot_label` carries the plain text — matching §3.5's rule that `'BULK'` is never passed to `RarityBadge`.

Both `pull_rates` FKs are composite `(set_id, game_id) → sets(id, game_id)` and `(rarity_id, game_id) → game_rarities(id, game_id)`, `NOT VALID` then `VALIDATE`, exactly as v40 does for every other game-scoped table. A row cannot point at another game's set or rarity.

RLS: public read, no public write, matching v47's convention — `enable row level security`, a `for select using (true)` policy, `grant select to anon, authenticated`, `grant all to service_role`.

**Real `product_type` vocabulary.** The four-value list in earlier drafts was fiction. All 17 live values, One Piece row counts (all 380 sealed products are One Piece; all are `is_active`):

| type | rows | | type | rows |
|---|---:|---|---|---:|
| `pack` | 90 | | `booster_pack` | 19 |
| `starter_deck` | 45 | | `promotion_pack` | 12 |
| `starter_deck_display` | 39 | | `other` | 9 |
| `collection` | 34 | | `display` | 6 |
| `double_pack` | 26 | | `bundle` | 5 |
| `tournament_pack` | 24 | | `deck_set` | 4 |
| `booster_box_case` | 23 | | `binder` | 1 |
| `booster_box` | 23 | | `battle_kit` | 1 |
| `sleeved_booster_pack` | 19 | | | |

Note `booster_box_case`, **not** `case`. Phase D's filter chips must be built from this list.

**`region` on `market_index_snapshots` is inert, deliberately.** The natural key is confirmed as **`market_index_snapshots_entity_day_key` on `(game_id, entity_type, entity_key, snapshot_date)`** — no `region`. v49 adds the column but **does not touch the constraint**, because `capture_market_index_snapshots` writes with explicit column lists and would keep writing EN-only rows regardless.

**JP rollups need both changes, together:** the function must stop hardcoding `cards.region = 'en'`, *and* the unique key must gain `region`. Doing either alone is worse than doing neither — widening the key without changing the function adds a column that is always `'en'`; changing the function without widening the key makes JP rows collide with EN rows on the same `(entity_key, snapshot_date)` and silently overwrite them. Existing rows are genuinely EN: the hardcode makes `region='en'` accurate, not an assumption.

**Set membership for index purposes is `printed_set_code`, not `set_id`.** The function groups on `cards.printed_set_code` and resolves `set_id` afterwards via a lateral join matching `sets` by code. The two populations differ materially — OP05 has 137 cards by `set_id` and 287 by `printed_set_code`. Consumers join the snapshot on `set_id` (it is resolved and correct); anything that *recomputes* a set value must group on `printed_set_code` or it will be ~65% low. See `moon-terminal-justtcg-findings.md` §8.

**`card_image_id` is the canonical key.** Anywhere singles are aggregated — set value rollup, rarity averages for Box EV, top 10 — group on `card_image_id`, never `card_number`. Parallels and alt-arts share numbers but have unique `_p1` / `_p2` suffixed image ids. Variant detection uses explicit `includes()` checks; **no regex catch-alls**.

### 2.3 Derived values — compute, never store

| Value | Formula |
|---|---|
| `off_ath` | `(current − ath) / ath × 100`, ath = max across all snapshots |
| `vs_msrp` | `(current − msrp) / msrp × 100` |
| `value_ratio` | `market_index_snapshots.index_value / price`, same `set_id`, **carrying forward** the last `snapshot_date` ≤ `price_date` |
| `volatility_12w` | mean of `abs(w/w %)` over trailing 12 weeks |
| `price_per_pack` | `price / packs_per_unit` |
| `box_ev` | `Σ (pull_rates.per_box × avg_price_of_rarity)` |
| `sealed_premium` | `(price − box_ev) / box_ev × 100` |

**The set-value rollup is weekly; box prices are daily.** So on six days out of seven there is no same-day set value. **Carry the last known one forward — never blank the ratio, never render a gap.** A ratio that vanishes for six days and reappears on Sundays reads as broken data. The chart's `VALUE RATIO` overlay is a step function between snapshots, and that is correct: the set value genuinely did not get remeasured in between. Label the axis so it can't be misread as a daily series.
| `sealed_rank` | rank by latest `price` among `is_tracked`, same `game_id` + `product_type` + `region` |

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

Main column: mono eyebrow, H1 with the last two words in Caveat gradient (**`padding-right: 13px` required** — Caveat clips its tail under `background-clip:text`), price at 48px mono, **three delta chips (7D/30D/90D)**, then the range bar.

**The range bar is not 52 weeks at launch.** With a ~90-day history ceiling (findings §2) it spans at most 13 weeks from our own rows. The existing edge-case rule already covers this — relabel to the real span — so it degrades correctly, but treat the short span as the *normal* case, not an exception, and never hardcode the string `52-WEEK RANGE`.

Note `sealed_products.ath` / `atl` are pre-populated live columns and may reflect a wider window than our own history. If the bar's endpoints come from those columns while the marker comes from our 90 days, the two disagree. **Pick one source for all three values** — our own rows are the defensible choice, since they're the ones we can show on the chart underneath.

Range bar: gradient track, 4px ink marker at `(current − atl) / (ath − atl) × 100%`, value label above, ATL and ATH with dates below.

Facts panel: MSRP · vs MSRP · released · set value · value ratio · **price activity** and **last move**. Then `+ WATCHLIST` and `CSV`.

**There is no sellers row.** JustTCG exposes no `sellers`/`listings`/`quantity` field on sealed variants — confirmed by probe, see `moon-terminal-justtcg-findings.md` §3. `PRICE ACTIVITY` (`priceChangesCount30d`) and `LAST MOVE` (age of `lastUpdated`) replace it. Both are honest liquidity reads: a price that hasn't moved in three weeks is illiquid, which is what a thin seller count was meant to convey.

**Edge cases.** Null `msrp_usd` → hide both MSRP rows. Fewer than 52 weeks of history → relabel to the real span (`"38-WEEK RANGE"`). `ath === current` → marker at 100%, show `AT ATH` in `--gain-2` instead of an off-ATH figure.

### 3.2 Price history

**Use `chart.js` + `react-chartjs-2`.** Both already ship. Follow the existing pattern in `SetChartClient.tsx` / `CardDetailClient.tsx`: a `"use client"` component calling `ChartJS.register(...)` at module scope with only the elements it needs.

Do not port the mockup's hand-rolled SVG chart. It exists because the mockup was standalone.

**View toggle:** cobalt `CHART | TABLE`, chart default. **Timeframes at launch: 30D (daily) · 90D (daily). Default 90D.** Timeframe drives both views and survives toggling between them.

**1Y and ALL do not ship in v1.** JustTCG's `historyDuration=1y` is broken — it returns ~7 points, all days old, so **~90 days is the hard ceiling on available history** (findings §2). Rendering a 1Y axis over 90 days of data would misrepresent the range. Gate both on our own accumulated depth: once `sealed_product_price_history` has collected daily for long enough, 1Y becomes real from our rows and the toggle grows a button. Build the timeframe list data-driven so adding them later is config, not surgery.

The hero's four delta chips (7D/30D/90D/1Y) have the same problem — **drop the 1Y chip** until the depth exists.

**Overlays:** `SET VALUE` (gold, dashed) and `VALUE RATIO` (`--select` cobalt, dashed), independent toggles.

**The scale rule — this is the part that's easy to get wrong.** With no overlay, the y-axis is raw USD and the price line carries a 12%-opacity area fill. The moment *any* overlay activates, all series switch to **indexed at 100 = first point in window**, the area fill drops, and the axis label becomes `INDEXED · 100 = <start date>`. Plotting dollars against a multiplier on one axis is meaningless. This is the CoinGecko "compare against BTC" behaviour.

**Table view:** active timeframe's raw snapshots — date, box price, change, set value, ratio — newest first, sticky header, `max-height: 452px` with internal scroll. No sellers column. Footer states the resolution, which is `DAILY` for both launch timeframes.

Overlay buttons **hide** in table mode. They only affect the chart; leaving them visible implies they filter columns.

Chart hover works on mouse and touch; tooltip stays inside its container at both edges.

### 3.3 Market stats

6-up stat cards, **3-up at 1180px**, 2-up at 720px. Hover: `translate(-2px,-2px)` + `4px 4px 0` ink shadow.

Off ATH · 12W volatility · **price activity** · cards per box · $ per pack · sealed rank.

**`PRICE ACTIVITY` replaces the sellers card**, and the `TIGHTENING` / `LOOSENING` supply signal is removed with it — JustTCG exposes no seller count for sealed variants (findings §3). The card shows `priceChangesCount30d` with a sub-label reading the age of `lastUpdated` (`MOVED 2D AGO` / `FLAT 23D`). A box that hasn't repriced in three weeks is illiquid; that is the signal, stated directly rather than inferred from a seller count we don't have.

Do not reintroduce a supply reading from `market_avg` volatility — volatility is already its own card, and calling the same number a supply signal would double-count it.

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

**Two distinct empty states — do not collapse them into one.**

- **No snapshot this week** (the set-value rollup hasn't run for this period): carry the last known value forward per §2.3. The grid still renders; the ratio is a step, not a gap.
- **No snapshots for this game at all**: the rollup has never run for it. Today `market_index_snapshots` holds One Piece only — Lorcana has 18 sets and Riftbound 7, with **zero** set snapshots between them. Every Value Ratio for those games is null, permanently, until the cron is extended.

The second case must **hide the `VALUE RATIO` ranking chip and the ratio column entirely**, with a one-line explanation, rather than rendering a full grid of em-dashes. A column of dashes reads as "this data is missing today"; the truth is "this metric does not exist for this game yet". Terminal launches on One Piece so this is not v1-blocking, but it is cheap now and expensive to retrofit once the grid logic assumes a ratio always exists.

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
| `sealed-daily-snapshot` | daily 06:00 UTC | `sealed_product_price_history` |
| `set-value-rollup` | daily 06:15 UTC | `market_index_snapshots` (`entity_type='set'`) |

**Daily, not weekly.** JustTCG returns 90 days of daily points, so a weekly job would discard resolution we already have. Rollup runs **after** the snapshot so value ratio has both sides for the same date. Both idempotent — the unique key `(sealed_product_id, source, price_date)` makes a re-run overwrite rather than duplicate.

The dashboard's `WEEKLY | MONTHLY` toggle is a **query-time rollup** — last price in each period — not a second storage format.

**Only the sealed price job is greenfield.** The set-value job already exists:

| Table | Scheduled by |
|---|---|
| `market_index_snapshots` | **`pg_cron` job 1**, active, `40 23 * * 0` (Sunday 23:40 UTC), calling `capture_market_index_snapshots(games.id, current_date)` for one_piece |
| `sealed_product_price_history` | **nothing** — no cron, no route, no function |

`capture_market_index_snapshots` computes `index_value = sum(tcg_market)` over priced cards in the set for `entity_type='set'`. **That is set value — already computed, scheduled and game-scoped. Do not build a second rollup.** Join on `set_id` + `snapshot_date`.

So Phase C is: **build the sealed price job, add one cron entry, reconcile the catalog.** Smaller than two jobs.

**Unverified — has the cron ever fired?** The only snapshot is `2026-07-23`, a **Thursday**, captured at `09:45 UTC`. A Sunday 23:40 job produces Sunday dates. So the existing rows came from a manual invocation, and there are no rows for 07-19 or 07-12. Either the job was created after 07-19 and has not yet run, or it fails silently. **Check `cron.job_run_details` before Phase C depends on it** — if it has never succeeded, the sealed job is not the only thing that needs building.

Until both sides produce rows, **Value Ratio computes to null for every product**: one price date (07-14), one snapshot (07-23), and §2.3's join finds no snapshot at or before any price.

**History backfill is cheap and confirmed.** 354 of 364 sealed products carry `{p, t}` daily history, median 90 points; full catalog plus history is **4 requests** (findings §1). The earlier concern that snapshots would accumulate from day one is void.

**~90 days is the ceiling.** `historyDuration=1y` is broken — it returns ~7 points, all days old (findings §2). This is why §3.2 ships 30D and 90D only.

**`sellers` is not available.** JustTCG exposes no `sellers`/`listings`/`quantity` field on sealed variants — confirmed by payload inspection, not inferred. The column exists on `sealed_product_price_history` (v49), stays null on `justtcg` rows, and is reserved for a possible eBay-sourced future. §3.1, §3.2 and §3.3 use `priceChangesCount30d` and `lastUpdated` age instead.

JustTCG notes: auth header is `x-api-key`; `OP01-001` format returned natively; price history as `{p, t}` objects with Unix seconds; set slugs are full descriptive slugs.

**Open discrepancy — catalog staleness.** The API returns 86 booster boxes and 29 cases against 23 and 23 in the live table. Either the existing sync filters them or the catalog is stale. Resolve during Phase C before backfilling, or Terminal launches missing roughly two thirds of the boxes that exist.

Full probe results: **`docs/moon-terminal-justtcg-findings.md`** (2026-07-26).

### Backfilling set-value history

`price_history` reaches further back than the 90-day sealed ceiling, so ~6 additional weekly set-value points can be reconstructed — moving Value Ratio from 1 point to ~6. **Feasible and validated to within +0.04%–4.17%, but shallow**: the singles pipeline only reached full weekly catalog coverage on 2026-06-14, and reconstructions before that freeze into an identical repeated value. Roughly half a day of work.

**If built, group on `printed_set_code`, not `set_id`** — grouping on `set_id` comes out 65% low. Full method, validation table, depth analysis and constraints are in `moon-terminal-justtcg-findings.md` §8. Not scheduled; decide during Phase C.

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
- Detail: 2 timeframes (30D, 90D) × 4 overlay combinations render; overlay activation switches the axis to indexed mode and deactivating all restores USD + area fill
- No `sellers` reference survives in any Terminal component — grep both pages
- Audit asserts `market_index_snapshots` has zero rows with `entity_type='set' and set_id is null` — currently 0/53, and a future set-code mismatch must fail the build rather than silently null the Value Ratio
- No `is_tracked` product has a null `set_id`
- Dashboard renders for a game with zero set snapshots without a grid of em-dashes
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

**Design constraints.** Pop is monotonic, so momentum requires snapshots from the first day the source lands — the same trap the sealed price history fell into (§7: one date, written once, no cron). Gem rate is **submitter-biased** — people grade copies that already look clean, so 45% gem rate is not a 45% population estimate. Label it *submitted* gem rate, never implied population quality. That bias is precisely the argument for Owl Pregrade: measured centering is the unbiased signal gem rate can't be.

```sql
create table psa_pop_snapshots (
  card_image_id text not null,
  game_id       uuid not null references public.games(id) on delete restrict,
  psa_spec_id   text,
  week_ending   date not null,
  total_graded  int not null,
  pop_10 int, pop_9 int, pop_8 int, pop_7 int, pop_6_and_below int,
  source        text not null,
  primary key (card_image_id, week_ending)
);
```

`gem_rate = pop_10 / total_graded`, computed not stored.
