-- Migration v23: Allow standalone pre-grade measurements (no inventory link).
-- Pre-grade tool inside /admin/lens persists measurements without an
-- inventory_item_id; the original /admin/inventory/[id]/centering flow
-- still attaches measurements to inventory items.
ALTER TABLE public.centering_measurements
  ALTER COLUMN inventory_item_id DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
