-- Persist every TCGplayer-backed sealed SKU returned by JustTCG while keeping
-- canonical set relationships optional. Products such as promo bundles can be
-- tracked even when they do not belong to a normal OP/EB/PRB set page.

alter table public.sealed_products
  add column if not exists provider text not null default 'justtcg',
  add column if not exists justtcg_id text,
  add column if not exists tcg_sku_id text,
  add column if not exists source_set_slug text,
  add column if not exists source_set_name text,
  add column if not exists product_url text,
  add column if not exists price_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists sealed_products_game_tcg_product_uidx
  on public.sealed_products (game_id, tcg_product_id);

create unique index if not exists sealed_products_game_justtcg_uidx
  on public.sealed_products (game_id, justtcg_id)
  where justtcg_id is not null;

create index if not exists sealed_products_set_active_type_idx
  on public.sealed_products (game_id, set_id, is_active, product_type);

create index if not exists sealed_products_market_price_idx
  on public.sealed_products (game_id, is_active, tcg_price desc nulls last);

create table if not exists public.sealed_product_price_history (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  sealed_product_id uuid not null references public.sealed_products(id) on delete cascade,
  source text not null default 'justtcg',
  price numeric not null,
  price_date date not null default (timezone('utc', now()))::date,
  recorded_at timestamptz not null default now(),
  constraint sealed_product_price_history_product_day_key
    unique (sealed_product_id, price_date)
);

create index if not exists sealed_product_price_history_game_date_idx
  on public.sealed_product_price_history (game_id, price_date desc);

comment on table public.sealed_product_price_history is
  'Daily TCGplayer market-price snapshots for sealed products.';

comment on column public.sealed_products.product_type is
  'Normalized sealed SKU type such as booster_box, booster_box_case, booster_pack, or starter_deck.';

comment on column public.sealed_products.metadata is
  'Provider-specific identifiers and variant details retained for auditability.';