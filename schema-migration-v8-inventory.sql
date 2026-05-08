-- Migration v8: Internal OWL inventory manager
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS inventory_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid REFERENCES cards(id) ON DELETE SET NULL,
  manual_card_name text,
  manual_card_number text,
  manual_set_code text,
  pending_card_match boolean NOT NULL DEFAULT false,
  inventory_type  text NOT NULL CHECK (inventory_type IN ('raw', 'damaged', 'graded', 'sealed')),
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'grading', 'sale', 'sold')),
  quantity        int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  graded_rating   text CHECK (
    graded_rating IS NULL OR graded_rating IN ('TAG 10', 'PSA 10', 'PSA 9', 'BGS 10', 'BGS 9.5')
  ),
  shipping_tracking text,
  shipped_at      timestamptz,
  sale_channel    text DEFAULT 'not_sold' CHECK (sale_channel IN ('not_sold', 'ebay', 'fb', 'instagram', 'in_person', 'traded')),
  sold_date       date,
  sold_price      numeric,
  acquired_at     date DEFAULT current_date,
  cost_basis      numeric DEFAULT 0,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_card_id ON inventory_items(card_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type_status ON inventory_items(inventory_type, status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS shipping_tracking text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sale_channel text DEFAULT 'not_sold';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sold_date date;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sold_price numeric;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manual_card_name text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manual_card_number text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manual_set_code text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pending_card_match boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_items ALTER COLUMN card_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_status_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  from_status       text,
  to_status         text NOT NULL,
  changed_at        timestamptz DEFAULT now(),
  note              text
);
