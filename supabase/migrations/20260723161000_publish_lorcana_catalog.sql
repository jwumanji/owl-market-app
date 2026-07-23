-- Publish the validated Disney Lorcana catalog while retaining the independent
-- price-publication and image-asset safety gates.

begin;

do $$
declare
  lorcana_game_id uuid;
  lorcana_set_count integer;
  lorcana_card_count integer;
begin
  select id
  into lorcana_game_id
  from public.games
  where slug = 'lorcana';

  if lorcana_game_id is null then
    raise exception 'Cannot publish Lorcana: game row is missing';
  end if;

  select count(*)
  into lorcana_set_count
  from public.sets
  where game_id = lorcana_game_id;

  select count(*)
  into lorcana_card_count
  from public.cards
  where game_id = lorcana_game_id;

  if lorcana_set_count < 18 or lorcana_card_count < 3000 then
    raise exception
      'Cannot publish Lorcana: expected at least 18 sets and 3000 cards, found % sets and % cards',
      lorcana_set_count,
      lorcana_card_count;
  end if;
end
$$;

update public.games
set
  is_active = true,
  is_public = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'catalog_status', 'live',
    'publication_status', 'catalog_live',
    'pricing_status', 'staged_raw_only',
    'asset_status', 'awaiting_commercial_use_clearance',
    'asset_writes_enabled', false
  ),
  updated_at = now()
where slug = 'lorcana';

commit;
