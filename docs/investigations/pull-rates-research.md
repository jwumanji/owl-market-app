# Pull-rates research — One Piece TCG booster boxes (Phase G, D7 draft)

**Date:** 2026-07-27 · **Status:** DRAFT — nothing seeded, awaiting Justin's sign-off (plan §6 / D7)
**Seed draft:** `docs/investigations/pull-rates-seed-draft.json` (109 rows, 17 sets — 47 medium / 62 low / 0 high)
**Consumed by:** spec §3.5 Box EV = Σ per_box × avg rarity price; BULK slot; caution strip on `confidence='low'`; section hides for sets with no rows.

Bandai publishes **no official pull rates**. Every figure below is a community estimate; the mandatory
§3.5 disclaimer is not boilerplate, it is the epistemic status of this entire table.

---

## 1 · Scope — the 22 tracked boxes and their sets

Live probe (2026-07-27, `sealed_products` `is_tracked=true`, `product_type='booster_box'`): 22 boxes
across **21 set rows** — OP01 has two box SKUs (Wave 1 Blue, Wave 2 White) sharing one `set_id`.

Covered with seed rows: **OP01–OP15, EB01, EB02** (17 sets → 18 boxes).
No seed rows (gaps, §7): **OP16, EB03, PRB01, PRB02** (4 sets → 4 boxes). Box EV hides cleanly for them.

All tracked boxes are `region='en'`; every figure below is for **English product** unless marked JP.

## 2 · Structure facts (near-official)

| Fact | Value | Source |
|---|---|---|
| Standard EN box | **24 packs × 12 cards** (288) | official product pages (en.onepiece-cardgame.com/products/boosters/), danireon.com, doescards.ca |
| Standard JP box | 24 packs × **6** cards (144) | samuraiswordtokyo.com, cardcosmos.de |
| Standard EN case | **12 boxes** | TCGplayer case listings: OP05 #498735, OP01 #450087, OP13 #628353 all state 12 |
| EB01 EN case | 12 displays | TCGplayer #521162 |
| EB02 EN case | unverified — `per_case` left **null** | — |
| PRB01 EN box | **20 packs × 10 cards**; case = **10 boxes + 2 Gold DON** | official en.onepiece-cardgame.com/products/boosters/prb01.php; TCGplayer #545400 |
| PRB02 EN box | 20 packs × 10 cards, every pack guarantees SR+ | official prb02.php; retailer listings |
| Per-pack guarantees | **none usable** — EN packs guarantee "1 R or better", which folds into BULK; leaders are NOT guaranteed per pack | contradictory sources (tcgtalk claims L 1-per-2-packs on JP; no EN source supports a per-pack L slot) |

→ `per_pack` is **null on every row**. `per_case` = per_box × 12 (× n/a for EB02).

## 3 · Methodology and the EN↔JP conversion

Source classes used, in order of preference:

1. **EN-generic guides** (aggregate community data): tcgtalk.com/guides/one-piece-tcg-box-pull-rates ·
   onepiecechases.com/pull-rates-explained · archivedrops.com/blog/one-piece-pull-rates-… ·
   slab-z.com (2026 guide).
2. **JP per-set guides** (the only per-set series found): samuraiswordtokyo.com `blogs/news/op-XX-pull-rates-best-cards`
   for OP01–OP04, OP06–OP16, EB01–EB03, PRB01/02, corroborated generically by cardcosmos.de.
3. TCGplayer / official Bandai product pages for structure only.

**Not found:** any large EN per-set break-aggregate (the r/OnePieceTCG compilations did not surface
through search; egmanevents and onepiece.gg have no pull-rate articles findable; ripster.gg blocks
fetching, HTTP 403). This is the main reason nothing in the draft earns `confidence='high'`.

**The ×2 heuristic.** JP per-set figures are per JP box (24×6 = 144 cards). EN boxes have the same 24
packs but 12-card packs (288). Doubling JP per-box rates for EN reconverges independently with EN
sources everywhere both exist:

- SR: JP 3–5/box ×2 → 6–10 ≈ EN consensus 7–10 ✓
- MR single-card sets: JP ~1/72–96 ×2 → ~1/36–48 boxes = archivedrops' EN "1 per 3–4 cases" ✓
- SEC: JP ~1/2–3 boxes ×2 → ~0.7–1.0 ≈ EN consensus ~1/box ✓

Every ×2-derived figure is `confidence='low'` and says so in `source_note`. Justin decision #1.

