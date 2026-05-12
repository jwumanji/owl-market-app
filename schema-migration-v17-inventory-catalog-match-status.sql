-- Migration v17: Durable inventory catalog match status
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS catalog_match_status text NOT NULL DEFAULT 'matched';

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_catalog_match_status_check;

ALTER TABLE inventory_items
  ALTER COLUMN catalog_match_status SET DEFAULT 'matched';

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_catalog_match_status_check
  CHECK (catalog_match_status IN ('matched', 'needs_match', 'custom_verified'));

UPDATE inventory_items
SET catalog_match_status = CASE
  WHEN card_id IS NOT NULL THEN 'matched'
  WHEN pending_card_match THEN 'needs_match'
  ELSE 'custom_verified'
END
WHERE catalog_match_status IS NULL OR catalog_match_status = 'matched';

UPDATE inventory_items
SET pending_card_match = (catalog_match_status = 'needs_match');

ALTER TABLE inventory_items
  ALTER COLUMN catalog_match_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_catalog_match_status
  ON inventory_items(catalog_match_status);
