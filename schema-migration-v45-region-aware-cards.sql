-- Moon Market — Migration v45: region-aware cards (EN catalog vs JP-exclusive)
--
-- Adds cards.region so Japanese-exclusive rows (auto-created by the Yuyu-tei
-- sync) can coexist with the English catalog without leaking into EN pages.
-- All existing cards are English → 'en'. JP-exclusive rows use 'jp' and carry a
-- card_image_id namespaced with "_jp_" (e.g. OP05-119_jp_10143).
--
-- jp_prices already links via card_id → cards(id); a region='jp' card links the
-- same way (its game_id matches), so no jp_prices change is required. Apply
-- manually in the Supabase SQL editor (this repo has no migration runner).

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'en';

-- Explicit backfill (redundant with the default, but safe to re-run).
UPDATE public.cards SET region = 'en' WHERE region IS NULL;

-- EN reads filter on (game_id, region); JP-exclusive lookups filter on region.
CREATE INDEX IF NOT EXISTS idx_cards_game_region
  ON public.cards(game_id, region);
