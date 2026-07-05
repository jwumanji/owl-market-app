-- OWL Market — Migration v44: Japanese market pricing (Yuyu-tei) snapshots
--
-- One row per source card per snapshot_date (time-series friendly). game_id is
-- NOT NULL per the v40 game-boundary convention. card_id / card_image_id are
-- resolved by the sync matcher (nullable until a One Piece catalog card is
-- matched by card_number + variant). Apply manually in the Supabase SQL editor
-- (this repo has no migration runner).

CREATE TABLE IF NOT EXISTS public.jp_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  card_id        uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  card_image_id  text,                     -- resolved canonical id (denormalized for audit joins)
  -- source identity
  source         text NOT NULL DEFAULT 'yuyutei',
  source_card_id text NOT NULL,            -- Yuyu-tei "ver/cid", e.g. "op05/10143"
  source_url     text,
  -- card identity as scraped (JP)
  set_code       text,                     -- "OP05"
  card_number    text,                     -- "OP05-118"
  card_name      text,                     -- JP name incl. variant, e.g. "カイドウ(パラレル)"
  rarity         text,                     -- Yuyu-tei rarity code, e.g. "P-SEC"
  variant        text,                     -- normalized variant key: 'altart' | 'sp' | 'manga' | '' (base)
  -- price
  price_jpy      numeric,
  in_stock       boolean,
  image_url      text,
  match_method   text,                     -- 'number+variant' | 'number+base' | 'number-only' | 'unmatched'
  -- provenance
  snapshot_date  date NOT NULL,
  created_at     timestamptz DEFAULT now(),
  raw            jsonb
);

-- One snapshot per source card per day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jp_prices_source_day
  ON public.jp_prices(source, source_card_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_jp_prices_card_date
  ON public.jp_prices(card_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_jp_prices_number
  ON public.jp_prices(card_number);
CREATE INDEX IF NOT EXISTS idx_jp_prices_game_date
  ON public.jp_prices(game_id, snapshot_date DESC);
