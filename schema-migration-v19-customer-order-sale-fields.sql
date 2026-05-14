-- Migration v19: Order-level sale fields for bundled customer orders
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'not_sold',
  ADD COLUMN IF NOT EXISTS sold_date date,
  ADD COLUMN IF NOT EXISTS sold_price numeric;

ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_sale_channel_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_sale_channel_check
  CHECK (sale_channel IN ('not_sold', 'ebay', 'fb', 'instagram', 'in_person', 'traded'));
