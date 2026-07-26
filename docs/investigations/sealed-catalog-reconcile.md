# Sealed catalog reconcile + price backfill — Phase C1/C2 execution record

**Date:** 2026-07-27 (work began 2026-07-26 UTC) · **Branch:** `feat/moon-terminal`
**Scope:** phases plan §2 C1+C2 · spec `docs/moon-terminal-sealed-spec.md` §2.2/§7 · findings `docs/moon-terminal-justtcg-findings.md`
**All numbers below are live probes** (PostgREST with the service key, JustTCG with the API key), not repo inference.

---

## 1. The 86-vs-23 box discrepancy — RESOLVED: neither stale nor filtered

**The catalog is not missing two-thirds of its boxes. The "86 booster boxes" figure was a
name-classification artifact in the earlier probe.**

Matching the full JustTCG sealed feed (`condition=Sealed`, 364 products) against the live
380 rows **on `external_ref`/`justtcg_id`** (never name):

| population | count |
|---|---:|
| API products matched to a live row | **358 / 364** |
| API products missing from live | **6** (none is a booster box — §3) |
| live rows absent from the API feed | 22 (§5) |

Reproducing the old counts against the real feed:

| heuristic over API `name` | count |
|---|---:|
| contains "booster box", excl "case" | **21** |
| contains "case" | **29** |
| contains "box" OR "display", excl "case" | **86** ← the reported "86 booster boxes" |

So "86" counted every starter-deck display, tin-pack display, deck-set display and
collection box as a "booster box". The real API booster-box population is **21 by name**,
and **all 21 map to live `booster_box` rows**. Cross-tab of the 29 "case"-named products:
23 `booster_box_case` + 3 `display` + 2 `collection` + 1 `starter_deck_display` — all
present in live.

**Answer to the explicit question "which of the 86 API booster boxes have no row among our
23": the empty set.** All 23 live `booster_box` rows (including both Romance Dawn waves and
The World's Strongest Warriors) and all 23 `booster_box_case` rows were re-verified present
in the API feed by id. The old sync filters nothing; the catalog was near-complete; the gap
classification is:

- **new-to-us:** 6 products (§3)
- **present-under-different-type:** 0
- **renamed:** 0 (checked — §5)

## 2. Catalog diff summary

- Live before: **380** rows, 44 tracked. API feed: **364** products (meta.total = 364).
- 358 matched · 6 API-only (inserted, §3) · 22 live-only (left untouched, §5).
- 380 live rows all carry `justtcg_id`; `external_ref` backfilled = `justtcg_id` on all
  (v49's backfill confirmed intact).

## 3. The 6 missing products — inserted 2026-07-27

All six postdate the last out-of-repo catalog sync (`last_synced_at` = 2026-07-14 on
existing rows):

| name | `product_type` | set slug (JustTCG) | set in `sets`? |
|---|---|---|---|
| Starter Deck 31: RED Monkey.D.Luffy Display | `starter_deck_display` | starter-deck-31-… | **no** |
| Starter Deck 32: GREEN Roronoa Zoro Display | `starter_deck_display` | starter-deck-32-… | **no** |
| Starter Deck 33: BLUE Kuzan Display | `starter_deck_display` | starter-deck-33-… | **no** |
| Starter Deck 34: PURPLE Charlotte Katakuri Display | `starter_deck_display` | starter-deck-34-… | **no** |
| Starter Deck 36: YELLOW Eustass"Captain"Kid Display | `starter_deck_display` | starter-deck-36-… | **no** |
| The World's Strongest Warriors Booster Pack | `booster_pack` | the-world-s-strongest-warriors-… | **no** |

Inserted with: `game_id` = one_piece (`42f667ef-5c6d-4971-9442-bf4086ca7d95`), `region='en'`,
`provider='justtcg'`, `external_source='justtcg'`, `external_ref` **and** `justtcg_id` = API
card id, `set_id=null`, `is_tracked=false`, `is_active=true`, `tcg_product_id`/`tcg_sku_id`/
`image_url`/`product_url`/`source_set_slug`/`source_set_name`/`metadata` mirroring the
existing rows' shape exactly (metadata carries `provider_uuid`, `provider_variant_id`,
`provider_variant_uuid`, `language`, `printing`, `average_7d/30d/90d`). Price columns
(`tcg_price`, `market_avg`, `chg_*`, `ath`, `atl`, `price_updated_at`) left null — they
belong to the out-of-repo Codex writer.

**Counts: 380 → 386 rows. Tracked: 44 → 44** (none of the six is a `booster_box`/
`booster_box_case`, so the opt-in criteria add nothing; no ST35 product exists in the feed
at all — the API skips from ST34 to ST36).

## 4. `product_type` mapping rules (name → type), derived from live-row correlation

