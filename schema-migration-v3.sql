-- ============================================================
-- Moon Market — Migration v3: Promo set support
-- Run in Supabase Studio → SQL Editor → New Query → Run
-- ============================================================

-- promo_source on cards is a text field; allowed values now include:
--   'booster', 'starter', 'promo', 'best_selection', 'anniversary',
--   'pre_release', 'film_red', 'one_piece_day'

-- Insert the catch-all promo set row
INSERT INTO sets (slug, code, name, series)
VALUES ('promo', 'P', 'One Piece Promotion Cards', 'PROMO')
ON CONFLICT (slug) DO NOTHING;
