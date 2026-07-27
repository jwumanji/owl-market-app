begin;

do $$
declare
  treasure_rarity_count integer;
begin
  select count(*)
  into treasure_rarity_count
  from public.game_rarities
  join public.games on games.id = game_rarities.game_id
  where games.slug = 'one_piece'
    and upper(game_rarities.code) = 'TR';

  if treasure_rarity_count <> 1 then
    raise exception 'Expected exactly one One Piece TR taxonomy row, found %', treasure_rarity_count;
  end if;
end
$$;

create or replace function public.sync_one_piece_tr_rarity_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  one_piece_id uuid;
  treasure_rarity_id uuid;
begin
  if upper(coalesce(new.rarity, '')) <> 'TR' then
    return new;
  end if;

  select id into one_piece_id
  from public.games
  where slug = 'one_piece'
  limit 1;

  if new.game_id <> one_piece_id then
    return new;
  end if;

  select id into treasure_rarity_id
  from public.game_rarities
  where game_id = new.game_id
    and upper(code) = 'TR'
  limit 1;

  if treasure_rarity_id is null then
    raise exception 'One Piece TR taxonomy row is missing';
  end if;

  new.rarity := 'TR';
  new.rarity_id := treasure_rarity_id;
  return new;
end;
$$;

drop trigger if exists cards_sync_one_piece_tr_rarity_reference on public.cards;
create trigger cards_sync_one_piece_tr_rarity_reference
before insert or update of rarity, rarity_id, game_id on public.cards
for each row
execute function public.sync_one_piece_tr_rarity_reference();

-- Reconcile existing English TR rows, including the two repaired legacy rows.
update public.cards
set
  rarity = 'TR',
  rarity_id = (
    select game_rarities.id
    from public.game_rarities
    where game_rarities.game_id = cards.game_id
      and upper(game_rarities.code) = 'TR'
    limit 1
  ),
  name = case
    when card_image_id = 'OP07-109_p2' then replace(name, '(SP)', '(TR)')
    else name
  end
where game_id = (select id from public.games where slug = 'one_piece')
  and region = 'en'
  and upper(coalesce(rarity, '')) = 'TR';

select public.refresh_public_game_summaries(
  (select id from public.games where slug = 'one_piece')
);

commit;
