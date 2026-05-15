-- Migration v22: Inventory bundles for grouped cards sold together
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS inventory_bundles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  notes        text,
  status       text NOT NULL DEFAULT 'new',
  sale_channel text NOT NULL DEFAULT 'not_sold',
  sold_date    date,
  sold_price   numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_bundles_status_check
    CHECK (status IN ('new', 'grading', 'sale', 'ship', 'sold')),
  CONSTRAINT inventory_bundles_sale_channel_check
    CHECK (sale_channel IN ('not_sold', 'ebay', 'fb', 'instagram', 'in_person', 'traded'))
);

CREATE TABLE IF NOT EXISTS inventory_bundle_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id         uuid NOT NULL REFERENCES inventory_bundles(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, inventory_item_id),
  UNIQUE (inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_created_at
  ON inventory_bundles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_status
  ON inventory_bundles(status);

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_name
  ON inventory_bundles USING gin (to_tsvector('simple', coalesce(name, '')));

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_bundle_id
  ON inventory_bundle_items(bundle_id);

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_inventory_item_id
  ON inventory_bundle_items(inventory_item_id);

ALTER TABLE inventory_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_bundle_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_bundles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_bundle_items TO service_role;

DROP POLICY IF EXISTS "service_role can manage inventory_bundles" ON inventory_bundles;
CREATE POLICY "service_role can manage inventory_bundles"
ON inventory_bundles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role can manage inventory_bundle_items" ON inventory_bundle_items;
CREATE POLICY "service_role can manage inventory_bundle_items"
ON inventory_bundle_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
