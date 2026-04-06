-- ============================================================
-- OWL Market — Schema Migration v2
-- Tournament Promo Support for Cards Table
-- Run in Supabase Studio → SQL Editor → New Query → Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ONE PIECE TCG TOURNAMENT PRIZE STRUCTURE
-- ────────────────────────────────────────────────────────────
--
-- Store Tournament
--   participation → Tournament Pack (common promo)
--   winner        → Winner Pack (uncommon promo)
--
-- Flagship Battle
--   participation → Promo Pack
--   top8          → parallel art
--   winner        → rarer parallel art
--
-- Standard Battle (very rare, JP/Asia only)
--   winner        → trophy parallel
--
-- Treasure Cup
--   participation → Event Pack
--   top64         → parallel art
--
-- Regionals
--   participation → Finalist Set
--   top64         → parallel
--   top16         → rarer parallel
--   top8          → even rarer parallel
--   champion      → rarest parallel
--
-- Championship Finals
--   participation / top512 / top64 / top32 / top16 /
--   champion / 1st / 2nd / 3rd — each tier gets
--   progressively rarer parallels
--
-- World Championship
--   Rarest cards in existence
--
-- ────────────────────────────────────────────────────────────
-- CARD_IMAGE_ID SUFFIX CONVENTION
-- ────────────────────────────────────────────────────────────
--
-- OP01-025            = base card
-- OP01-025_p1         = parallel (unstamped)
-- OP01-025_p1_cs2324  = Championship 2023-24 stamped parallel
-- OP01-025_p1_fb      = Flagship Battle stamped parallel
-- OP01-025_p1_sb      = Standard Battle stamped parallel
-- OP01-025_p1_trophy  = serialized trophy card
--
-- ────────────────────────────────────────────────────────────

-- 1. variant_label is already a free text field — no change needed.

-- 2. Add new columns to the cards table.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  promo_source text;
-- values: 'magazine' | 'store_tournament' | 'flagship_battle' |
-- 'standard_battle' | 'treasure_cup' | 'regionals' |
-- 'championship_finals' | 'world_championship' |
-- 'anniversary' | 'film_tie_in' | 'ichiban_kuji' |
-- 'one_piece_day' | 'live_action' | null

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  tournament_event text;
-- values: 'store' | 'flagship' | 'standard_battle' |
-- 'treasure_cup' | 'regionals' | 'championship_finals' |
-- 'world_championship' | null

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  tournament_placement text;
-- values: 'participation' | 'top512' | 'top64' | 'top32' |
-- 'top16' | 'top8' | 'champion' | '1st' | '2nd' | '3rd' | null

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  tournament_season text;
-- values: '2022-23' | '2023-24' | '2024' | '25-26' | null

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  is_stamped boolean DEFAULT false;
-- true when a physical event logo is stamped on the card

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  is_serialized boolean DEFAULT false;
-- true for numbered prints e.g. 001/100

ALTER TABLE cards ADD COLUMN IF NOT EXISTS
  serial_max int;
-- e.g. 100 means only 100 copies exist

-- ────────────────────────────────────────────────────────────
-- COMPLETE CARDS TABLE REFERENCE (after this migration)
-- ────────────────────────────────────────────────────────────
--
-- Column              Type            Default / Notes
-- ──────────────────── ─────────────── ──────────────────────────────────────
-- id                  uuid            PK, gen_random_uuid()
-- card_image_id       text            UNIQUE NOT NULL — primary lookup key
-- card_number         text            NOT NULL — e.g. "OP01-025"
-- name                text            full card name incl. variant
-- name_base           text            base name without "(Parallel)" etc.
-- variant_label       text            free text: "Parallel", "Manga", etc.
-- set_id              uuid            FK → sets(id) ON DELETE SET NULL
-- rarity              text            C | UC | R | SR | SEC | L | SP | MR | TR | AA
-- card_type           text            Leader | Character | Event | Stage
-- color               text[]          e.g. {Red,Green}
-- power               int
-- counter             int
-- life                int
-- cost                int
-- attribute           text            Slash | Strike | Ranged | Wisdom | Special
-- types               text[]          subtypes e.g. {Straw Hat Crew,Supernovas}
-- effect              text            card effect / ability text
-- trigger             text            trigger effect text
-- artist              text            illustrator name
-- image_url           text            full-size card image URL
-- image_url_small     text            thumbnail image URL
-- tcg_product_id      text            TCGplayer product ID
-- created_at          timestamptz     DEFAULT now()
--
-- === Added in migration v2 (tournament promo support) ===
--
-- promo_source        text            magazine | store_tournament | flagship_battle |
--                                     standard_battle | treasure_cup | regionals |
--                                     championship_finals | world_championship |
--                                     anniversary | film_tie_in | ichiban_kuji |
--                                     one_piece_day | live_action | null
-- tournament_event    text            store | flagship | standard_battle |
--                                     treasure_cup | regionals | championship_finals |
--                                     world_championship | null
-- tournament_placement text           participation | top512 | top64 | top32 |
--                                     top16 | top8 | champion | 1st | 2nd | 3rd | null
-- tournament_season   text            2022-23 | 2023-24 | 2024 | 25-26 | null
-- is_stamped          boolean         DEFAULT false — event logo stamped on card
-- is_serialized       boolean         DEFAULT false — numbered print e.g. 001/100
-- serial_max          int             e.g. 100 means only 100 copies exist
--
-- Total: 29 columns
-- ────────────────────────────────────────────────────────────