**Slots follow our own DB.** Box EV prices a slot as avg over the set's cards with that
`game_rarities.code` (join on `printed_set_code`, group on `card_image_id`). I probed
`cards` per printed set (2026-07-27) and only seeded slots whose class is non-empty for that set —
e.g. OP15 has **no SP class** in our DB, so OP15 gets no SP row even though the JP guide quotes an SP
rate (7.78 %/JP-box). Full class inventory per set is in §5.

## 4 · Per-set draft tables (EN, per box; per_case = ×12)

Confidence: m = medium, l = low. BULK = 288 − Σ(hit slots), R/UC/C remainder, computed exactly so
§3.5 "weights sum to 100%" holds.

### OP02 · OP03 · OP04 — early-era baseline (identical rows)

| slot | per_box | conf | basis |
|---|---:|---|---|
| SEC | 1.000 | m | EN consensus ~1/box (tcgtalk, onepiecechases); conflict: archivedrops 0.5, slab-z 1/3 → §6.1 |
| SR | 9.000 | m | EN consensus 7–10 (tcgtalk 7, onepiecechases 8, breaks 8–12) |
| AA | 2.000 | m | all four EN guides ~2/box |
| L | 5.000 | l | contested 2–12 → §6.3; onepiecechases 5.0 |
| BULK | 271.000 | m | 288 − 17 |

No MR/SP slots: the MR/SP classes under OP01–OP04 printed codes are reprints pulled from **other**
products (JP reprint-wave manga like Sabo OP04 at 1/156 JP boxes exist, but EN boxes in the market are
mixed prints and no EN rate is defensible) → §6.5, decision #3.

### OP01 Romance Dawn — as above, except

| slot | per_box | conf | basis |
|---|---:|---|---|
| SEC | 0.500 | l | EN OP01 notoriously below-baseline: archivedrops "~1 per 3 boxes (EN)"; slab-z 1/3; vs generic 1.0 → §6.1 |
| SR/AA/L/BULK | 9 / 2 / 5 / 271.5 | m/l/l/m | wave-1 boxes reported worse AA (~1/box) — note kept in source_note |

**Manga Shanks (MR) deliberately NOT seeded.** JP guide: 1-in-12 from *current JP reprint* boxes. EN
Wave-1 product predates the card entirely; EN "Wave 2 White" is a heterogeneous SKU (Dec 2022 onward);
the EN card's $1,483 price is consistent with EN pulls being rare-to-nonexistent, not with 1/6 boxes.
Both tracked OP01 boxes share one `set_id`, so `pull_rates` **cannot** distinguish waves anyway → decision #2.

### OP05 Awakening of the New Era — baseline plus

| slot | per_box | conf | basis |
|---|---:|---|---|
| MR | 0.075 | l | 3 manga cards (Luffy/Law/Kid) × ~1/40 EN boxes each; JP ~1/72–96 per card ×2; matches EN-generic "~1 MR per case" for this 3-card set |
| SEC/SR/AA/L | 1 / 9 / 2 / 5 | m/m/m/l | BULK 270.925 |

### OP06 Wings of the Captain — baseline plus

| slot | per_box | conf | basis |
|---|---:|---|---|
| MR | 0.025 | l | JP 1/72–96 boxes ×2 (samurai OP-06 guide) |
| SEC | 1.000 | m | JP guide: 1 SEC guaranteed per JP box — EN at least 1.0; BULK 270.975 |

### OP07 500 Years in the Future · OP08 Two Legends — adds SP + TR

| slot | OP07 | OP08 | conf | basis |
|---|---:|---:|---|---|
| MR | 0.008 | 0.028 | l | JP: Boa comic 1/240 (OP07), MR ~1/72 (OP08), ×2 |
| SP | 0.125 | 0.125 | l | JP 1/12 boxes ×2 = 0.167 vs EN-generic 1–2/case = 0.083–0.167; seeded 0.125, both cited → §6.4 |
| TR | 0.500 | 0.500 | l | onepiecechases "TR 55.6 %/box, OP06+ sets"; single-site figure → decision #9 |
| SEC | 1.000 | 1.000 | m | JP OP07 ~1/box (→ EN ≥1; note says lean high) |
| SR/AA/L | 9 / 2 / 5 | 9 / 2 / 5 | m/m/l | BULK 270.367 / 270.347 |

### OP09 Emperors in the New World — the manga-rich set

