-- OWL Market — Migration v49: Moon Terminal sealed module
--
-- Implements docs/moon-terminal-sealed-spec.md §2.2.
--
-- NUMBERING: the spec called this "v46". v46/v47/v48 were taken (character price
-- index, character links, nullable price changes) and all three are applied to
-- the live database. Head is v48; this is v49.
--
-- SHAPE: the spec described four greenfield CREATE TABLEs. Three of the four
-- already exist in some form, so this migration extends rather than creates:
--
--   sealed_products            EXISTS (schema.sql #6, 380 live rows, read by
--                              /markets, guarded by v40) -> ALTER, do not create.
--   sealed_weekly_prices       DROPPED from the plan. sealed_product_price_history
--                              already stores daily points, which is a strictly
--                              better grain than weekly. WEEKLY/MONTHLY dashboard
--                              views are rollup queries (last price in period),
--                              not a storage format.
--   set_weekly_values          DROPPED from the plan. market_index_snapshots
--                              already stores set-level rollups (entity_type='set',
--                              set_id, snapshot_date, index_value, card_count,
--                              chg_7d, chg_30d). Only `region` was missing.
--   pull_rates                 Genuinely new. The only CREATE TABLE here.
--
-- set_code is deliberately NOT added anywhere. sealed_products.set_id already
-- FKs to sets(id) and market_index_snapshots.set_id does the same; join for the
-- code rather than denormalizing a second copy of it.
--
-- Apply manually in the Supabase SQL editor (this repo has no migration runner).
-- Idempotent: safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. sealed_products — Terminal columns
-- ---------------------------------------------------------------------------
-- Existing columns kept as-is: id, set_id, name, product_type, tcg_price,
-- ebay_avg, market_avg, chg_1d/7d/30d, ath, atl, image_url, tcg_product_id,
-- game_id, provider, justtcg_id, tcg_sku_id, source_set_slug, source_set_name,
-- product_url, price_updated_at, last_synced_at, is_active, metadata, updated_at.

alter table public.sealed_products
  add column if not exists slug            text,
  add column if not exists region          text not null default 'en',
  add column if not exists display_name    text,
  add column if not exists packs_per_unit  int,
  add column if not exists cards_per_pack  int,
  add column if not exists msrp_usd        numeric(10,2),
  add column if not exists release_date    date,
  add column if not exists external_source text not null default 'justtcg',
  add column if not exists external_ref    text,
  add column if not exists is_tracked      boolean not null default false;

comment on column public.sealed_products.slug is
  'Terminal URL segment, unique per game. Null for legacy rows until backfilled.';
comment on column public.sealed_products.display_name is
  'Curated short label for Terminal. Falls back to name when null; name stays the provider-derived string.';
comment on column public.sealed_products.external_source is
  'Pricing provider for this product: justtcg | ebay | ... Source-agnostic so a provider swap needs no migration.';
comment on column public.sealed_products.external_ref is
  'Provider variant/product id. Supersedes justtcg_id, which is retained for the existing sync.';
comment on column public.sealed_products.is_tracked is
  'Included in Terminal dashboards and sealed_rank. Defaults false so the 380 legacy rows opt in explicitly.';

-- region follows the v45 convention: lowercase, 'en' | 'jp'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sealed_products'::regclass
      and conname = 'sealed_products_region_lowercase'
  ) then
    alter table public.sealed_products
      add constraint sealed_products_region_lowercase
      check (region = lower(region));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sealed_products'::regclass
      and conname = 'sealed_products_external_source_lowercase'
  ) then
    alter table public.sealed_products
      add constraint sealed_products_external_source_lowercase
      check (external_source = lower(external_source));
  end if;
end
$$;

-- Backfill external_ref from the justtcg_id every live row already carries.
update public.sealed_products
set external_ref = justtcg_id
where external_ref is null
  and justtcg_id is not null;

-- Unique slug per game, but only once a slug is assigned (legacy rows are null).
create unique index if not exists uq_sealed_products_game_slug
  on public.sealed_products (game_id, slug)
  where slug is not null;

-- Dashboard read path: game + region + set, and the tracked-product ranking.
create index if not exists idx_sealed_products_game_region_set
  on public.sealed_products (game_id, region, set_id);

create index if not exists idx_sealed_products_tracked
  on public.sealed_products (game_id, product_type, region)
  where is_tracked;

