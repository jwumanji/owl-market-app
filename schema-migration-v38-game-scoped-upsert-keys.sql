-- OWL Phase: game-scoped upsert conflict keys.
--
-- v31 added partial scoped unique indexes for read/query correctness. Supabase
-- REST upserts need a direct non-partial unique key for `on_conflict`, so this
-- migration adds additive upsert-compatible indexes before the legacy global
-- `sets.slug`, `cards.card_image_id`, and `price_stats.card_id` uniqueness
-- assumptions are removed.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.sets'::regclass
      and attname = 'game_id'
      and not attisdropped
  ) then
    raise exception 'sets.game_id is required before running game-scoped upsert keys';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.cards'::regclass
      and attname = 'game_id'
      and not attisdropped
  ) then
    raise exception 'cards.game_id is required before running game-scoped upsert keys';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.price_stats'::regclass
      and attname = 'game_id'
      and not attisdropped
  ) then
    raise exception 'price_stats.game_id is required before running game-scoped upsert keys';
  end if;

  if exists (
    select 1
    from public.sets
    where game_id is not null
      and slug is not null
    group by game_id, slug
    having count(*) > 1
  ) then
    raise exception 'Duplicate sets(game_id, slug) rows must be resolved before adding upsert keys';
  end if;

  if exists (
    select 1
    from public.cards
    where game_id is not null
      and card_image_id is not null
    group by game_id, card_image_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate cards(game_id, card_image_id) rows must be resolved before adding upsert keys';
  end if;

  if exists (
    select 1
    from public.price_stats
    where game_id is not null
      and card_id is not null
    group by game_id, card_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate price_stats(game_id, card_id) rows must be resolved before adding upsert keys';
  end if;
end $$;

create unique index if not exists sets_game_id_slug_upsert_uidx
  on public.sets (game_id, slug);

create unique index if not exists cards_game_id_card_image_id_upsert_uidx
  on public.cards (game_id, card_image_id);

create unique index if not exists price_stats_game_id_card_id_upsert_uidx
  on public.price_stats (game_id, card_id);

comment on index public.sets_game_id_slug_upsert_uidx is
  'Game-scoped set route key used by Supabase REST upserts.';

comment on index public.cards_game_id_card_image_id_upsert_uidx is
  'Game-scoped card identity key used by Supabase REST upserts.';

comment on index public.price_stats_game_id_card_id_upsert_uidx is
  'Game-scoped current price key used by Supabase REST upserts.';

notify pgrst, 'reload schema';

commit;
