-- OWL-23 / Phase 5: external IDs and price provider mappings.
--
-- This migration separates OWL card/set identity from provider-specific
-- catalog and pricing identifiers. It is additive and keeps legacy
-- cards.tcg_product_id and sets.tcg_set_id for dual-read compatibility.

begin;

create table if not exists public.card_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  card_id uuid not null references public.cards(id) on delete cascade,
  provider text not null,
  external_id text not null,
  external_type text not null default 'product_id',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_external_ids_provider_not_blank_check
    check (length(trim(provider)) > 0),
  constraint card_external_ids_external_id_not_blank_check
    check (length(trim(external_id)) > 0),
  constraint card_external_ids_external_type_not_blank_check
    check (length(trim(external_type)) > 0),
  constraint card_external_ids_unique_provider_external
    unique (game_id, provider, external_id),
  constraint card_external_ids_unique_card_provider_type
    unique (card_id, provider, external_type)
);

create table if not exists public.set_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  set_id uuid not null references public.sets(id) on delete cascade,
  provider text not null,
  external_id text not null,
  external_type text not null default 'set_id',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint set_external_ids_provider_not_blank_check
    check (length(trim(provider)) > 0),
  constraint set_external_ids_external_id_not_blank_check
    check (length(trim(external_id)) > 0),
  constraint set_external_ids_external_type_not_blank_check
    check (length(trim(external_type)) > 0),
  constraint set_external_ids_unique_provider_external
    unique (game_id, provider, external_id),
  constraint set_external_ids_unique_set_provider_type
    unique (set_id, provider, external_type)
);

create table if not exists public.price_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  provider text not null,
  source_game_slug text not null,
  source_set_slug text not null default '',
  product_key_rules jsonb not null default '{}'::jsonb,
  pricing_capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_provider_mappings_provider_not_blank_check
    check (length(trim(provider)) > 0),
  constraint price_provider_mappings_source_game_slug_not_blank_check
    check (length(trim(source_game_slug)) > 0),
  constraint price_provider_mappings_unique_scope
    unique (game_id, provider, source_game_slug, source_set_slug)
);

comment on table public.card_external_ids is
  'Game-scoped provider identifiers for cards. Provider IDs are unique per game/provider.';

comment on table public.set_external_ids is
  'Game-scoped provider identifiers for sets. Provider IDs are unique per game/provider.';

comment on table public.price_provider_mappings is
  'Game-scoped provider configuration used by sync and pricing adapters.';

create index if not exists idx_card_external_ids_card
  on public.card_external_ids(card_id);

create index if not exists idx_card_external_ids_game_provider
  on public.card_external_ids(game_id, provider, external_type);

create index if not exists idx_set_external_ids_set
  on public.set_external_ids(set_id);

create index if not exists idx_set_external_ids_game_provider
  on public.set_external_ids(game_id, provider, external_type);

create index if not exists idx_price_provider_mappings_game_provider
  on public.price_provider_mappings(game_id, provider, is_active);