-- ---------------------------------------------------------------------------
-- 2. sealed_product_price_history — Terminal columns
-- ---------------------------------------------------------------------------

alter table public.sealed_product_price_history
  add column if not exists low_price         numeric(10,2),
  add column if not exists source_updated_at timestamptz,
  add column if not exists sellers           int;

comment on column public.sealed_product_price_history.sellers is
  'Listing count. JustTCG does NOT return this (confirmed by probe) - stays null on justtcg rows. '
  'Reserved for a possible eBay-sourced future; spec 3.3 tightening/loosening signal depends on it.';
comment on column public.sealed_product_price_history.source_updated_at is
  'Provider-reported price timestamp, distinct from recorded_at (when we wrote the row).';

-- Idempotent daily snapshots: re-running a day overwrites rather than duplicates.
-- Verified against live data - 356 rows, 356 distinct (product, source, date), 0 dupes.
create unique index if not exists uq_sealed_price_history_product_source_day
  on public.sealed_product_price_history (sealed_product_id, source, price_date);

create index if not exists idx_sealed_price_history_game_date
  on public.sealed_product_price_history (game_id, price_date desc);

-- ---------------------------------------------------------------------------
-- 3. market_index_snapshots — region
-- ---------------------------------------------------------------------------
-- This table is the set-value rollup the spec called set_weekly_values. It also
-- carries entity_type='character' and 'rarity' rows. It predates this migration
-- and is not defined by any file in this repo.

alter table public.market_index_snapshots
  add column if not exists region text not null default 'en';

comment on column public.market_index_snapshots.region is
  'v45 region convention. All pre-v49 rows are English.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_index_snapshots'::regclass
      and conname = 'market_index_snapshots_region_lowercase'
  ) then
    alter table public.market_index_snapshots
      add constraint market_index_snapshots_region_lowercase
      check (region = lower(region));
  end if;
end
$$;

create index if not exists idx_market_index_snapshots_set_region_date
  on public.market_index_snapshots (game_id, entity_type, set_id, region, snapshot_date desc);

-- NOTE: this migration deliberately does NOT touch the table's existing natural
-- key, confirmed as market_index_snapshots_entity_day_key on
-- (game_id, entity_type, entity_key, snapshot_date) -- no region.
--
-- `region` is therefore INERT until JP rollups land. capture_market_index_snapshots
-- hardcodes cards.region = 'en', so existing rows are genuinely English and will
-- keep being written that way. JP needs BOTH changes together: drop the hardcode
-- AND widen the key. Either alone is worse than neither -- widening without
-- changing the function adds a column that is always 'en'; changing the function
-- without widening lets JP rows collide with EN on the same
-- (entity_key, snapshot_date) and silently overwrite them.

-- ---------------------------------------------------------------------------
-- 4. pull_rates — new
-- ---------------------------------------------------------------------------
-- Keyed on set_id, not a text set_code. rarity_id FKs to game_rarities so slot
-- codes stay in one vocabulary; it is nullable for the synthetic BULK slot,
-- which has no rarity code (spec 3.5 - render a plain label, never pass 'BULK'
-- to RarityBadge).

-- v40's composite-FK convention needs a (id, game_id) unique on the parent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_rarities'::regclass
      and conname = 'game_rarities_id_game_id_key'
  ) then
    alter table public.game_rarities
      add constraint game_rarities_id_game_id_key unique (id, game_id);
  end if;
end
$$;

create table if not exists public.pull_rates (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete restrict,
  set_id      uuid not null references public.sets(id) on delete cascade,
  region      text not null default 'en',
  rarity_id   uuid references public.game_rarities(id) on delete restrict,
  slot_label  text not null,                       -- 'MR', 'GMR', ... or 'R / UC / C bulk'
  per_pack    numeric(6,3),
  per_box     numeric(6,3) not null,
  per_case    numeric(6,3),
  source_note text,
  confidence  text not null default 'medium',      -- 'high' | 'medium' | 'low'
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pull_rates_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint pull_rates_region_lowercase check (region = lower(region)),
  constraint pull_rates_per_box_nonneg   check (per_box >= 0)
);

comment on table public.pull_rates is
  'Hand-curated community pull rates driving Box EV (spec 3.5). Not a guarantee of any individual box.';
comment on column public.pull_rates.rarity_id is
  'Null only for the synthetic BULK slot, which aggregates R/UC/C and has no rarity code.';
comment on column public.pull_rates.slot_label is
  'Display label for the slot. Matches game_rarities.code for real rarities.';

