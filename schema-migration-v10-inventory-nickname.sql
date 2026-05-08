-- Migration v10: Optional per-item inventory nickname
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

alter table inventory_items
  add column if not exists item_nickname text;

create index if not exists idx_inventory_items_item_nickname
  on inventory_items using gin (to_tsvector('simple', coalesce(item_nickname, '')));
