-- Migration v18: Customer orders for bundled inventory shipping
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS customer_orders (
  id              text PRIMARY KEY,
  nickname        text,
  customer_name   text NOT NULL,
  shipping_label  text,
  marked_shipped  boolean NOT NULL DEFAULT false,
  tracking_number text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          text NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, inventory_item_id),
  UNIQUE (inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_created_at
  ON customer_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_name
  ON customer_orders USING gin (to_tsvector('simple', coalesce(customer_name, '')));

CREATE INDEX IF NOT EXISTS idx_customer_order_items_order_id
  ON customer_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_inventory_item_id
  ON customer_order_items(inventory_item_id);

ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_order_items TO service_role;

DROP POLICY IF EXISTS "service_role can manage customer_orders" ON customer_orders;
CREATE POLICY "service_role can manage customer_orders"
ON customer_orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role can manage customer_order_items" ON customer_order_items;
CREATE POLICY "service_role can manage customer_order_items"
ON customer_order_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
