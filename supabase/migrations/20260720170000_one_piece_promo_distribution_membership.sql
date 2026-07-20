-- Promotional reprints retain the original printed card number, but their
-- distribution product is the One Piece Promotion Cards set (P). Keeping
-- them on the origin booster/starter set inflates physical-product indexes.
do $$
declare
  v_game_id uuid;
  v_promo_set_id uuid;
  v_updated integer;
begin
  select id
    into v_game_id
  from public.games
  where slug = 'one_piece'
  limit 1;

  if v_game_id is null then
    raise exception 'One Piece game (slug one_piece) is missing';
  end if;

  select id
    into v_promo_set_id
  from public.sets
  where game_id = v_game_id
    and upper(code) = 'P'
  limit 1;

  if v_promo_set_id is null then
    raise exception 'One Piece promotion set (code P) is missing';
  end if;

  update public.cards
  set set_id = v_promo_set_id
  where game_id = v_game_id
    and promo_segment is not null
    and set_id is distinct from v_promo_set_id;

  get diagnostics v_updated = row_count;
  raise notice 'Moved % One Piece promotional printings to distribution set P', v_updated;
end
$$;