Derived by grouping the 380 pre-existing rows' names per `product_type`; every rule below is
observed, not invented. Order matters (first match wins):

1. `/booster box case/i` → `booster_box_case`
2. `/booster box/i` → `booster_box` (also matches "… Collection Box"/"Heroines Edition Box" **only via** existing rows: those literal "Box"-without-"Booster" EB names live as `booster_box` — matched by id here, so no rule needed for them)
3. `/^starter deck/i` **and** `/display/i` → `starter_deck_display` (live keeps "Display Case" rows in this same type — e.g. "Starter Deck 19: BLACK Smoker Display Case")
4. `/^(super pre-release )?starter deck/i` → `starter_deck`
5. `/sleeved booster pack/i` → `sleeved_booster_pack`
6. `/booster pack$/i` → `booster_pack`
7. `/tournament pack|judge pack/i` → `tournament_pack`
8. `/double pack/i` → `double_pack`
9. `/deck set/i` → `deck_set`
10. anything else → `other` (closest existing type; flagged as ambiguous)

Only rules 3 and 6 fired for this insert (5× and 1×). No ambiguous cases arose.
Non-obvious live conventions worth recording: tin-pack/gift-collection displays are
`display`; "Devil Fruits Collection … Case" is `collection`, not a case type; pre-release
packs are `promotion_pack`.

## 5. Live-only rows (22) — in the DB, gone from the API feed

Checked each for an exact-name match under a different API id: **none — these are
delistings/merges upstream, not renames.** All 22 still `is_active=true` in live. Left
untouched (deactivation is the out-of-repo catalog writer's call, not Phase C's).
Notables: Devil Fruits Collection Vol. 1–3 Cases, 8 starter-deck Display Cases, Double Pack
Set Vol. 2/4 Display Cases, Set Sail Deck Set Display, CS/championship promo packs, 2
Premium Card Collection Live Action Vol. 2 products.

Consequence: these 22 can never receive new history rows from the JustTCG job (they are
absent from the feed). 18 of the 356 legacy 2026-07-14 history rows belong to products that
got no fresh points this run (10 in-feed-but-stale + live-only overlap).

## 6. D5 list — products whose set does not exist in `sets`

`sets` has no rows for (verified by code and name lookups): **ST31, ST32, ST33, ST34, ST36,
The World's Strongest Warriors.** Products parked with `set_id=null`, untracked:

- The 6 new inserts (§3)
- Plus the pre-existing null-set 14 from findings §7 (WSW booster box + case among them)

Per the standing decision these were inserted **without** creating `sets` rows; adding those
sets (which would let the WSW box/case join the tracked 44 and raise it to 46) is **D5**,
deferred to Justin. No ST35 exists in the JustTCG feed.

## 7. Sync route (C2) — `src/app/api/sync/sealed-prices/route.ts`

New file, the only code deliverable. Conventions copied from `justtcg/route.ts` /
`jp-prices/route.ts`: `CRON_SECRET` Bearer (or `?secret=`) auth, `?game=` required and
resolved via `resolveOnePieceSyncGame` (missing → 400, unknown → 404, non-one-piece → 400),
service client, JSON status body.

Design (daily job = backfill, one code path):

- Fetches the full sealed feed with `condition=Sealed&include_price_history=true&priceHistoryDuration=90d`
  (4 requests), **all pages before any DB write**.
- Provider-wide failure (401/403/429/5xx/network/timeout) → abort with 502, zero writes.
  403 is documented in-code as quota exhaustion, not a lapsed plan.
- Per-product anomalies counted in the response (`anomalies`, `anomalySample`), never fatal.
  API products with no `sealed_products` row → `unknownProducts`, skipped.
- Upserts every provider-reported `{p,t}` point onto
  `(sealed_product_id, price_date)` — conflict target of constraint
  `sealed_product_price_history_product_day_key`, **not** v49's condemned
  `(…, source, …)` index. `price_date` = UTC date of `t`; same-day duplicates last-wins;
  batch deduped on the conflict key before writing.
- Writes `price`, `source_updated_at` (= variant `lastUpdated`, Unix s → ISO),
  `source='justtcg'`, `game_id` from the product row. **`low_price` null — the `{p,t}`
  points carry no low/market-low field (verified by payload inspection); `sellers` null**
  (findings §3).
- Stale products (`priceHistory: null`) contribute nothing — no manufactured rows.
- Writes **only** `sealed_product_price_history`; never the `sealed_products` price columns.
- No cursor, no `sync_state` row — nothing to advance, so the JP `writeCursor` trap and the
  eBay cursor-march defect are structurally impossible here.
- Response self-reports `historyRowsBefore/After` and `newRows`, so every cron run is its
  own idempotency check.
