-- Migration v22: Declare FK relationship from inventory_centering_latest
-- view to inventory_items, so PostgREST can do !inner joins.
-- Run in Supabase Studio -> SQL Editor.

COMMENT ON VIEW public.inventory_centering_latest IS
  E'@foreignKey (inventory_item_id) references inventory_items(id)';

NOTIFY pgrst, 'reload schema';
