-- v44: Market sort + catalog search indexes (perf Phase 3, M6)
-- Safe to run after v43. Complements v41's market_avg/tcg_market indexes:
--   1. Partial indexes on the price_stats chg_* columns powering the markets
--      gainers / losers / trending queries (order by chg_1d, filtered not-null).
--   2. pg_trgm GIN indexes so catalog ILIKE '%term%' search on cards.name and
--      cards.card_number stops seq-scanning the full table per keystroke.
--   3. (game_id, printed_set_code) on cards for the scoped set-detail loader.

do $$
begin
  if to_regclass('public.cards') is null then
    raise exception 'public.cards is required before running v44 indexes';
  end if;
  if to_regclass('public.price_stats') is null then
    raise exception 'public.price_stats is required before running v44 indexes';
  end if;
end;
$$;

-- 1. Markets dashboard sorts (trending / gainers / losers)
create index if not exists idx_price_stats_game_chg_1d_desc
  on public.price_stats (game_id, chg_1d desc)
  where chg_1d is not null;

create index if not exists idx_price_stats_game_chg_7d_desc
  on public.price_stats (game_id, chg_7d desc)
  where chg_7d is not null;

create index if not exists idx_price_stats_game_chg_30d_desc
  on public.price_stats (game_id, chg_30d desc)
  where chg_30d is not null;

-- 2. Catalog text search (ILIKE '%term%')
create extension if not exists pg_trgm;

create index if not exists idx_cards_name_trgm
  on public.cards using gin (name gin_trgm_ops);

create index if not exists idx_cards_card_number_trgm
  on public.cards using gin (card_number gin_trgm_ops);

-- 3. Scoped set-detail card fetch (loadSetDetail groups by printed set code)
create index if not exists idx_cards_game_printed_set_code
  on public.cards (game_id, printed_set_code);