create unique index if not exists uq_pull_rates_set_slot
  on public.pull_rates (game_id, set_id, region, slot_label);

create index if not exists idx_pull_rates_game_set
  on public.pull_rates (game_id, set_id, region);

-- v40 game-boundary convention: composite FKs so a row cannot point at another
-- game's set or rarity. NOT VALID then VALIDATE, matching v40 exactly.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pull_rates'::regclass
      and conname = 'pull_rates_set_game_fk'
  ) then
    alter table public.pull_rates
      add constraint pull_rates_set_game_fk
      foreign key (set_id, game_id)
      references public.sets(id, game_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pull_rates'::regclass
      and conname = 'pull_rates_rarity_game_fk'
  ) then
    alter table public.pull_rates
      add constraint pull_rates_rarity_game_fk
      foreign key (rarity_id, game_id)
      references public.game_rarities(id, game_id)
      not valid;
  end if;
end
$$;

alter table public.pull_rates validate constraint pull_rates_set_game_fk;
alter table public.pull_rates validate constraint pull_rates_rarity_game_fk;

-- ---------------------------------------------------------------------------
-- 5. RLS — public read, no public write (matches v47's convention)
-- ---------------------------------------------------------------------------

alter table public.pull_rates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pull_rates'
      and policyname = 'Public pull rates are readable'
  ) then
    create policy "Public pull rates are readable"
      on public.pull_rates for select
      using (true);
  end if;
end
$$;

grant select on public.pull_rates to anon, authenticated;
grant all    on public.pull_rates to service_role;

commit;

-- ---------------------------------------------------------------------------
-- 6. Verification — read-only, prints to the editor's Messages pane
-- ---------------------------------------------------------------------------

do $$
declare
  missing text[] := '{}';
  c       record;
begin
  -- every column this migration promised
  if to_regclass('public.pull_rates') is null then
    missing := missing || 'table pull_rates'::text;
  end if;

  for c in
    select unnest(array[
      'sealed_products.slug', 'sealed_products.region', 'sealed_products.display_name',
      'sealed_products.packs_per_unit', 'sealed_products.cards_per_pack',
      'sealed_products.msrp_usd', 'sealed_products.release_date',
      'sealed_products.external_source', 'sealed_products.external_ref',
      'sealed_products.is_tracked',
      'sealed_product_price_history.low_price',
      'sealed_product_price_history.source_updated_at',
      'sealed_product_price_history.sellers',
      'market_index_snapshots.region'
    ]) as ref
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name  = split_part(c.ref, '.', 1)
        and column_name = split_part(c.ref, '.', 2)
    ) then
      missing := missing || c.ref;
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'v49 incomplete, missing: %', array_to_string(missing, ', ');
  end if;

  raise notice 'v49 OK - all columns and pull_rates present.';
  raise notice 'sealed_products rows: %, external_ref backfilled: %',
    (select count(*) from public.sealed_products),
    (select count(*) from public.sealed_products where external_ref is not null);
end
$$;

-- The market_index_snapshots natural key, for the JP decision noted in part 3.
do $$
declare
  r record;
begin
  raise notice '--- market_index_snapshots unique constraints/indexes ---';
  for r in
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'market_index_snapshots'
      and indexdef ilike '%unique%'
  loop
    raise notice '%: %', r.indexname, r.indexdef;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Optional data step — run separately, after reviewing the list
-- ---------------------------------------------------------------------------
-- Opts 44 of the 46 booster boxes and cases into Terminal. Everything else
-- (packs, binders, promo packs, starter decks) stays untracked. Reversible.
--
--   update public.sealed_products
--   set is_tracked = true
--   where product_type in ('booster_box', 'booster_box_case')
--     and set_id is not null            -- REQUIRED, see below
--     and is_active;
--
-- `set_id is not null` is a correctness filter, not tidiness. Value Ratio joins
-- market_index_snapshots on set_id; a product with none can never carry a ratio,
-- so tracking it would plant a permanent null in the dashboard grid that no
-- amount of ingestion ever fills.
--
-- The 2 excluded rows are the "The World's Strongest Warriors" booster box and
-- case. Their set does not exist in `sets` at all -- the JustTCG sealed catalog
-- is ahead of the set catalog (same root cause as the 86-vs-23 box discrepancy).
-- Fix by adding the set and assigning set_id, then re-run this statement. Do not
-- work around it with a join fallback.
