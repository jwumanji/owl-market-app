-- Restore the Riftbound public flag only after re-verifying the catalog and
-- exact-match pricing gates that approved the original public preview.

begin;

do $$
declare
  riftbound_game public.games%rowtype;
  riftbound_set_count integer;
  riftbound_card_count integer;
  riftbound_priced_card_count integer;
begin
  select *
  into riftbound_game
  from public.games
  where slug = 'riftbound'
  for update;

  if riftbound_game.id is null then
    raise exception 'Cannot publish Riftbound: game row is missing';
  end if;

  if riftbound_game.is_active is not true then
    raise exception 'Cannot publish Riftbound: game is not active';
  end if;

  if riftbound_game.metadata ->> 'launch_status' <> 'public_catalog_preview'
    or riftbound_game.metadata ->> 'public_launch_scope' <> 'catalog_and_tcgplayer_images'
    or riftbound_game.metadata ->> 'public_launch_gate' <> 'tcgplayer_images_only'
  then
    raise exception 'Cannot publish Riftbound: catalog publication metadata is not approved';
  end if;

  if riftbound_game.metadata ->> 'pricing_status' <> 'live'
    or riftbound_game.metadata ->> 'pricing_provider' <> 'justtcg'
    or riftbound_game.metadata ->> 'justtcg_ingestion_status' <> 'live_exact_matches'
  then
    raise exception 'Cannot publish Riftbound: exact-match pricing metadata is not approved';
  end if;

  select count(*) into riftbound_set_count
  from public.sets
  where game_id = riftbound_game.id;

  select count(*) into riftbound_card_count
  from public.cards
  where game_id = riftbound_game.id;

  select count(*) into riftbound_priced_card_count
  from public.price_stats
  where game_id = riftbound_game.id
    and coalesce(market_avg, tcg_market) is not null;

  if riftbound_set_count < 7
    or riftbound_card_count < 1000
    or riftbound_priced_card_count < 1000
  then
    raise exception
      'Cannot publish Riftbound: expected at least 7 sets, 1000 cards, and 1000 priced cards; found % sets, % cards, % priced cards',
      riftbound_set_count,
      riftbound_card_count,
      riftbound_priced_card_count;
  end if;

  update public.games
  set
    is_public = true,
    updated_at = now()
  where id = riftbound_game.id;
end
$$;

commit;
