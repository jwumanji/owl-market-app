-- ============================================================
-- OWL Market — Supabase Schema
-- Run this in Supabase Studio → SQL Editor → New Query → Run
-- ============================================================

-- 1. sets
CREATE TABLE sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  code        text,
  name        text NOT NULL,
  series      text,
  year        int,
  release_date date,
  card_count  int DEFAULT 0,
  color       text,
  tcg_set_id  text,
  created_at  timestamptz DEFAULT now()
);

-- 2. cards
CREATE TABLE cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_image_id   text UNIQUE NOT NULL,
  card_number     text NOT NULL,
  name            text,
  name_base       text,
  variant_label   text,
  set_id          uuid REFERENCES sets(id) ON DELETE SET NULL,
  rarity          text,
  card_type       text,
  color           text[],
  power           int,
  counter         int,
  life            int,
  cost            int,
  attribute       text,
  types           text[],
  effect          text,
  trigger         text,
  artist          text,
  image_url       text,
  image_url_small text,
  tcg_product_id  text,
  created_at      timestamptz DEFAULT now()
);

-- 3. price_stats
CREATE TABLE price_stats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id             uuid UNIQUE NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tcg_low             numeric,
  tcg_mid             numeric,
  tcg_market          numeric,
  tcg_high            numeric,
  ebay_low            numeric,
  ebay_avg            numeric,
  ebay_high           numeric,
  market_avg          numeric,
  chg_1d              numeric,
  chg_7d              numeric,
  chg_30d             numeric,
  volume_7d           int,
  volume_30d          int,
  ath                 numeric,
  ath_date            date,
  atl                 numeric,
  atl_date            date,
  tcg_listings_count  int,
  updated_at          timestamptz DEFAULT now()
);

-- 4. price_history
CREATE TABLE price_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tcg_market  numeric,
  ebay_avg    numeric,
  market_avg  numeric,
  volume      int,
  recorded_at timestamptz DEFAULT now()
);

CREATE INDEX idx_price_history_card_date ON price_history(card_id, recorded_at DESC);

-- 5. ebay_sales
CREATE TABLE ebay_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id       uuid REFERENCES cards(id) ON DELETE SET NULL,
  ebay_item_id  text UNIQUE NOT NULL,
  sale_price    numeric,
  currency      text DEFAULT 'USD',
  grader        text,
  grade         numeric,
  sale_type     text,
  condition     text,
  title         text,
  image_url     text,
  ebay_url      text,
  sold_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_ebay_sales_sold_at ON ebay_sales(sold_at DESC);
CREATE INDEX idx_ebay_sales_card_sold ON ebay_sales(card_id, sold_at DESC);

-- 6. sealed_products
CREATE TABLE sealed_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          uuid REFERENCES sets(id) ON DELETE SET NULL,
  name            text NOT NULL,
  product_type    text,
  tcg_price       numeric,
  ebay_avg        numeric,
  market_avg      numeric,
  chg_1d          numeric,
  chg_7d          numeric,
  chg_30d         numeric,
  ath             numeric,
  atl             numeric,
  image_url       text,
  tcg_product_id  text,
  updated_at      timestamptz DEFAULT now()
);

-- 7. characters
CREATE TABLE characters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  subtitle    text,
  faction     text,
  tier        int DEFAULT 3,
  type_tag    text,
  emoji       text,
  created_at  timestamptz DEFAULT now()
);

-- 8. user_profiles
CREATE TABLE user_profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username            text UNIQUE,
  email               text,
  plan                text DEFAULT 'free',
  stripe_customer_id  text,
  created_at          timestamptz DEFAULT now()
);

-- 9. portfolio_items
CREATE TABLE portfolio_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quantity        int DEFAULT 1,
  purchase_price  numeric,
  purchase_date   date,
  grader          text,
  grade           numeric,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
