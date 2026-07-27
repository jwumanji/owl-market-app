create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$$;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table public.game_rarities (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  code text not null,
  name text not null
);

create table public.game_variants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  code text not null,
  name text not null
);

create table public.game_set_types (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  code text not null,
  name text not null
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  name text not null
);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  slug text,
  code text,
  name text,
  release_date date,
  set_type_id uuid references public.game_set_types(id),
  unique (id, game_id)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  set_id uuid references public.sets(id),
  rarity_id uuid references public.game_rarities(id),
  variant_id uuid references public.game_variants(id),
  character_id uuid references public.characters(id),
  card_image_id text,
  card_number text,
  name text,
  rarity text,
  variant_label text,
  image_url text,
  region text not null default 'en',
  game_payload jsonb not null default '{}'::jsonb,
  unique (id, game_id)
);

-- Representative legacy summary refresher used by the later One Piece
-- integrity migration. Its definition intentionally preserves the historical
-- unscoped predicate that migration tightens to English One Piece cards.
create or replace function public.refresh_public_game_summaries(target_game_id uuid)
returns void
language plpgsql
as $$
declare
  game_row public.games%rowtype;
  card_count bigint;
begin
  select *
  into game_row
  from public.games
  where id = target_game_id;

  select count(*)
  into card_count
  from public.cards as cards
  where cards.game_id = game_row.id;
end
$$;

create table public.card_character_links (
  game_id uuid not null references public.games(id),
  card_id uuid not null references public.cards(id),
  character_id uuid not null references public.characters(id),
  primary key (game_id, card_id, character_id)
);
alter table public.card_character_links enable row level security;
create policy "Public card character links are readable"
  on public.card_character_links for select using (true);
grant select on public.card_character_links to anon;

create table public.jp_prices (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  card_id uuid references public.cards(id),
  snapshot_date date not null
);

create table public.public_rarity_summaries (
  game_id uuid not null references public.games(id),
  rarity_id uuid references public.game_rarities(id)
);

create table public.public_character_summaries (
  game_id uuid not null references public.games(id),
  character_id uuid not null references public.characters(id)
);

create table public.card_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  card_id uuid not null references public.cards(id),
  provider text not null,
  external_id text not null,
  external_type text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table public.set_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  set_id uuid not null references public.sets(id),
  provider text not null,
  external_id text not null,
  external_type text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table public.price_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  provider text not null
);

create table public.sync_state (
  key text primary key,
  state jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  lock_owner text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  card_id uuid references public.cards(id),
  unique (id, game_id)
);

create table public.psa_submission_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  inventory_item_id uuid references public.inventory_items(id)
);

create table public.centering_measurements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  inventory_item_id uuid references public.inventory_items(id),
  card_identity text,
  created_at timestamptz not null default now()
);

create table public.tcg_source_records (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  provider text not null,
  record_type text not null,
  external_id text not null,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb
);

create table public.ebay_sales (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  card_id uuid references public.cards(id),
  ebay_item_id text not null unique,
  sale_price numeric,
  currency text,
  grader text,
  grade numeric,
  sale_type text,
  condition text,
  title text,
  sold_at timestamptz
);

create table public.sealed_products (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  set_id uuid references public.sets(id),
  tcg_product_id text,
  product_type text not null default 'booster_box',
  tcg_price numeric
);