| slot | per_box | conf | basis |
|---|---:|---|---|
| MR | 0.110 | l | 4 manga (Roger/Luffy/Shanks/Teach): JP class rate 1/18 boxes ×2 ≈ 1/9 |
| SEC | 0.700 | l | JP 1/2.9 ×2 vs generic 1.0 → §6.1 |
| SP | 0.165 | l | JP 1/12.1 ×2 |
| TR | 0.500 | l | as OP07 |
| SR/AA/L | 9 / 2 / 5 | m/m/l | BULK 270.525. JP also reports Gold Roger 1/72 — folds into whatever class carries it (AA in our DB), not separately seeded |

### OP10 Royal Blood — weakest SEC data of any set

| slot | per_box | conf | basis |
|---|---:|---|---|
| SEC | 0.500 | l | JP "1-in-5 to 1-in-10 boxes" ×2 = 0.2–0.4 vs generic 1.0 — **biggest per-set conflict, §6.2**; seeded 0.5 |
| SP | 0.200 | l | JP 1/10 ×2 |
| MR | 0.011 | l | JP Law manga 0.55 % ×2 |
| TR | 0.500 | l | as OP07 |
| SR | 8.000 | l | modern-era JP 3–4 ×2 vs EN breaks 8–10 |
| AA/L | 2 / 5 | m/l | BULK 271.789 |

### OP11 · OP12 — modern baseline

| slot | OP11 | OP12 | conf | basis |
|---|---:|---:|---|---|
| SEC | 0.670 | 0.700 | l | JP 1/3 (OP11), "1 SEC-or-parallel/box" (OP12), ×2 |
| SP | 0.150 | 0.180 | l | JP 1/13, 1/11, ×2 |
| MR | 0.024 | 0.028 | l | JP comic 1/84 (OP11), Bonney 1/72 (OP12), ×2 |
| TR | 0.500 | 0.500 | l | as OP07 |
| SR | 8.000 | 8.000 | l | JP 3 / 3–5 guaranteed ×2 |
| AA/L | 2 / 5 | 2 / 5 | m/l | BULK 271.656 / 271.592. JP 3rd-Anniversary specials (1/105, 1/240 JP) have no DB class of their own — not seeded |

### OP13 Carrying On His Will — SAR replaces MR

| slot | per_box | conf | basis |
|---|---:|---|---|
| SAR | 0.040 | l | Luffy/Ace/Sabo Super Parallels: JP 1/50–80 ×2 ≈ 0.031, plus Red versions JP 1/200+ ×2 ≈ 0.010; class total ~0.04. DB class = 6 card_image_ids (_p2 regular + _p3 Red) |
| SEC | 1.500 | l | JP 1/1–2 boxes ×2; OP13 runs 7 SEC-class cards |
| SR | 9.000 | m | JP 4–5 ×2 = 8–10, agrees with EN breaks |
| AA/L | 2 / 5 | m/l | BULK 270.460. JP "Demon Pack" (all-parallel) 1/10–20 cases skews the tail; not a slot |

No SP/TR rows: OP13's SP class in our DB is later-set reprints of OP13 cards; no TR class exists.

### OP14 The Azure Sea's Seven · OP15 Adventure on Kami's Island

| slot | OP14 | OP15 | conf | basis |
|---|---:|---:|---|---|
| MR | 0.021 | 0.028 | l | JP Mihawk comic 1/96 (OP14), Enel comic 1/72 (OP15), ×2 |
| SP | 0.170 | — | l | JP 1/12 ×2. **OP15 SP not seeded — no SP class under OP15 in our DB** despite JP quoting 7.78 %/box (§5 note) |
| SEC | 0.670 | 0.670 | l | JP 1/3 ×2 |
| SR | 8.000 | 8.000 | l | JP 3-guaranteed ×2; EN breaks lean higher → §6.1 |
| AA/L | 2 / 5 | 2 / 5 | m·l / l·l | BULK 272.139 / 272.302. OP14 anniversary Buggy Silver (JP 1/120) has no DB class — not seeded |

### EB01 Memorial Collection · EB02 Anime 25th Collection