- `maxDuration = 300`, not 60: the run measured **115s** cold locally (58s warm). 60 would
  time out mid-upsert; `/api/warm` already runs 300 on this plan.

## 8. Backfill run (D1c) — results

Executed locally against the live DB via `npm run dev` with a throwaway `CRON_SECRET`
(inline env only, never written to a file), exercising the real auth path. Auth-reject
(401), missing-game (400) and wrong-game (400) verified first.

**Run 1 (backfill):**

```json
{"requests":4,"productsInFeed":364,"matchedProducts":364,"unknownProducts":0,
 "productsWithHistory":354,"productsWithoutHistory":10,"pointsSeen":29630,
 "rowsUpserted":29630,"distinctDates":90,"historyRowsBefore":356,
 "historyRowsAfter":29648,"newRows":29292,"anomalies":0,"durationMs":115534}
```

**Run 2 (idempotency proof):** identical feed numbers, and
`historyRowsBefore: 29648, historyRowsAfter: 29648, newRows: 0`.

**Post-backfill live verification:**

| check | result |
|---|---|
| total history rows | **29,648** (356 before) |
| distinct `price_date` | **90** — 2026-04-28 → 2026-07-26, no gaps introduced |
| duplicate (product, date) pairs | 0 |
| products with ≥1 row | 364 |
| tracked (44) points per product | min 1 · **median 90** · max 90 |
| tracked products with **zero** points | **0** |

The single min-1 outlier is **Romance Dawn - Booster Box Case (Wave 1 - Blue)**: provider
`lastUpdated` 2025-11-24, `priceHistory` null — its one row is the legacy 07-14 snapshot.
Correct behavior: the provider reports nothing recent and we manufacture nothing.

`productsWithHistory` = **354**, exactly the findings-doc figure.

## 9. Slug backfill (D1d)

Rule: kebab-case of `display_name || name` (all `display_name` null today), lowercase,
apostrophes/smart-quotes stripped, non-alphanumeric runs → `-`; uniqueness per game against
`uq_sealed_products_game_slug`; planned collision fallback = append set code then `-2` —
**not needed, all 44 base slugs unique** (the Romance Dawn wave suffixes disambiguate
naturally). Examples: `the-azure-seas-seven-booster-box`,
`romance-dawn-booster-box-case-wave-1-blue`.

**Counts: tracked-with-null-slug 44 → 0; game-wide slugged 0 → 44; 0 failures.**

## 10. Contradictions found vs the brief / prior docs

1. **"Full catalog + history ≈ 4 requests via condition=Sealed … median 90 daily points" is
   only true with `priceHistoryDuration=90d`.** The bare `include_price_history=true`
   returns a **7-day** window (median 7 points, 344 products) — the earlier probe's "354 /
   median 90" is reproducible only with the duration param, whose real name is
   **`priceHistoryDuration`** (valid: `7d|30d|90d|180d`, per the `justtcg-js` typings,
   verified live: 90 points, 2026-04-28..07-26). The findings doc's "historyDuration=1y is
   broken" is consistent with this: `historyDuration` is not a recognized parameter name at
   all, so that probe was silently served the default window — same signature I saw with
   four other wrong spellings. `180d` was **not** probed (budget); worth one request some
   day, though findings §2's "~90 days is the hard ceiling" claim stands unverified either
   way.
2. **The 86-vs-23 discrepancy was never a catalog/staleness problem** (§1) — the phases
   plan's "Terminal launches missing roughly two thirds of the boxes that exist" risk was
   unfounded. Real gap: 6 minor products, 0 boxes.
3. **`maxDuration` "modest" (plan §2·C2) is not viable** — measured 115s; shipped 300 (§7).
4. Minor: the brief said the live table has "23 + 23" boxes/cases with "22 + 22" tracked —
   confirmed exactly; the 2 untracked are the WSW pair with null `set_id` (D5).
5. Minor: findings said "354 of 364 carry history"; with the correct param that is exactly
   what the feed returns today. The 10 without: stale products incl. the Romance Dawn Wave 1
   pair (§8).

## 11. Request budget

19 of 25 JustTCG requests: 1 shape probe + 4 catalog + 6 param probes (incl. the 4 failed
spellings — the cost of re-deriving an undocumented param) + 4 run 1 + 4 run 2.
Steady-state cost of the cron: **4/day** against the 1,000/day ceiling.

## 12. Row-count ledger (every write step)

| step | table | before | after |
|---|---|---:|---:|
| product insert (§3) | `sealed_products` | 380 | **386** |
| product insert (§3) | `sealed_products` tracked | 44 | **44** |
| backfill run 1 (§8) | `sealed_product_price_history` | 356 | **29,648** |
| backfill run 2 (§8) | `sealed_product_price_history` | 29,648 | **29,648** |
| slug backfill (§9) | tracked rows with null `slug` | 44 | **0** |
