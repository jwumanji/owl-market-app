-- Migration v11: Add Need Shipping flow and shipping label storage.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS shipping_label_url text;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_status_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_status_check
  CHECK (status IN ('new', 'grading', 'sale', 'ship', 'sold'));

CREATE INDEX IF NOT EXISTS idx_inventory_items_ship_queue
  ON inventory_items(status)
  WHERE status = 'ship';