| slot | EB01 | EB02 | conf | basis |
|---|---:|---:|---|---|
| MR | 0.020 | 0.014 | l | Chopper manga JP 1/48–144 ×2 (EB01); Luffy manga JP 1/140 ×2 (EB02) |
| SEC | 0.500 | 0.400 | l | EB01: 1 SEC card (Bentham), thin data; EB02: JP 1/5 ×2 |
| SR | 9.000 | 6.000 | l | EB01 EN breaks look standard-era; EB02 JP "3 SR guaranteed" ×2 |
| AA | 2.000 | 2.000 | l | EB02 JP "~1 parallel/box" ×2 |
| BULK | 276.480 | 279.586 | l | includes ~2–3 unmodeled leader pulls per box — EB leader rates unsourced, no L slot (§7) |

EB01 `per_case` ×12 (TCGplayer-verified); **EB02 `per_case` = null** (case size unverified).
EB01's SP class (10 cards) is a real value driver with **no sourced rate** — gap, decision #7.
EB02's 26 anime-art SPR leaders (JP 1/11 boxes) don't map onto our DB's classes cleanly (EB02 shows L:4, AA:17) — folded into AA, noted.

## 5 · Rarity-code mapping (researched slot → `game_rarities.code`)

`game_rarities` for one_piece (probed 2026-07-27): GMR, MR, SAR, SP, AA, TR, SEC, SR, L, R, UC, C, PR, DON.
`cards.rarity` stores these same codes; slot_label = code so `rarity_id` resolves at seed time.

| Researched slot | Code | Notes |
|---|---|---|
| Super Rare | `SR` | base SRs only; alt-art SRs live in AA class |
| Secret Rare | `SEC` | class includes SEC parallels in some sets (e.g. OP13 shows 7) |
| Alt-art / parallels (incl. Leader- and SEC-parallels) | `AA` | DB lumps all parallel flavors into one class — one AA slot per set |
| Special / SPR | `SP` | ⚠ pricing-population hazard, §6.5 |
| Manga / Comic Parallel | `MR` | |
| Super Parallel (OP13 trio, incl. Red) | `SAR` | OP13 only; 6 card_image_ids |
| Treasure Rare | `TR` | single card per set, OP07–OP12 in our DB |
| Leader (base) | `L` | seeded for main sets only |
| R / UC / C remainder | **BULK** — `rarity_code: null`, slot_label `'R / UC / C bulk'` | never passed to RarityBadge (spec §3.5) |
| Golden Manga Rare | `GMR` — **zero cards in DB, any region** | vocabulary entry is currently unused; no GMR rows seeded, a GMR slot could never price |
| Gold DON!! (PRB chase) | `DON` code exists, but **no DON cards attach to any tracked set** | gap — PRB products only |
| 3rd-Anniversary Gold/Silver variants (OP11/12/14) | no code | absorbed into AA/SP classes or absent; not seeded |
| Promo | `PR` | not pulled from boosters; excluded |
| God Pack / Demon Pack | — | pack-level events, not slots; noted in per-set basis only |

## 6 · Conflicts found (not silently averaged)

1. **SEC per EN box, generic:** 0.33/box (slab-z) · 0.5 (archivedrops) · ~1.0 (tcgtalk, onepiecechases) ·
   2.0 (doescards one-off example). Draft uses 1.0 for OP02–OP08 and 2×JP set figures for OP09+ —
   which lands 0.5–0.7 and *disagrees* with the generic 1.0 for those sets.
