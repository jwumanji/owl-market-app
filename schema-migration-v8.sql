-- schema-migration-v8.sql
-- Adds promo_segment column to cards for categorizing promo printings
-- (e.g. "Anniversary Set", "Tournament/Event Pack", "Championship Prize").
-- Safe to run multiple times.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS promo_segment text;

CREATE INDEX IF NOT EXISTS idx_cards_promo_segment ON cards(promo_segment)
  WHERE promo_segment IS NOT NULL;
