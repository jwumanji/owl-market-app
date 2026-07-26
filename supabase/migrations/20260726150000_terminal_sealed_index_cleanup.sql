-- OWL Market — follow-up to 20260726143000: remove redundant sealed
-- price-history indexes
--
-- ############################################################################
-- ## NEVER APPLIED. This file has NO tracking row and must not get one --    ##
-- ## `supabase db push` should pick it up and record it normally. Inserting  ##
-- ## a row for it by hand would permanently skip it.                         ##
-- ############################################################################
--
-- WHY
--
-- 20260726143000_terminal_sealed.sql (originally schema-migration-v49) was
-- written from live-database introspection without knowing which migration
-- created sealed_product_price_history. That table comes from
-- supabase/migrations/20260714153000_sealed_product_tracking.sql, which is not
-- on main -- so two of v49's additions duplicate work already there.
--
-- 1. uq_sealed_price_history_product_source_day (sealed_product_id, source, price_date)
--
--    Redundant AND misleading. The table already carries
--        constraint sealed_product_price_history_product_day_key
--          unique (sealed_product_id, price_date)
--    which has no `source` column and is therefore STRICTER: one row per
--    product per day, whatever the source. v49's index is fully implied by it
--    and prevents nothing extra.
--
--    The misleading part matters more than the redundancy. v49's index implies
--    that one row per source per day is supported. It is not -- the existing
--    constraint forbids a second source on the same day. That directly
--    undercuts the external_source/external_ref rationale: if eBay sealed
--    pricing is ever ingested alongside JustTCG, the EXISTING constraint blocks
--    it, and v49's index would have suggested otherwise.
--
--    Dropping v49's index does not decide that question -- see the note at the
--    bottom. It just stops the schema from asserting something untrue.
--
-- 2. idx_sealed_price_history_game_date (game_id, price_date desc)
--
--    Exact duplicate of sealed_product_price_history_game_date_idx, same
--    columns, same order. Pure write overhead on every snapshot insert.
--
-- Both are safe to drop: neither is referenced by a constraint, and the
-- index each duplicates remains in place.
--
-- Idempotent. Read-only apart from the two drops and the diagnostic notices.

begin;

drop index if exists public.uq_sealed_price_history_product_source_day;
drop index if exists public.idx_sealed_price_history_game_date;

commit;

-- ---------------------------------------------------------------------------
-- Verification + the game_rarities twin check
-- ---------------------------------------------------------------------------
-- v49 added game_rarities_id_game_id_key guarded by `if not exists` on that
-- exact NAME. But 20260723120000_market_index_snapshots.sql already declares
--     foreign key (rarity_id, game_id) references public.game_rarities(id, game_id)
-- which REQUIRES a unique on (id, game_id) to have existed beforehand. If that
-- pre-existing constraint carries a different name, v49's guard did not see it
-- and created a second, functionally identical unique constraint -- meaning two
-- identical unique indexes on game_rarities.
--
-- This block only REPORTS. Dropping the wrong one of a pair is worse than
-- leaving both, so the decision stays manual.

do $$
declare
  r record;
  n int := 0;
begin
  raise notice '--- indexes on sealed_product_price_history (expect the two v49 ones gone) ---';
  for r in
    select indexname, indexdef from pg_indexes
    where schemaname = 'public' and tablename = 'sealed_product_price_history'
    order by indexname
  loop
    raise notice '  %: %', r.indexname, r.indexdef;
  end loop;

  raise notice '--- unique constraints/indexes on game_rarities covering (id, game_id) ---';
  for r in
    select indexname, indexdef from pg_indexes
    where schemaname = 'public'
      and tablename = 'game_rarities'
      and indexdef ilike '%unique%'
    order by indexname
  loop
    n := n + 1;
    raise notice '  %: %', r.indexname, r.indexdef;
  end loop;

  if n > 1 then
    raise notice 'NOTE: % unique indexes on game_rarities. If two cover exactly '
                 '(id, game_id), one is a v49 twin -- drop the one NOT referenced '
                 'by market_index_snapshots'' FK.', n;
  end if;
end
$$;

-- Confirm the surviving constraint is the strict one, and that nothing depends
-- on the dropped pair.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sealed_product_price_history'::regclass
      and conname = 'sealed_product_price_history_product_day_key'
  ) then
    raise exception 'expected sealed_product_price_history_product_day_key to survive; it is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'sealed_product_price_history'
      and indexname = 'sealed_product_price_history_game_date_idx'
  ) then
    raise exception 'expected sealed_product_price_history_game_date_idx to survive; it is missing';
  end if;

  raise notice 'v50 OK - redundant indexes dropped, originals intact.';
end
$$;

-- ---------------------------------------------------------------------------
-- OPEN, NOT DECIDED HERE: multi-source sealed pricing
-- ---------------------------------------------------------------------------
-- sealed_product_price_history currently allows ONE row per product per day,
-- regardless of source. If eBay completed sales are ever ingested as a second
-- sealed price source, that constraint must widen:
--
--   alter table public.sealed_product_price_history
--     drop constraint sealed_product_price_history_product_day_key;
--   alter table public.sealed_product_price_history
--     add constraint sealed_product_price_history_product_source_day_key
--     unique (sealed_product_id, source, price_date);
--
-- Deliberately NOT done now. Widening a unique constraint on a table with a
-- live daily writer is a behaviour change, not a cleanup, and nothing consumes
-- a second source yet. Do it in the same change that adds the eBay ingestion,
-- so the constraint and the writer move together.
