-- Migration v12: Store customer names for the Need Shipping queue.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS idx_inventory_items_customer_name
  ON inventory_items USING gin (to_tsvector('simple', coalesce(customer_name, '')));