2. **OP10 SEC:** JP-derived 0.2–0.4 vs generic 1.0. Widest per-set spread; seeded 0.5 `low`.
3. **Leaders per box:** 2 (archivedrops) · 5 (onepiecechases) · ~12 (tcgtalk, JP-flavored "1 per 2
   packs"). Seeded 5.0 `low` everywhere. Leaders are cheap; EV impact is small — dropping the slot
   entirely is a defensible alternative (decision #6).
4. **SP per EN box:** EN-generic "1–2 per case" (0.083–0.167) vs JP 1/11–13 ×2 (0.15–0.18). Seeded
   0.125–0.20 per set.
5. **SR modern era:** JP "3 guaranteed" ×2 = 6 vs EN break reports 8–10 for OP10+. Seeded 8.0 `low`.
6. **Case size:** tcgtalk claims 6-box cases; TCGplayer EN case listings say 12. 12 used.
7. **Manga in old sets:** samurai (JP, current reprints) quotes OP01 Shanks 1/12, OP04 Sabo 1/156 —
   not transferable to EN mixed-print SKUs; omitted rather than guessed.

## 7 · Gaps — sets launching without Box EV (section hides, per spec)

| Set | Why no rows |
|---|---|
| **OP16** The Time of Battle | zero EN cards in our DB (EN release 2026-06-12 per samurai, catalog lag); JP guide is pre-release estimates only. Even era-generic rows could not price. |
| **EB03** Heroines Edition | only god-pack odds sourced (JP 1/180 boxes); no per-slot base rates anywhere; god-pack structure would distort a slot-EV anyway |
| **PRB01** The Best | rates exist (JP: Gold DON 1/10 boxes, comic 1/60–80, god pack ~1/1000 → EN ×2 for 20-pack box) **but the EV join is structurally broken**: only **2 cards** carry `printed_set_code='PRB01'` (the set's 299 cards are reprints keeping their original printed codes). No join population → no rows. See decision #4 |
| **PRB02** | same class of problem (39 printed cards vs 20-pack SR-per-pack structure; no SEC/DON classes attributed); sourced rates (Sanji comic JP 1/100–200) recorded here for when the join question is settled |

Also unmodeled inside seeded sets: EB01 SP class (no rate), EB leader slots (no rate), anniversary
variant classes (no DB class), DON!! alt-arts (cards not attached to sets).

## 8 · Structural findings that outlive this draft

1. **SP/MR classes are cross-product.** Cards like `OP05-001_sp_eb02` (SP of an OP05 card pulled from
   EB02 boxes) sit under `printed_set_code='OP05'`. So an SP slot for OP07's box is priced off "SP
   reprints *of* OP07 cards" — a different population from "SP cards pulled *from* OP07 boxes". The
   magnitudes are similar (SP reprints trade in one band) but it is an approximation, flagged per row.
   The suffix pattern `_sp_<setcode>` even encodes the true source product if a later loader wants it.
2. **MR classes mix originals and reprint variants** (`OP05-119_p2` vs `_r1/_r2` vs anniversary ids),
   so avg-price for an MR slot blends the $4k original with cheaper reprints. Conservative for EV.
   One data glitch spotted: a row named "Buggy (051) (Manga)" with `card_number OP05-067` but
   `card_image_id OP09-051_p2` sits in the OP05 MR class.
3. **`pull_rates` is keyed per set, but OP01 ships two materially different box SKUs** (Wave 1 vs
   Wave 2) sharing one `set_id`. The table cannot express wave differences.
4. **No slot anywhere earns `confidence='high'`** — Bandai publishes nothing, and no large EN aggregate
   dataset was findable. Under spec §3.5, every seeded set will show the caution strip (every set has
   ≥1 low slot). If that renders as permanent wallpaper, the strip's trigger may deserve a rethink
   (e.g. only when the *top* slot is low) — UI decision, not mine.

## 9 · What Justin needs to decide (D7)

1. **Accept the ×2 JP→EN heuristic** for the 62 `low` rows, or restrict the seed to EN-sourced
   figures only (coverage would collapse to roughly SR/SEC/AA/BULK on OP02–OP09).
2. **OP01:** accept SEC 0.5 + no-MR draft? Wave 1 and Wave 2 boxes share the set-keyed table — accept
   the blend or defer OP01 entirely.
3. **SP slots (OP07–OP12, OP14):** seeded despite the §8.1 pricing-population mismatch. Keep, drop, or
   change the EV loader's membership join before seeding.
4. **PRB01/PRB02:** decide the loader question — if rarity averages ever join via `set_id` instead of
   `printed_set_code`, PRB rows become possible (rates are in §7) — else they stay hidden permanently.
5. **OP16 / EB03:** confirm launching without Box EV.
6. **L slot at 5.0 `low`:** keep or drop (wildest source spread, smallest EV impact).
7. **EB01 SP class:** launch without (current draft) or hold EB01 until a rate surfaces.
8. **EB02 `per_case` null** (case size unverified) — fine, or someone verifies 12.
9. **TR at 0.5/box (OP07–OP12):** single-source (onepiecechases). Keep at `low`, or drop TR rows.
10. **Contested figures** in §6.1/6.2/6.5 — any overrides before seeding.

## 10 · Source index

- https://tcgtalk.com/guides/one-piece-tcg-box-pull-rates — EN generic table
- https://onepiecechases.com/pull-rates-explained — EN generic incl. TR 55.6 %/box, SP 8 %, MR 2.7 %
- https://archivedrops.com/blog/one-piece-pull-rates-the-numbers-behind-every-booster-box — EN generic, per-set notes (OP01, OP03), case = 12
- https://www.slab-z.com/post/one-piece-tcg-rarities-pull-rates-complete-guide-updated-2026 — EN generic
- https://cardcosmos.de/en/blogs/news/one-piece-card-game-pull-rates-hitrates-der-japanischen-edition — JP generic corroboration
- samuraiswordtokyo.com per-set series (JP product): `blogs/news/op-01…op-16-pull-rates-best-cards`, `eb-01…eb-03…`, `prb-01…`, `prb-02-the-best-vol2-pull-rates-best-cards` (direct fetch 403s; extracted via search)
- Official structure: https://en.onepiece-cardgame.com/products/boosters/prb01.php · prb02.php
- TCGplayer case pages: 498735 (OP05), 450087 (OP01), 521162 (EB01), 545400 (PRB01), 628353 (OP13)
- Repo: `src/app/sets/sets-data.ts:109` `PULL_RATES` — **mockup fiction** (OP01 with "1 MR per box guaranteed", 6-box cases); ignored per spec §2.2

---

## Sensitivity analysis (2026-07-27) — top-slot 2× error

**Method.** Read-only probe against the live DB (PostgREST, service role; no writes). For each of the
17 seeded sets, per-rarity average prices were computed over the exact population Phase F's
`load-sealed-detail.ts` uses: `cards` where `game_id = one_piece`, `region = 'en'`,
`printed_set_code = <set code>`, deduped on `card_image_id` (max price kept), price basis
`price_stats.tcg_market` via the `price_stats_card_game_fk` embed, only prices > 0 counted. BULK is
the R/UC/C classes combined, per the draft's slot semantics. EV = Σ `per_box` × avg; per-slot
contribution `C` and share `S = C/EV`. Sensitivity to a 2× rate error on the **top slot by
contribution**: if our seeded rate is 2× truth we overstate by `err_over = (C/2)/(EV − C/2)`; if half
truth we understate by `err_under = C/(EV + C)`; worst = max (algebraically, `err_over` dominates
whenever the slot's share exceeds 50%). A slot whose rarity resolves zero cards contributes 0 and is
flagged. Caveat on BULK-top rows: BULK's `per_box` is a derived remainder (288 − hits), so a literal
2× *rate* error is structurally impossible there — for those rows the worst-case figure is better
read as sensitivity to the BULK slot's *value* (its average price) being wrong by the same factor,
which per §S.2 below is precisely the error that is actually present.

### S.1 · Primary table — strict Phase F semantics (what the shipped loader would compute)

Sorted by worst-case error, descending. **Cut** marks sets whose worst-case exceeds Justin's ±30%
threshold — **15 of 17** under these semantics.

| Set | EV | Top slot | Top share | Worst 2× err | Conf | JP-derived? | Zero-resolving slots | >±30%? |
|---|---:|---|---:|---:|---|---|---|---|
| OP02 | $2,605 | BULK | 90.8% | 83.2% | medium | no (derived) | — | CUT |
| OP09 | $27,947 | BULK | 90.5% | 82.6% | medium | no (derived) | — | CUT |
| OP14 | $2,850 | SR | 90.3% | 82.3% | low | **yes** | — | CUT |
| OP13 | $4,851 | BULK | 90.1% | 82.0% | medium | no (derived) | — | CUT |
| OP04 | $1,015 | BULK | 88.5% | 79.3% | medium | no (derived) | — | CUT |
| OP08 | $4,480 | BULK | 83.9% | 72.3% | medium | no (derived) | **AA: 0 cards** | CUT |
| OP10 | $6,426 | BULK | 81.0% | 68.1% | medium | no (derived) | — | CUT |
| OP01 | $8,689 | BULK | 77.2% | 62.9% | medium | no (derived) | — | CUT |
| OP03 | $3,770 | BULK | 74.7% | 59.6% | medium | no (derived) | — | CUT |
| OP06 | $6,698 | BULK | 74.1% | 58.8% | medium | no (derived) | — | CUT |
| EB01 | $8,721 | BULK | 66.9% | 50.3% | medium | no (derived) | — | CUT |
| OP12 | $6,250 | BULK | 65.8% | 49.1% | medium | no (derived) | — | CUT |
| OP05 | $11,944 | BULK | 61.7% | 44.6% | medium | no (derived) | — | CUT |
| OP07 | $9,800 | BULK | 61.0% | 43.9% | medium | no (derived) | — | CUT |
| EB02 | $806 | BULK | 58.7% | 41.6% | medium | no (derived) | — | CUT |
| OP15 | $232 | AA | 35.0% | 25.9% | low | no | — | keep |
| OP11 | $2,539 | BULK | 30.2% | 23.2% | medium | no (derived) | — | keep |

**Broken populations (>10% of EV in zero-resolving slots): 0 sets** on this basis. Only one
zero-resolving slot exists anywhere — OP08's AA (2/box seeded, **zero AA-classed cards** under
`printed_set_code='OP08'`; live inventory shows OP08 parallels retained base rarities:
SR 28 / R 38 / UC 39 / C 50 / L 12 / SP 7 / SEC 5 / TR 1 / MR 1, **no AA**). Priced at the
cross-set AA average (~$36) it would add ~$70/box — ~1.7% of OP08's polluted strict EV, but
**~14% of its honest EV** (§S.3), so on the honest basis OP08 *is* 1 broken-population set.
This contradicts §3's claim that only non-empty classes were seeded — the OP08 probe was wrong.

### S.2 · The strict table is dominated by a population defect, not by pull-rate risk

BULK is the top slot in 15/17 sets because the `printed_set_code` population **includes promo and
event reprints that are not pulled from booster boxes**, and they sit in the R/UC/C classes that the
~271-card BULK multiplier amplifies:

- `P-*` promo ids: e.g. `P-OP09-002` Uta (Treasure Cup 2025) **$8,999, rarity R** → OP09's strict
  BULK avg is $93.45/card → $25,280 of the $27,947 EV. `P-OP07-119` Ace (Serial Numbered) $9,950.
- Event ids: `-winner-pack`, `-regional-prize`, `-championship-prize`, `-cs-pack`, `-judge-pack`,
  `-premium-card-collection`, `-welcome-pack`, `-learn-together`, `-other` — e.g.
  `OP10-092-cs-pack` Perona **$600, rarity C**; `OP08-020-championship-prize` $249.99, rarity C.
- Base-rarity parallels: `_p*` ids that kept R/UC/C rather than AA — e.g. OP13's five "St." elder
  parallels (`OP13-091_p2` etc.) **$400–494 each, all rarity R**; `OP01-016_p1` Nami $404 R; box
  toppers (`OP02-059_p1` UC $57). §5's line "DB lumps all parallel flavors into AA" is **wrong for
  many sets** — plenty of parallels retain base rarity. Also singleton misclassifications:
  `OP06-047` "Charlotte Pudding (SP)" $84 sits in class R with a plain id.
- One promo in a small hit class does the same damage: OP14's SR class holds `P-OP14-112` Boa
  Hancock $3,499.78 → SR avg $321.67 vs honest $3.86 → $2,573/box of phantom SR value (90.3% of
  OP14's strict EV).

Strict EV is therefore inflated ~1×–40× per set (median ≈ 15×; OP15 is the **only** clean set —
zero promo ids). Against real box prices (~$80–$500) every §3.5 `sealed_premium` would print
absurdly negative. **The same population feeds the already-shipped §3.4 top-10: in 9 of 17 sets the
set's #1 "top card" is currently a promo** (OP02, OP03, OP05, OP06, OP07, OP09, OP10, OP12, OP14).

EV per set under three populations (A strict · B minus `P-*`/`-winner-pack` · C booster-baseline —
B additionally minus event ids everywhere, and BULK membership restricted to vanilla R/UC/C, i.e.
no `_p*` ids, no "Box Topper" names):

| | OP01 | OP02 | OP03 | OP04 | OP05 | OP06 | OP07 | OP08 | OP09 | OP10 | OP11 | OP12 | OP13 | OP14 | OP15 | EB01 | EB02 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 8,689 | 2,605 | 3,770 | 1,015 | 11,944 | 6,698 | 9,800 | 4,480 | 27,947 | 6,426 | 2,539 | 6,250 | 4,851 | 2,850 | 232 | 8,721 | 806 |
| B | 3,073 | 399 | 261 | 562 | 561 | 981 | 1,798 | 1,120 | 868 | 2,044 | 259 | 270 | 4,867 | 307 | 232 | 1,207 | 463 |
| C | 1,409 | 159 | 134 | 582 | 295 | 386 | 699 | 449 | 698 | 302 | 259 | 270 | 439 | 307 | 232 | 355 | 461 |

Promo exclusion alone (B) is not sufficient — OP13 stays at $4,867 because the elder parallels are
`_p2` ids, not promos. C-level EVs ($134–$1,409) are the plausible ballpark for a box's contents.

### S.3 · Diagnostic table — booster-baseline population (C)

Same math on the cleaned population. This is the table that actually answers "how exposed is the EV
to a pull-rate error", because the top slot is no longer an artifact. **8 of 17** exceed ±30% here.

| Set | EV | Top slot | Top share | Worst 2× err | Conf | JP-derived? | >±30%? | Note |
|---|---:|---|---:|---:|---|---|---|---|
| OP04 | $582 | BULK | 89.3% | 80.6% | medium | no (derived) | CUT | driven by one $201 R (`OP04-015` Zoro) with a plain id — residual pollution, honest bulk avg ≈ $0.13 |
| OP06 | $386 | BULK | 65.0% | 48.2% | medium | no (derived) | CUT | driven by `OP06-047` "(SP)" $84 classed R |
| OP01 | $1,409 | L | 61.7% | 44.6% | low | no | CUT | L class includes leader *parallels* (avg $174) — and L is the most contested rate (2–12/box, §6.3) |
| OP05 | $295 | MR | 55.6% | 38.5% | low | **yes** | CUT | 0.075/box × $2,185 manga avg |
| EB01 | $355 | BULK | 54.2% | 37.1% | medium | no (derived) | CUT | `EB01-003-regional-prize` $190 still leaks in via plain-suffix id |
| OP13 | $439 | SAR | 50.6% | 33.8% | low | **yes** | CUT | the intended chase slot — 0.04/box × $5,550 |
| OP03 | $134 | BULK | 49.5% | 33.1% | medium | no (derived) | CUT | |
| EB02 | $461 | AA | 43.3% | 30.2% | low | **yes** | CUT (borderline) | AA avg $99.76 — SPR anime leaders folded into AA |
| OP02 | $159 | AA | 41.7% | 29.4% | medium | no | keep | |
| OP15 | $232 | AA | 35.0% | 25.9% | low | no | keep | |
| OP09 | $698 | L | 31.0% | 23.7% | low | no | keep | leader parallels in L again |
| OP14 | $307 | AA | 30.1% | 23.1% | medium | no | keep | |
| OP08 | $449 | SP | 30.0% | 23.1% | low | mixed (JP×2 + EN midpoint) | keep | **AA: 0 cards** (~14% of EV missing at proxy price) |
| OP11 | $259 | AA | 28.7% | 22.3% | medium | no | keep | |
| OP07 | $699 | TR | 28.5% | 22.2% | low | no (single EN source) | keep | |
| OP12 | $270 | AA | 25.0% | 20.0% | medium | no | keep | |
| OP10 | $302 | SR | 21.2% | 17.5% | low | **yes** | keep | |

### S.4 · What this changes for D7

1. **The EV membership join needs an exclusion rule before any seeding matters.** With Phase F
   semantics as shipped, §3.5 output is promo-driven noise for 16/17 sets regardless of how good the
   pull rates are. An explicit `includes()` exclusion list (`P-` prefix, `-winner-pack`,
   `-regional-prize`, `-championship-prize`, `-cs-pack`, `-judge-pack`, `-premium-card-collection`,
   `-welcome-pack`, `-learn-together`, `-other`) plus a decision on `_p*` base-rarity parallels
   (they are chase pulls or box toppers, not 271-per-box bulk) is a prerequisite, and it also fixes
   the live §3.4 top-10 promo contamination. Suffixes are not exhaustive — plain-id leaks exist
   (`OP04-015`, `EB01-003-regional-prize`-style names on near-plain ids), so a flag column or curated
   exclusion may age better than string matching.
2. **On the honest basis, the ±30% cut list is OP04, OP06, OP01, OP05, EB01, OP13, OP03, EB02** —
   but OP04/OP06/EB01 are there because of residual single-card pollution, not rate risk; the
   genuinely rate-sensitive sets are **OP01 (L), OP05 (MR), OP13 (SAR), EB02 (AA)** — three of those
   four top slots are `low`-confidence and JP-derived (OP01's L is `low` EN-contested).
3. **OP08's AA row should be dropped or the class question resolved** — it can never price
   (zero-resolving), silently deleting ~14% of the set's honest EV.
4. The per-set analysis JSON (all three variants, per-slot contributions/shares/populations) was
   left in the session scratchpad; the numbers above are reproducible from the method note.