-- Backfill unambiguous One Piece JustTCG card product IDs from the legacy
-- column. If duplicate provider IDs exist, skip them and surface via the
-- runbook conflict query instead of failing the migration.
with legacy as (
  select
    c.id as card_id,
    c.game_id,
    trim(c.tcg_product_id) as external_id,
    count(*) over (partition by c.game_id, trim(c.tcg_product_id)) as external_id_count
  from public.cards c
  join public.games g on g.id = c.game_id
  where g.slug = 'one_piece'
    and c.tcg_product_id is not null
    and length(trim(c.tcg_product_id)) > 0
)
insert into public.card_external_ids (
  game_id,
  card_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  legacy.game_id,
  legacy.card_id,
  'justtcg',
  legacy.external_id,
  'product_id',
  jsonb_build_object('source', 'cards.tcg_product_id')
from legacy
where legacy.external_id_count = 1
on conflict (game_id, provider, external_id) do update
set
  card_id = excluded.card_id,
  external_type = excluded.external_type,
  metadata = public.card_external_ids.metadata || excluded.metadata,
  updated_at = now();

-- Backfill current card_image_id values as optcgapi card identifiers. This is
-- not a price key, but it is the current One Piece catalog/image identity.
with legacy as (
  select
    c.id as card_id,
    c.game_id,
    trim(c.card_image_id) as external_id,
    count(*) over (partition by c.game_id, trim(c.card_image_id)) as external_id_count
  from public.cards c
  join public.games g on g.id = c.game_id
  where g.slug = 'one_piece'
    and c.card_image_id is not null
    and length(trim(c.card_image_id)) > 0
)
insert into public.card_external_ids (
  game_id,
  card_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  legacy.game_id,
  legacy.card_id,
  'optcgapi',
  legacy.external_id,
  'card_image_id',
  jsonb_build_object('source', 'cards.card_image_id')
from legacy
where legacy.external_id_count = 1
on conflict (game_id, provider, external_id) do update
set
  card_id = excluded.card_id,
  external_type = excluded.external_type,
  metadata = public.card_external_ids.metadata || excluded.metadata,
  updated_at = now();

-- Backfill unambiguous One Piece provider set IDs from sets.tcg_set_id.
with legacy as (
  select
    s.id as set_id,
    s.game_id,
    trim(s.tcg_set_id) as external_id,
    count(*) over (partition by s.game_id, trim(s.tcg_set_id)) as external_id_count
  from public.sets s
  join public.games g on g.id = s.game_id
  where g.slug = 'one_piece'
    and s.tcg_set_id is not null
    and length(trim(s.tcg_set_id)) > 0
)
insert into public.set_external_ids (
  game_id,
  set_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  legacy.game_id,
  legacy.set_id,
  'justtcg',
  legacy.external_id,
  'set_id',
  jsonb_build_object('source', 'sets.tcg_set_id')
from legacy
where legacy.external_id_count = 1
on conflict (game_id, provider, external_id) do update
set
  set_id = excluded.set_id,
  external_type = excluded.external_type,
  metadata = public.set_external_ids.metadata || excluded.metadata,
  updated_at = now();

-- Backfill set codes as optcgapi set identifiers for catalog adapter lookup.
with legacy as (
  select
    s.id as set_id,
    s.game_id,
    upper(trim(s.code)) as external_id,
    count(*) over (partition by s.game_id, upper(trim(s.code))) as external_id_count
  from public.sets s
  join public.games g on g.id = s.game_id
  where g.slug = 'one_piece'
    and s.code is not null
    and length(trim(s.code)) > 0
)
insert into public.set_external_ids (
  game_id,
  set_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  legacy.game_id,
  legacy.set_id,
  'optcgapi',
  legacy.external_id,
  'set_code',
  jsonb_build_object('source', 'sets.code')
from legacy
where legacy.external_id_count = 1
on conflict (game_id, provider, external_id) do update
set
  set_id = excluded.set_id,
  external_type = excluded.external_type,
  metadata = public.set_external_ids.metadata || excluded.metadata,
  updated_at = now();

with one_piece as (
  select id as game_id
  from public.games
  where slug = 'one_piece'
)
insert into public.price_provider_mappings (
  game_id,
  provider,
  source_game_slug,
  source_set_slug,
  product_key_rules,
  pricing_capabilities,
  metadata
)
select
  one_piece.game_id,
  'justtcg',
  'one-piece-card-game',
  '',
  '{
    "card_product_key": "card_external_ids[provider=justtcg,external_type=product_id].external_id",
    "legacy_card_product_key": "cards.tcg_product_id",
    "set_key": "set_external_ids[provider=justtcg,external_type=set_id].external_id",
    "match_priority": ["product_id", "set_number_name", "set_number"]
  }'::jsonb,
  '{
    "card_catalog": true,
    "card_prices": true,
    "price_history": true,
    "sealed_products": false
  }'::jsonb,
  '{"source":"owl_market_existing_justtcg_sync"}'::jsonb
from one_piece
on conflict (game_id, provider, source_game_slug, source_set_slug) do update
set
  product_key_rules = excluded.product_key_rules,
  pricing_capabilities = excluded.pricing_capabilities,
  metadata = public.price_provider_mappings.metadata || excluded.metadata,
  is_active = true,
  updated_at = now();

grant select on table public.card_external_ids to anon;
grant select on table public.card_external_ids to authenticated;
grant select, insert, update, delete on table public.card_external_ids to service_role;

grant select on table public.set_external_ids to anon;
grant select on table public.set_external_ids to authenticated;
grant select, insert, update, delete on table public.set_external_ids to service_role;

grant select on table public.price_provider_mappings to anon;
grant select on table public.price_provider_mappings to authenticated;
grant select, insert, update, delete on table public.price_provider_mappings to service_role;

notify pgrst, 'reload schema';

commit;
