-- Migration v13: Track where each inventory item was purchased.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS purchased_from text;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_purchased_from_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_purchased_from_check
  CHECK (
    purchased_from IS NULL OR
    purchased_from IN ('facebook', 'ebay', 'instagram', 'direct_person', 'event')
  );

CREATE INDEX IF NOT EXISTS idx_inventory_items_purchased_from
  ON inventory_items(purchased_from)
  WHERE purchased_from IS NOT NULL;
