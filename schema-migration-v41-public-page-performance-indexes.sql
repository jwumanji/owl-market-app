-- v41: Public page performance indexes
-- Safe to run after the game-scope migrations. These indexes support the
-- public market/catalog/rarity/character pages without changing behavior.

create index if not exists idx_cards_game_id_id
  on public.cards (game_id, id);

create index if not exists idx_cards_game_character_id
  on public.cards (game_id, character_id)
  where character_id is not null;

create index if not exists idx_cards_game_rarity_set
  on public.cards (game_id, rarity, set_id);

create index if not exists idx_cards_game_rarity_id
  on public.cards (game_id, rarity_id)
  where rarity_id is not null;

create index if not exists idx_cards_game_set_card_number
  on public.cards (game_id, set_id, card_number);

create index if not exists idx_price_stats_game_market_avg_desc
  on public.price_stats (game_id, market_avg desc)
  where market_avg is not null;

create index if not exists idx_price_stats_game_tcg_market_desc
  on public.price_stats (game_id, tcg_market desc)
  where tcg_market is not null;