with game_row as (
  insert into public.games (slug, name, is_public)
  values ('one_piece', 'One Piece Card Game', true)
  returning id
), rarity_row as (
  insert into public.game_rarities (game_id, code, name)
  select id, 'R', 'Rare' from game_row returning id, game_id
), variant_row as (
  insert into public.game_variants (game_id, code, name)
  select id, 'ALT_ART', 'Alternate Art' from game_row returning id, game_id
), set_type_row as (
  insert into public.game_set_types (game_id, code, name)
  select id, 'BOOSTER', 'Booster' from game_row returning id, game_id
), character_row as (
  insert into public.characters (game_id, name)
  select id, 'Monkey.D.Luffy' from game_row returning id, game_id
), set_row as (
  insert into public.sets (game_id, slug, code, name, release_date, set_type_id)
  select game_row.id, 'op01', 'OP01', 'Romance Dawn', date '2022-12-02', set_type_row.id
  from game_row, set_type_row returning id, game_id
), card_row as (
  insert into public.cards (
    game_id, set_id, rarity_id, variant_id, character_id, card_image_id,
    card_number, name, rarity, variant_label, image_url, region, game_payload
  )
  select
    game_row.id, set_row.id, rarity_row.id, variant_row.id, character_row.id,
    'OP01-024_p1', 'OP01-024', 'Monkey.D.Luffy (TR)', 'TR', '',
    'https://example.test/card.jpg', 'en', '{"type":"Leader"}'::jsonb
  from game_row, set_row, rarity_row, variant_row, character_row
  returning id, game_id, set_id, rarity_id, character_id
), inventory_row as (
  insert into public.inventory_items (game_id, card_id)
  select game_id, id from card_row returning id, game_id
)
insert into public.psa_submission_items (game_id, inventory_item_id)
select game_id, id from inventory_row;

insert into public.centering_measurements (game_id, inventory_item_id, card_identity)
select game_id, id, 'OP01-024_p1' from public.inventory_items;

insert into public.game_rarities (game_id, code, name)
select id, 'TR', 'Treasure Rare' from public.games where slug = 'one_piece';

insert into public.card_character_links (game_id, card_id, character_id)
select game_id, id, character_id from public.cards;

insert into public.jp_prices (game_id, card_id, snapshot_date)
select game_id, id, current_date from public.cards;

insert into public.public_rarity_summaries (game_id, rarity_id)
select game_id, rarity_id from public.cards;

insert into public.public_character_summaries (game_id, character_id)
select game_id, character_id from public.cards;

insert into public.card_external_ids (
  game_id, card_id, provider, external_id, external_type, metadata
)
select
  cards.game_id,
  cards.id,
  providers.provider,
  providers.external_id,
  'product_id',
  '{}'::jsonb
from public.cards
cross join (values
  ('justtcg', 'legacy-card-slug'),
  ('optcgapi', 'legacy-optcgapi-id'),
  ('riftcodex', 'legacy-riftcodex-id'),
  ('tcgplayer', 'legacy-tcgplayer-id')
) as providers(provider, external_id);

insert into public.set_external_ids (
  game_id, set_id, provider, external_id, external_type, metadata
)
select game_id, id, 'justtcg', 'one-piece-card-game-romance-dawn', 'set_id', '{}'::jsonb
from public.sets;

insert into public.price_provider_mappings (game_id, provider)
select id, 'justtcg' from public.games;

insert into public.sync_state (key, state)
values
  ('justtcg_price_sync_current', '{"nextIndex":2}'::jsonb),
  ('justtcg_price_history_backfill_1y', '{"nextIndex":1}'::jsonb),
  ('ebay_sync_current', '{"nextOffset":10}'::jsonb),
  ('jp_prices_sync_current', '{"nextOffset":4}'::jsonb);

insert into public.tcg_source_records (
  game_id, provider, record_type, external_id, payload_hash, payload
)
select id, 'riftcodex', 'card', 'source-1', repeat('a', 64), '{}'::jsonb
from public.games;

insert into public.ebay_sales (
  game_id, card_id, ebay_item_id, sale_price, currency, title, sold_at
)
select game_id, id, 'ebay-1', 125.00, 'USD', 'BGS 10 Black Label Monkey.D.Luffy OP01-024', now()
from public.cards;

insert into public.sealed_products (game_id, set_id, tcg_product_id, product_type, tcg_price)
select game_id, id, 'sealed-op01', 'booster_box', 99.00
from public.sets;
