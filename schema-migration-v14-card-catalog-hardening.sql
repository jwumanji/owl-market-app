-- Migration v14: Card catalog schema hardening and duplicate empty set cleanup.
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run
-- after reviewing the duplicate set IDs against the current audit report.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS promo_segment text;

CREATE INDEX IF NOT EXISTS idx_cards_promo_segment
  ON cards(promo_segment)
  WHERE promo_segment IS NOT NULL;

-- These duplicate set rows had zero card rows in the 2026-05-11 audit.
-- The populated canonical rows are left intact.
DELETE FROM sets
WHERE id IN (
  '040ef68e-380b-4f51-9c86-c8b7607d89f7', -- OP07 duplicate, 0 cards
  'c3d45165-db5c-4c1d-b19b-96689a137c64', -- OP08 duplicate, 0 cards
  'c5a08db0-4a0e-4b38-a287-94ecfc0d39d3'  -- PRB01 duplicate, 0 cards
)
AND NOT EXISTS (
  SELECT 1
  FROM cards
  WHERE cards.set_id = sets.id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_code_unique_upper
  ON sets ((upper(code)))
  WHERE code IS NOT NULL;
