-- Migration v29: Multi-TCG game foundation.
-- Run after v28. This is the expand/backfill step for OWL-19.
--
-- This migration is intentionally additive:
-- - creates the canonical games table
-- - inserts the existing One Piece game
-- - adds nullable game_id columns
-- - backfills current rows to One Piece
-- - adds non-unique indexes for dual-read migration work
--
-- Do not enforce NOT NULL or drop global unique constraints in this phase.

CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_slug_check
    CHECK (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT games_name_not_blank_check
    CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.games IS
  'TCG/game boundary for catalog, inventory, matching, pricing, and routing.';

COMMENT ON COLUMN public.games.slug IS
  'Canonical internal game slug. For One Piece this is one_piece; URL routes may map to one-piece.';

COMMENT ON COLUMN public.games.is_active IS
  'Allows admin-only ingest and maintenance for a game.';

COMMENT ON COLUMN public.games.is_public IS
  'Allows public routes/surfaces for a game.';

INSERT INTO public.games (slug, name, is_active, is_public, metadata)
VALUES (
  'one_piece',
  'One Piece Card Game',
  true,
  true,
  jsonb_build_object(
    'route_slug', 'one-piece',
    'justtcg_game', 'one-piece-card-game',
    'source', 'owl_market_existing_catalog'
  )
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  metadata = public.games.metadata || EXCLUDED.metadata,
  updated_at = now();

ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.price_stats
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.custom_cards
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.card_match_aliases
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.sealed_products
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.ebay_sales
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.psa_submissions
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.psa_submission_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

-- Backfill all existing Moon Market rows to One Piece. Current production data
-- is One Piece-only; future migrations will enforce explicit game scope.
WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.sets
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.cards
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.price_stats AS price_stats
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE price_stats.card_id = cards.id
  AND price_stats.game_id IS NULL
  AND cards.game_id IS NOT NULL;

UPDATE public.price_history AS price_history
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE price_history.card_id = cards.id
  AND price_history.game_id IS NULL
  AND cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.inventory_items
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.custom_cards
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.card_match_aliases
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.characters
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.sealed_products
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.portfolio_items
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.ebay_sales
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.psa_submissions
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.psa_submission_items
SET game_id = (SELECT id FROM one_piece)
WHERE game_id IS NULL;

-- Non-enforcing indexes for dual-read work. Scoped unique indexes replace
-- unsafe global uniqueness in OWL-22.
CREATE INDEX IF NOT EXISTS idx_games_is_public_active
  ON public.games(is_public, is_active);

CREATE INDEX IF NOT EXISTS idx_sets_game_id
  ON public.sets(game_id);

CREATE INDEX IF NOT EXISTS idx_sets_game_slug
  ON public.sets(game_id, slug);

CREATE INDEX IF NOT EXISTS idx_sets_game_code_upper
  ON public.sets(game_id, upper(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cards_game_id
  ON public.cards(game_id);

CREATE INDEX IF NOT EXISTS idx_cards_game_card_image_id
  ON public.cards(game_id, card_image_id);

CREATE INDEX IF NOT EXISTS idx_cards_game_set_id
  ON public.cards(game_id, set_id);

CREATE INDEX IF NOT EXISTS idx_cards_game_card_number
  ON public.cards(game_id, card_number)
  WHERE card_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_price_stats_game_id
  ON public.price_stats(game_id);

CREATE INDEX IF NOT EXISTS idx_price_stats_game_card
  ON public.price_stats(game_id, card_id);

CREATE INDEX IF NOT EXISTS idx_price_history_game_id
  ON public.price_history(game_id);

CREATE INDEX IF NOT EXISTS idx_price_history_game_card_recorded_at
  ON public.price_history(game_id, card_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_items_game_id
  ON public.inventory_items(game_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_game_status
  ON public.inventory_items(game_id, status);

CREATE INDEX IF NOT EXISTS idx_custom_cards_game_user
  ON public.custom_cards(game_id, user_id);

CREATE INDEX IF NOT EXISTS idx_card_match_aliases_game
  ON public.card_match_aliases(game_id);

CREATE INDEX IF NOT EXISTS idx_card_match_aliases_game_lookup
  ON public.card_match_aliases(
    game_id,
    source_type,
    normalized_name,
    normalized_card_number,
    normalized_set_hint
  );

CREATE INDEX IF NOT EXISTS idx_characters_game_slug
  ON public.characters(game_id, slug);

CREATE INDEX IF NOT EXISTS idx_sealed_products_game_id
  ON public.sealed_products(game_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_game_id
  ON public.portfolio_items(game_id);

CREATE INDEX IF NOT EXISTS idx_ebay_sales_game_id
  ON public.ebay_sales(game_id);

CREATE INDEX IF NOT EXISTS idx_psa_submissions_game_id
  ON public.psa_submissions(game_id);

CREATE INDEX IF NOT EXISTS idx_psa_submission_items_game_id
  ON public.psa_submission_items(game_id);

GRANT SELECT ON TABLE public.games TO anon;
GRANT SELECT ON TABLE public.games TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.games TO service_role;

NOTIFY pgrst, 'reload schema';
