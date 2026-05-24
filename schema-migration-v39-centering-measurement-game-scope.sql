-- OWL Phase: game-scope Owl Lens centering measurements.
--
-- Inventory-linked measurements inherit game_id from inventory_items.
-- Standalone pre-grade measurements are backfilled to One Piece so existing
-- history remains visible after the app starts filtering by game.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.centering_measurements'::regclass
      and attname = 'game_id'
      and not attisdropped
  ) then
    alter table public.centering_measurements
      add column game_id uuid references public.games(id) on delete restrict;
  end if;
end $$;

update public.centering_measurements cm
set game_id = ii.game_id
from public.inventory_items ii
where cm.inventory_item_id = ii.id
  and cm.game_id is null
  and ii.game_id is not null;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
)
update public.centering_measurements cm
set game_id = one_piece.id
from one_piece
where cm.game_id is null;

do $$
begin
  if exists (
    select 1
    from public.centering_measurements
    where game_id is null
  ) then
    raise exception 'centering_measurements.game_id backfill failed';
  end if;
end $$;

alter table public.centering_measurements
  alter column game_id set not null;

create index if not exists idx_cm_game_item_created
  on public.centering_measurements (game_id, inventory_item_id, created_at desc);

create index if not exists idx_cm_game_standalone_created
  on public.centering_measurements (game_id, created_at desc)
  where inventory_item_id is null;

drop view if exists public.inventory_centering_latest;

create view public.inventory_centering_latest
with (security_invoker = true) as
select distinct on (inventory_item_id)
  id,
  game_id,
  inventory_item_id,
  created_at,
  request_id,
  left_pct,
  right_pct,
  top_pct,
  bottom_pct,
  worst_axis,
  worst_axis_max_pct,
  psa_ceiling,
  pipeline_mode,
  pipeline_version,
  processing_ms,
  image_content_type,
  image_width_px,
  image_height_px,
  overlay,
  manual_adjustment
from public.centering_measurements
where inventory_item_id is not null
order by inventory_item_id, created_at desc, id desc;

grant select on table public.inventory_centering_latest to service_role;

notify pgrst, 'reload schema';

commit;
