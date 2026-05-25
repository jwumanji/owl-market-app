-- OWL-22 / Phase 4: game-scoped catalog uniqueness.
--
-- This migration is intentionally additive. It adds scoped unique indexes that
-- allow the app to become game-aware while preserving existing global
-- uniqueness until the final enforcement phase.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sets'
      and column_name = 'game_id'
  ) then
    raise exception 'sets.game_id is required before running OWL-22 scoped constraints';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cards'
      and column_name = 'game_id'
  ) then
    raise exception 'cards.game_id is required before running OWL-22 scoped constraints';
  end if;
end $$;

create unique index if not exists sets_game_id_slug_uidx
  on public.sets (game_id, slug)
  where game_id is not null
    and slug is not null;

create unique index if not exists sets_game_id_upper_code_uidx
  on public.sets (game_id, upper(code))
  where game_id is not null
    and code is not null;

create unique index if not exists cards_game_id_card_image_id_uidx
  on public.cards (game_id, card_image_id)
  where game_id is not null
    and card_image_id is not null;

comment on index public.sets_game_id_slug_uidx is
  'OWL-22: permits duplicate set slugs across games while preserving per-game uniqueness.';
comment on index public.sets_game_id_upper_code_uidx is
  'OWL-22: permits duplicate set codes across games while preserving per-game case-insensitive uniqueness.';
comment on index public.cards_game_id_card_image_id_uidx is
  'OWL-22: permits duplicate card_image_id values across games while preserving per-game uniqueness.';

commit;
