-- Support deterministic keyset pagination for the JustTCG catalog preload.

begin;

create index if not exists idx_cards_game_region_id
  on public.cards(game_id, region, id);

analyze public.cards;

commit;
