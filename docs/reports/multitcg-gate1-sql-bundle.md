# Multi-TCG Gate 1 SQL review bundle

Generated: 2026-07-19

The five migration files below are reproduced verbatim, in apply order.
## 20260719090000_multitcg_integrity_and_sync_scope.sql

```sql
-- Multi-TCG foundation, part 1:
-- - close remaining same-game relationship gaps
-- - replace global sync-state keys with structured provider/job scopes
-- - keep catalog/provider tables server-side while private games are staged

begin;

do $$
begin
  if to_regclass('public.games') is null
    or to_regclass('public.cards') is null
    or to_regclass('public.sets') is null
  then
    raise exception 'Multi-TCG foundation requires the existing games/cards/sets schema';
  end if;
end
$$;

-- Older Owl Market cards predate a row-level update timestamp. Add it before
-- later catalog-integrity migrations use it while repairing classifications.
alter table public.cards
  add column if not exists updated_at timestamptz not null default now();

-- Composite parent keys are intentionally redundant with UUID primary keys.
-- They let child FKs prove that their denormalized game_id matches the parent.
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

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_variants'::regclass
      and conname = 'game_variants_id_game_id_key'
  ) then
    alter table public.game_variants
      add constraint game_variants_id_game_id_key unique (id, game_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_set_types'::regclass
      and conname = 'game_set_types_id_game_id_key'
  ) then
    alter table public.game_set_types
      add constraint game_set_types_id_game_id_key unique (id, game_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.characters'::regclass
      and conname = 'characters_id_game_id_key'
  ) then
    alter table public.characters
      add constraint characters_id_game_id_key unique (id, game_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_rarity_game_fk'
  ) then
    alter table public.cards
      add constraint cards_rarity_game_fk
      foreign key (rarity_id, game_id)
      references public.game_rarities(id, game_id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_variant_game_fk'
  ) then
    alter table public.cards
      add constraint cards_variant_game_fk
      foreign key (variant_id, game_id)
      references public.game_variants(id, game_id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_character_game_fk'
  ) then
    alter table public.cards
      add constraint cards_character_game_fk
      foreign key (character_id, game_id)
      references public.characters(id, game_id)
      on delete no action
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sets'::regclass
      and conname = 'sets_set_type_game_fk'
  ) then
    alter table public.sets
      add constraint sets_set_type_game_fk
      foreign key (set_type_id, game_id)
      references public.game_set_types(id, game_id)
      on delete restrict
      not valid;
  end if;

  if to_regclass('public.card_character_links') is not null then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.card_character_links'::regclass
        and conname = 'card_character_links_card_game_fk'
    ) then
      alter table public.card_character_links
        add constraint card_character_links_card_game_fk
        foreign key (card_id, game_id)
        references public.cards(id, game_id)
        on delete cascade
        not valid;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.card_character_links'::regclass
        and conname = 'card_character_links_character_game_fk'
    ) then
      alter table public.card_character_links
        add constraint card_character_links_character_game_fk
        foreign key (character_id, game_id)
        references public.characters(id, game_id)
        on delete cascade
        not valid;
    end if;
  end if;

  if to_regclass('public.jp_prices') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.jp_prices'::regclass
      and conname = 'jp_prices_card_game_fk'
  ) then
    alter table public.jp_prices
      add constraint jp_prices_card_game_fk
      foreign key (card_id, game_id)
      references public.cards(id, game_id)
      on delete no action
      not valid;
  end if;

  if to_regclass('public.public_rarity_summaries') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_rarity_summaries'::regclass
      and conname = 'public_rarity_summaries_rarity_game_fk'
  ) then
    alter table public.public_rarity_summaries
      add constraint public_rarity_summaries_rarity_game_fk
      foreign key (rarity_id, game_id)
      references public.game_rarities(id, game_id)
      on delete no action
      not valid;
  end if;

  if to_regclass('public.public_character_summaries') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_character_summaries'::regclass
      and conname = 'public_character_summaries_character_game_fk'
  ) then
    alter table public.public_character_summaries
      add constraint public_character_summaries_character_game_fk
      foreign key (character_id, game_id)
      references public.characters(id, game_id)
      on delete cascade
      not valid;
  end if;
end
$$;

alter table public.cards validate constraint cards_rarity_game_fk;
alter table public.cards validate constraint cards_variant_game_fk;
alter table public.cards validate constraint cards_character_game_fk;
alter table public.sets validate constraint sets_set_type_game_fk;

do $$
begin
  if to_regclass('public.card_character_links') is not null then
    alter table public.card_character_links validate constraint card_character_links_card_game_fk;
    alter table public.card_character_links validate constraint card_character_links_character_game_fk;
  end if;
  if to_regclass('public.jp_prices') is not null then
    alter table public.jp_prices validate constraint jp_prices_card_game_fk;
  end if;
  if to_regclass('public.public_rarity_summaries') is not null then
    alter table public.public_rarity_summaries validate constraint public_rarity_summaries_rarity_game_fk;
  end if;
  if to_regclass('public.public_character_summaries') is not null then
    alter table public.public_character_summaries validate constraint public_character_summaries_character_game_fk;
  end if;
end
$$;

create index if not exists idx_card_character_links_card_game
  on public.card_character_links(card_id, game_id);
create index if not exists idx_card_character_links_character_game
  on public.card_character_links(character_id, game_id);
create index if not exists idx_jp_prices_card_game_date
  on public.jp_prices(card_id, game_id, snapshot_date desc);

create table if not exists public.provider_sync_states (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  catalog_scope text not null default '',
  provider text not null,
  provider_api_version text not null default '',
  job_key text not null,
  scope_key text not null default '',
  legacy_key text,
  state jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  lock_owner text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_sync_states_provider_check
    check (provider ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint provider_sync_states_job_key_check
    check (job_key ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint provider_sync_states_scope_unique
    unique (game_id, catalog_scope, provider, provider_api_version, job_key, scope_key)
);

comment on table public.provider_sync_states is
  'Structured, game/provider/job-scoped replacement for the legacy global sync_state key table.';

create index if not exists idx_provider_sync_states_updated
  on public.provider_sync_states(game_id, provider, job_key, updated_at desc);

alter table public.provider_sync_states enable row level security;
revoke all on table public.provider_sync_states from anon, authenticated;
grant select, insert, update, delete on table public.provider_sync_states to service_role;

-- Carry existing One Piece cursors forward. The legacy table remains during the
-- rollback window and application code may dual-write it while the migration is
-- being proven.
do $$
declare
  one_piece_id uuid;
begin
  if to_regclass('public.sync_state') is null then
    return;
  end if;

  select id into one_piece_id from public.games where slug = 'one_piece';
  if one_piece_id is null then
    raise exception 'games.slug=one_piece is required to migrate legacy sync state';
  end if;

  insert into public.provider_sync_states (
    game_id,
    catalog_scope,
    provider,
    provider_api_version,
    job_key,
    scope_key,
    legacy_key,
    state,
    locked_at,
    lock_owner,
    updated_at,
    created_at
  )
  select
    one_piece_id,
    '',
    case
      when legacy.key like 'justtcg_%' then 'justtcg'
      when legacy.key = 'ebay_sync_current' then 'ebay'
      when legacy.key = 'jp_prices_sync_current' then 'yuyutei'
      else 'legacy'
    end,
    case when legacy.key like 'justtcg_%' then 'v1' else '' end,
    case
      when legacy.key = 'justtcg_price_sync_current' then 'current_prices'
      when legacy.key like 'justtcg_price_history_backfill_%' then 'price_history'
      when legacy.key = 'ebay_sync_current' then 'sold_listings'
      when legacy.key = 'jp_prices_sync_current' then 'current_prices'
      else 'legacy_cursor'
    end,
    case
      when legacy.key like 'justtcg_price_history_backfill_%'
        then replace(legacy.key, 'justtcg_price_history_backfill_', '')
      when legacy.key in (
        'justtcg_price_sync_current',
        'ebay_sync_current',
        'jp_prices_sync_current'
      ) then ''
      else legacy.key
    end,
    legacy.key,
    legacy.state,
    legacy.locked_at,
    legacy.lock_owner,
    legacy.updated_at,
    legacy.created_at
  from public.sync_state as legacy
  on conflict (game_id, catalog_scope, provider, provider_api_version, job_key, scope_key)
  do update set
    legacy_key = excluded.legacy_key,
    state = excluded.state,
    locked_at = excluded.locked_at,
    lock_owner = excluded.lock_owner,
    updated_at = excluded.updated_at;
end
$$;

-- Public catalog pages use server-side service clients. Do not expose staged
-- game catalogs or provider mappings directly to the anonymous database role.
revoke select on table public.games from anon;
revoke select on table public.game_rarities from anon;
revoke select on table public.game_variants from anon;
revoke select on table public.game_set_types from anon;
revoke select on table public.card_external_ids from anon;
revoke select on table public.set_external_ids from anon;
revoke select on table public.price_provider_mappings from anon;

do $$
begin
  if to_regclass('public.card_character_links') is not null then
    drop policy if exists "Public card character links are readable"
      on public.card_character_links;
    revoke select on table public.card_character_links from anon;
  end if;
  if to_regclass('public.public_rarity_summaries') is not null then
    revoke select on table public.public_rarity_summaries from anon;
  end if;
  if to_regclass('public.public_character_summaries') is not null then
    revoke select on table public.public_character_summaries from anon;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
```

## 20260719093000_multitcg_catalog_foundation.sql

```sql
-- Multi-TCG foundation, part 2:
-- additive identity layers above and below the legacy public.cards catalog.
-- Existing cards remain the live compatibility source during dual-run.

begin;

create table if not exists public.game_editions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  name text not null,
  language_code text,
  region_code text,
  ruleset_code text,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_editions_code_check
    check (code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint game_editions_language_check
    check (language_code is null or language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint game_editions_region_check
    check (region_code is null or region_code ~ '^[A-Z]{2}$'),
  constraint game_editions_game_code_key unique (game_id, code),
  constraint game_editions_id_game_id_key unique (id, game_id)
);

create unique index if not exists uq_game_editions_one_default
  on public.game_editions(game_id)
  where is_default;

with desired(slug, code, name, language_code, region_code, is_default) as (
  values
    ('one_piece', 'en-global', 'English / Global', 'en', null, true),
    ('one_piece', 'ja-jp', 'Japanese / Japan', 'ja', 'JP', false),
    ('pokemon', 'en-global', 'English / Global', 'en', null, true),
    ('pokemon', 'ja-jp', 'Japanese / Japan', 'ja', 'JP', false),
    ('riftbound', 'en-global', 'English / Global', 'en', null, true)
)
insert into public.game_editions (
  game_id,
  code,
  name,
  language_code,
  region_code,
  is_default,
  metadata
)
select
  games.id,
  desired.code,
  desired.name,
  desired.language_code,
  desired.region_code,
  desired.is_default,
  jsonb_build_object('seeded_by', 'multitcg_catalog_foundation')
from desired
join public.games on games.slug = desired.slug
on conflict (game_id, code) do update set
  name = excluded.name,
  language_code = excluded.language_code,
  region_code = excluded.region_code,
  metadata = public.game_editions.metadata || excluded.metadata,
  updated_at = now();

insert into public.game_editions (game_id, code, name, is_default, metadata)
select
  games.id,
  'default',
  'Default catalog',
  true,
  jsonb_build_object('seeded_by', 'multitcg_catalog_foundation')
from public.games
where not exists (
  select 1 from public.game_editions where game_editions.game_id = games.id
)
on conflict (game_id, code) do nothing;

create table if not exists public.set_releases (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_edition_id uuid not null,
  set_id uuid not null,
  release_code text not null default 'primary',
  release_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint set_releases_release_code_check
    check (release_code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint set_releases_id_game_id_key unique (id, game_id),
  constraint set_releases_edition_set_release_key
    unique (game_edition_id, set_id, release_code),
  constraint set_releases_edition_game_fk
    foreign key (game_edition_id, game_id)
    references public.game_editions(id, game_id)
    on delete cascade,
  constraint set_releases_set_game_fk
    foreign key (set_id, game_id)
    references public.sets(id, game_id)
    on delete cascade
);

insert into public.set_releases (
  game_id,
  game_edition_id,
  set_id,
  release_code,
  release_date,
  metadata
)
select
  sets.game_id,
  editions.id,
  sets.id,
  'primary',
  sets.release_date,
  jsonb_build_object('legacy_set_id', sets.id)
from public.sets
join public.game_editions as editions
  on editions.game_id = sets.game_id
 and editions.is_default
on conflict (game_edition_id, set_id, release_code) do update set
  release_date = excluded.release_date,
  metadata = public.set_releases.metadata || excluded.metadata,
  updated_at = now();

create table if not exists public.card_definitions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  canonical_key text not null,
  name text not null,
  rules_text text,
  payload_schema_version integer not null default 1,
  game_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_definitions_schema_version_check
    check (payload_schema_version > 0),
  constraint card_definitions_game_key unique (game_id, canonical_key),
  constraint card_definitions_id_game_id_key unique (id, game_id)
);

-- Bootstrap losslessly: one provisional definition per legacy card. A later
-- reconciliation can merge definitions without changing printing identity.
insert into public.card_definitions (
  game_id,
  canonical_key,
  name,
  payload_schema_version,
  game_payload,
  metadata
)
select
  cards.game_id,
  'legacy:' || cards.id::text,
  coalesce(nullif(cards.name, ''), cards.card_number, cards.id::text),
  1,
  coalesce(cards.game_payload, '{}'::jsonb),
  jsonb_build_object(
    'bootstrap_status', 'one_definition_per_legacy_card',
    'legacy_card_id', cards.id
  )
from public.cards
on conflict (game_id, canonical_key) do nothing;

create table if not exists public.card_printings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  card_definition_id uuid not null,
  set_release_id uuid,
  set_id uuid,
  game_edition_id uuid not null,
  legacy_card_id uuid unique,
  collector_number text,
  printed_name text not null,
  printed_language_code text,
  release_region_code text,
  rarity_id uuid,
  legacy_variant_label text,
  image_url text,
  payload_schema_version integer not null default 1,
  source_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_printings_language_check
    check (printed_language_code is null or printed_language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint card_printings_region_check
    check (release_region_code is null or release_region_code ~ '^[A-Z]{2}$'),
  constraint card_printings_schema_version_check
    check (payload_schema_version > 0),
  constraint card_printings_id_game_id_key unique (id, game_id),
  constraint card_printings_definition_game_fk
    foreign key (card_definition_id, game_id)
    references public.card_definitions(id, game_id)
    on delete cascade,
  constraint card_printings_set_release_game_fk
    foreign key (set_release_id, game_id)
    references public.set_releases(id, game_id)
    on delete no action,
  constraint card_printings_set_game_fk
    foreign key (set_id, game_id)
    references public.sets(id, game_id)
    on delete no action,
  constraint card_printings_edition_game_fk
    foreign key (game_edition_id, game_id)
    references public.game_editions(id, game_id)
    on delete restrict,
  constraint card_printings_rarity_game_fk
    foreign key (rarity_id, game_id)
    references public.game_rarities(id, game_id)
    on delete no action
);

insert into public.card_printings (
  id,
  game_id,
  card_definition_id,
  set_release_id,
  set_id,
  game_edition_id,
  legacy_card_id,
  collector_number,
  printed_name,
  printed_language_code,
  release_region_code,
  rarity_id,
  legacy_variant_label,
  image_url,
  payload_schema_version,
  source_payload,
  metadata
)
select
  cards.id,
  cards.game_id,
  definitions.id,
  releases.id,
  cards.set_id,
  editions.id,
  cards.id,
  cards.card_number,
  coalesce(nullif(cards.name, ''), cards.card_number, cards.id::text),
  case
    when lower(coalesce(cards.region, '')) in ('jp', 'ja') then 'ja'
    when lower(coalesce(cards.region, '')) = 'en' then 'en'
    else null
  end,
  case when lower(coalesce(cards.region, '')) in ('jp', 'ja') then 'JP' else null end,
  cards.rarity_id,
  cards.variant_label,
  cards.image_url,
  1,
  coalesce(cards.game_payload, '{}'::jsonb),
  jsonb_build_object(
    'bootstrap_status', 'legacy_card_as_printing',
    'legacy_card_image_id', cards.card_image_id
  )
from public.cards
join public.card_definitions as definitions
  on definitions.game_id = cards.game_id
 and definitions.canonical_key = 'legacy:' || cards.id::text
join lateral (
  select game_editions.*
  from public.game_editions
  where game_editions.game_id = cards.game_id
  order by
    case
      when lower(coalesce(cards.region, '')) in ('jp', 'ja') and game_editions.code = 'ja-jp' then 0
      when lower(coalesce(cards.region, '')) not in ('jp', 'ja') and game_editions.is_default then 0
      when game_editions.is_default then 1
      else 2
    end,
    game_editions.code
  limit 1
) as editions on true
left join public.set_releases as releases
  on releases.game_id = cards.game_id
 and releases.game_edition_id = editions.id
 and releases.set_id = cards.set_id
 and releases.release_code = 'primary'
on conflict (id) do nothing;

create table if not exists public.game_finishes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_finishes_game_code_key unique (game_id, code),
  constraint game_finishes_id_game_id_key unique (id, game_id)
);

create table if not exists public.game_treatments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_treatments_game_code_key unique (game_id, code),
  constraint game_treatments_id_game_id_key unique (id, game_id)
);

create table if not exists public.commercial_variants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  card_printing_id uuid not null,
  finish_id uuid,
  variant_key text not null,
  printed_language_code text,
  edition_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_variants_language_check
    check (printed_language_code is null or printed_language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint commercial_variants_printing_key unique (card_printing_id, variant_key),
  constraint commercial_variants_id_game_id_key unique (id, game_id),
  constraint commercial_variants_printing_game_fk
    foreign key (card_printing_id, game_id)
    references public.card_printings(id, game_id)
    on delete cascade,
  constraint commercial_variants_finish_game_fk
    foreign key (finish_id, game_id)
    references public.game_finishes(id, game_id)
    on delete restrict
);

insert into public.commercial_variants (
  game_id,
  card_printing_id,
  variant_key,
  printed_language_code,
  edition_label,
  metadata
)
select
  printings.game_id,
  printings.id,
  'legacy',
  printings.printed_language_code,
  printings.legacy_variant_label,
  jsonb_build_object('bootstrap_status', 'needs_provider_variant_expansion')
from public.card_printings as printings
on conflict (card_printing_id, variant_key) do nothing;

create table if not exists public.printing_treatments (
  game_id uuid not null references public.games(id) on delete cascade,
  card_printing_id uuid not null,
  treatment_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (game_id, card_printing_id, treatment_id),
  constraint printing_treatments_printing_game_fk
    foreign key (card_printing_id, game_id)
    references public.card_printings(id, game_id)
    on delete cascade,
  constraint printing_treatments_treatment_game_fk
    foreign key (treatment_id, game_id)
    references public.game_treatments(id, game_id)
    on delete cascade
);

-- Carry identity through owned copies and operational histories. These columns
-- are nullable so custom cards, sealed items, and unresolved legacy rows remain
-- representable during the transition.
alter table public.inventory_items
  add column if not exists card_printing_id uuid,
  add column if not exists commercial_variant_id uuid;

update public.inventory_items as inventory
set
  card_printing_id = printings.id,
  commercial_variant_id = variants.id
from public.card_printings as printings
join public.commercial_variants as variants
  on variants.card_printing_id = printings.id
 and variants.game_id = printings.game_id
 and variants.variant_key = 'legacy'
where inventory.card_id = printings.legacy_card_id
  and inventory.game_id = printings.game_id
  and (inventory.card_printing_id is null or inventory.commercial_variant_id is null);

alter table public.psa_submission_items
  add column if not exists card_printing_id uuid,
  add column if not exists commercial_variant_id uuid;

update public.psa_submission_items as submission_items
set
  card_printing_id = inventory.card_printing_id,
  commercial_variant_id = inventory.commercial_variant_id
from public.inventory_items as inventory
where submission_items.inventory_item_id = inventory.id
  and submission_items.game_id = inventory.game_id
  and (submission_items.card_printing_id is null or submission_items.commercial_variant_id is null);

alter table public.centering_measurements
  add column if not exists card_printing_id uuid,
  add column if not exists commercial_variant_id uuid;

update public.centering_measurements as measurements
set
  card_printing_id = inventory.card_printing_id,
  commercial_variant_id = inventory.commercial_variant_id
from public.inventory_items as inventory
where measurements.inventory_item_id = inventory.id
  and measurements.game_id = inventory.game_id
  and (measurements.card_printing_id is null or measurements.commercial_variant_id is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_items'::regclass
      and conname = 'inventory_items_printing_game_fk'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_printing_game_fk
      foreign key (card_printing_id, game_id)
      references public.card_printings(id, game_id)
      on delete no action
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_items'::regclass
      and conname = 'inventory_items_commercial_variant_game_fk'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_commercial_variant_game_fk
      foreign key (commercial_variant_id, game_id)
      references public.commercial_variants(id, game_id)
      on delete no action
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.psa_submission_items'::regclass
      and conname = 'psa_submission_items_printing_game_fk'
  ) then
    alter table public.psa_submission_items
      add constraint psa_submission_items_printing_game_fk
      foreign key (card_printing_id, game_id)
      references public.card_printings(id, game_id)
      on delete no action
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.psa_submission_items'::regclass
      and conname = 'psa_submission_items_commercial_variant_game_fk'
  ) then
    alter table public.psa_submission_items
      add constraint psa_submission_items_commercial_variant_game_fk
      foreign key (commercial_variant_id, game_id)
      references public.commercial_variants(id, game_id)
      on delete no action
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.centering_measurements'::regclass
      and conname = 'centering_measurements_printing_game_fk'
  ) then
    alter table public.centering_measurements
      add constraint centering_measurements_printing_game_fk
      foreign key (card_printing_id, game_id)
      references public.card_printings(id, game_id)
      on delete no action
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.centering_measurements'::regclass
      and conname = 'centering_measurements_commercial_variant_game_fk'
  ) then
    alter table public.centering_measurements
      add constraint centering_measurements_commercial_variant_game_fk
      foreign key (commercial_variant_id, game_id)
      references public.commercial_variants(id, game_id)
      on delete no action
      not valid;
  end if;
end
$$;

alter table public.inventory_items validate constraint inventory_items_printing_game_fk;
alter table public.inventory_items validate constraint inventory_items_commercial_variant_game_fk;
alter table public.psa_submission_items validate constraint psa_submission_items_printing_game_fk;
alter table public.psa_submission_items validate constraint psa_submission_items_commercial_variant_game_fk;
alter table public.centering_measurements validate constraint centering_measurements_printing_game_fk;
alter table public.centering_measurements validate constraint centering_measurements_commercial_variant_game_fk;

create index if not exists idx_set_releases_game_edition
  on public.set_releases(game_id, game_edition_id, release_date);
create index if not exists idx_card_definitions_game_name
  on public.card_definitions(game_id, name);
create index if not exists idx_card_printings_game_set_number
  on public.card_printings(game_id, set_id, collector_number);
create index if not exists idx_card_printings_definition
  on public.card_printings(card_definition_id, game_id);
create index if not exists idx_commercial_variants_printing
  on public.commercial_variants(card_printing_id, game_id);
create index if not exists idx_inventory_items_commercial_variant
  on public.inventory_items(game_id, commercial_variant_id);
create index if not exists idx_centering_measurements_commercial_variant
  on public.centering_measurements(game_id, commercial_variant_id, created_at desc);

alter table public.game_editions enable row level security;
alter table public.set_releases enable row level security;
alter table public.card_definitions enable row level security;
alter table public.card_printings enable row level security;
alter table public.game_finishes enable row level security;
alter table public.game_treatments enable row level security;
alter table public.commercial_variants enable row level security;
alter table public.printing_treatments enable row level security;

revoke all on table public.game_editions from anon, authenticated;
revoke all on table public.set_releases from anon, authenticated;
revoke all on table public.card_definitions from anon, authenticated;
revoke all on table public.card_printings from anon, authenticated;
revoke all on table public.game_finishes from anon, authenticated;
revoke all on table public.game_treatments from anon, authenticated;
revoke all on table public.commercial_variants from anon, authenticated;
revoke all on table public.printing_treatments from anon, authenticated;

grant select, insert, update, delete on table public.game_editions to service_role;
grant select, insert, update, delete on table public.set_releases to service_role;
grant select, insert, update, delete on table public.card_definitions to service_role;
grant select, insert, update, delete on table public.card_printings to service_role;
grant select, insert, update, delete on table public.game_finishes to service_role;
grant select, insert, update, delete on table public.game_treatments to service_role;
grant select, insert, update, delete on table public.commercial_variants to service_role;
grant select, insert, update, delete on table public.printing_treatments to service_role;

notify pgrst, 'reload schema';

commit;
```

## 20260719100000_multitcg_pricing_foundation.sql

```sql
-- Multi-TCG foundation, part 3:
-- provider product/SKU identity, partitioned immutable price facts, separate
-- latest/preferred layers, and eBay match quarantine.

begin;

create table if not exists public.data_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  normalized_api_version text not null default '',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_providers_code_check
    check (code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')
);

insert into public.data_providers (code, name, normalized_api_version, metadata)
values
  ('justtcg', 'JustTCG', 'v1', '{"v2_status":"raw_only_beta"}'::jsonb),
  ('ebay', 'eBay', '', '{}'::jsonb),
  ('yuyutei', 'Yuyu-tei', '', '{}'::jsonb),
  ('tcgplayer', 'TCGplayer', '', '{}'::jsonb),
  ('optcgapi', 'OPTCG API', '', '{}'::jsonb),
  ('riftcodex', 'Riftcodex', '', '{}'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  normalized_api_version = excluded.normalized_api_version,
  metadata = public.data_providers.metadata || excluded.metadata,
  updated_at = now();

create table if not exists public.provider_products (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  provider_id uuid not null references public.data_providers(id) on delete cascade,
  card_printing_id uuid,
  source_catalog_key text not null default '',
  external_namespace text not null,
  external_id text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_products_external_namespace_check
    check (external_namespace ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint provider_products_external_id_check
    check (length(trim(external_id)) > 0),
  constraint provider_products_external_key
    unique (provider_id, source_catalog_key, external_namespace, external_id),
  constraint provider_products_id_game_id_key unique (id, game_id),
  constraint provider_products_printing_game_fk
    foreign key (card_printing_id, game_id)
    references public.card_printings(id, game_id)
    on delete no action
);

do $$
declare
  unmapped_provider_codes text;
begin
  select string_agg(quote_literal(provider_code), ', ' order by provider_code)
  into unmapped_provider_codes
  from (
    select distinct lower(external_ids.provider) as provider_code
    from public.card_external_ids as external_ids
    where not exists (
      select 1
      from public.data_providers as providers
      where providers.code = lower(external_ids.provider)
    )
  ) as unmapped;

  if unmapped_provider_codes is not null then
    raise exception 'Unmapped card_external_ids provider codes: %', unmapped_provider_codes;
  end if;
end
$$;

insert into public.provider_products (
  game_id,
  provider_id,
  card_printing_id,
  source_catalog_key,
  external_namespace,
  external_id,
  metadata
)
select
  external_ids.game_id,
  providers.id,
  printings.id,
  case
    when games.slug = 'one_piece' then 'one-piece-card-game'
    else games.slug
  end,
  lower(external_ids.external_type),
  external_ids.external_id,
  external_ids.metadata || jsonb_build_object('legacy_card_external_id', external_ids.id)
from public.card_external_ids as external_ids
join public.data_providers as providers
  on providers.code = lower(external_ids.provider)
join public.games on games.id = external_ids.game_id
join public.card_printings as printings
  on printings.legacy_card_id = external_ids.card_id
 and printings.game_id = external_ids.game_id
on conflict (provider_id, source_catalog_key, external_namespace, external_id)
do update set
  card_printing_id = excluded.card_printing_id,
  metadata = public.provider_products.metadata || excluded.metadata,
  updated_at = now();

create table if not exists public.provider_skus (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  provider_id uuid not null references public.data_providers(id) on delete cascade,
  provider_product_id uuid,
  commercial_variant_id uuid,
  source_catalog_key text not null default '',
  external_namespace text not null,
  external_id text not null,
  condition_code text not null default 'unspecified',
  market_code text not null default 'global',
  market_region_code text,
  currency_code text not null default 'USD',
  grade_company text,
  grade_value numeric,
  grade_label text,
  grade_tier_code text,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_skus_external_namespace_check
    check (external_namespace ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint provider_skus_external_id_check
    check (length(trim(external_id)) > 0),
  constraint provider_skus_region_check
    check (market_region_code is null or market_region_code ~ '^[A-Z]{2}$'),
  constraint provider_skus_currency_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint provider_skus_grade_value_check
    check (grade_value is null or grade_value >= 0),
  constraint provider_skus_external_key
    unique (provider_id, source_catalog_key, external_namespace, external_id),
  constraint provider_skus_id_game_id_key unique (id, game_id),
  constraint provider_skus_product_game_fk
    foreign key (provider_product_id, game_id)
    references public.provider_products(id, game_id)
    on delete no action,
  constraint provider_skus_variant_game_fk
    foreign key (commercial_variant_id, game_id)
    references public.commercial_variants(id, game_id)
    on delete no action
);

create table if not exists public.source_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  provider_id uuid not null references public.data_providers(id) on delete cascade,
  source_catalog_key text not null default '',
  adapter_version text not null,
  provider_api_version text not null default '',
  job_key text not null,
  status text not null default 'running',
  cursor jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint source_ingest_runs_status_check
    check (status in ('running', 'completed', 'partial', 'failed', 'cancelled')),
  constraint source_ingest_runs_id_game_id_key unique (id, game_id)
);

do $$
begin
  if to_regclass('public.tcg_source_records') is not null then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.tcg_source_records'::regclass
        and conname = 'tcg_source_records_id_game_id_key'
    ) then
      alter table public.tcg_source_records
        add constraint tcg_source_records_id_game_id_key unique (id, game_id);
    end if;

    alter table public.tcg_source_records
      add column if not exists ingest_run_id uuid,
      add column if not exists payload_schema_version integer not null default 1,
      add column if not exists adapter_version text not null default 'legacy',
      add column if not exists is_tombstone boolean not null default false,
      add column if not exists last_seen_at timestamptz not null default now();

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.tcg_source_records'::regclass
        and conname = 'tcg_source_records_ingest_run_game_fk'
    ) then
      alter table public.tcg_source_records
        add constraint tcg_source_records_ingest_run_game_fk
        foreign key (ingest_run_id, game_id)
        references public.source_ingest_runs(id, game_id)
        on delete no action
        not valid;
    end if;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.tcg_source_records') is not null then
    alter table public.tcg_source_records
      validate constraint tcg_source_records_ingest_run_game_fk;
  end if;
end
$$;

-- Partitioned by observation time before Magic-scale data is imported.
create table if not exists public.price_observations (
  id uuid not null default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  commercial_variant_id uuid not null,
  provider_id uuid not null references public.data_providers(id) on delete restrict,
  provider_sku_id uuid,
  ingest_run_id uuid,
  source_record_id uuid,
  external_observation_key text not null,
  market_code text not null default 'global',
  market_region_code text,
  currency_code text not null,
  condition_code text not null default 'unspecified',
  grade_company text,
  grade_value numeric,
  grade_label text,
  grade_tier_code text,
  price_type text not null,
  amount numeric not null,
  observed_at timestamptz not null,
  source_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id, observed_at),
  constraint price_observations_amount_check check (amount >= 0),
  constraint price_observations_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint price_observations_region_check
    check (market_region_code is null or market_region_code ~ '^[A-Z]{2}$'),
  constraint price_observations_grade_value_check
    check (grade_value is null or grade_value >= 0),
  constraint price_observations_price_type_check
    check (price_type ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  constraint price_observations_external_key_check
    check (length(trim(external_observation_key)) > 0),
  constraint price_observations_variant_game_fk
    foreign key (commercial_variant_id, game_id)
    references public.commercial_variants(id, game_id)
    on delete no action,
  constraint price_observations_sku_game_fk
    foreign key (provider_sku_id, game_id)
    references public.provider_skus(id, game_id)
    on delete no action,
  constraint price_observations_ingest_run_game_fk
    foreign key (ingest_run_id, game_id)
    references public.source_ingest_runs(id, game_id)
    on delete no action,
  constraint price_observations_source_record_game_fk
    foreign key (source_record_id, game_id)
    references public.tcg_source_records(id, game_id)
    on delete no action
) partition by range (observed_at);

create or replace function public.ensure_price_observation_partition(p_month date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  partition_name text := 'price_observations_' || to_char(month_start, 'YYYYMM');
begin
  execute format(
    'create table if not exists public.%I partition of public.price_observations for values from (%L) to (%L)',
    partition_name,
    month_start::timestamptz,
    month_end::timestamptz
  );
  return partition_name;
end
$$;

revoke all on function public.ensure_price_observation_partition(date) from public, anon, authenticated;
grant execute on function public.ensure_price_observation_partition(date) to service_role;

-- Seed the previous month through the next 18 months. Sync jobs must call the
-- helper before writing a later month so missing operational maintenance fails
-- loudly rather than spilling into an unbounded default partition.
do $$
declare
  offset_month integer;
begin
  for offset_month in -1..18 loop
    perform public.ensure_price_observation_partition(
      (date_trunc('month', current_date) + make_interval(months => offset_month))::date
    );
  end loop;
end
$$;

create index if not exists idx_price_observations_variant_time
  on public.price_observations(game_id, commercial_variant_id, observed_at desc);
create index if not exists idx_price_observations_provider_time
  on public.price_observations(provider_id, observed_at desc);
create index if not exists idx_price_observations_sku_time
  on public.price_observations(provider_sku_id, observed_at desc);
create unique index if not exists uq_price_observations_provider_external_time
  on public.price_observations(provider_id, external_observation_key, observed_at);

create table if not exists public.latest_price_facts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  commercial_variant_id uuid not null,
  provider_id uuid not null references public.data_providers(id) on delete cascade,
  provider_sku_id uuid,
  market_code text not null default 'global',
  market_region_scope text not null default '',
  currency_code text not null,
  condition_code text not null default 'unspecified',
  grade_key text not null default 'ungraded',
  grade_company text,
  grade_value numeric,
  grade_label text,
  grade_tier_code text,
  price_type text not null,
  amount numeric not null,
  observation_id uuid not null,
  observation_observed_at timestamptz not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint latest_price_facts_amount_check check (amount >= 0),
  constraint latest_price_facts_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint latest_price_facts_scope_key unique (
    commercial_variant_id,
    provider_id,
    market_code,
    market_region_scope,
    currency_code,
    condition_code,
    grade_key,
    price_type
  ),
  constraint latest_price_facts_id_game_id_key unique (id, game_id),
  constraint latest_price_facts_variant_game_fk
    foreign key (commercial_variant_id, game_id)
    references public.commercial_variants(id, game_id)
    on delete cascade,
  constraint latest_price_facts_sku_game_fk
    foreign key (provider_sku_id, game_id)
    references public.provider_skus(id, game_id)
    on delete no action,
  constraint latest_price_facts_observation_fk
    foreign key (observation_id, observation_observed_at)
    references public.price_observations(id, observed_at)
    on delete cascade
);

create or replace function public.prevent_latest_price_fact_regression()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.observation_observed_at < old.observation_observed_at then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.prevent_latest_price_fact_regression() from public, anon, authenticated;

drop trigger if exists latest_price_facts_recency_guard on public.latest_price_facts;
create trigger latest_price_facts_recency_guard
before update on public.latest_price_facts
for each row execute function public.prevent_latest_price_fact_regression();

create table if not exists public.preferred_card_prices (
  card_printing_id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  legacy_card_id uuid,
  commercial_variant_id uuid not null,
  latest_price_fact_id uuid not null,
  policy_key text not null,
  policy_version integer not null,
  selected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint preferred_card_prices_policy_version_check check (policy_version > 0),
  constraint preferred_card_prices_printing_game_fk
    foreign key (card_printing_id, game_id)
    references public.card_printings(id, game_id)
    on delete cascade,
  constraint preferred_card_prices_legacy_card_game_fk
    foreign key (legacy_card_id, game_id)
    references public.cards(id, game_id)
    on delete no action,
  constraint preferred_card_prices_variant_game_fk
    foreign key (commercial_variant_id, game_id)
    references public.commercial_variants(id, game_id)
    on delete cascade,
  constraint preferred_card_prices_fact_game_fk
    foreign key (latest_price_fact_id, game_id)
    references public.latest_price_facts(id, game_id)
    on delete cascade
);

-- Existing eBay rows are card-level matches. Preserve them as raw evidence and
-- require explicit variant resolution before they become canonical sold facts.
alter table public.ebay_sales
  add column if not exists grade_label text,
  add column if not exists grade_tier_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ebay_sales'::regclass
      and conname = 'ebay_sales_id_game_id_key'
  ) then
    alter table public.ebay_sales
      add constraint ebay_sales_id_game_id_key unique (id, game_id);
  end if;
end
$$;

create table if not exists public.ebay_sale_variant_matches (
  ebay_sale_id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  commercial_variant_id uuid,
  match_status text not null default 'pending',
  match_method text,
  match_confidence numeric,
  match_reason text,
  candidates jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ebay_sale_variant_matches_status_check
    check (match_status in ('pending', 'matched', 'ambiguous', 'rejected')),
  constraint ebay_sale_variant_matches_confidence_check
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  constraint ebay_sale_variant_matches_matched_variant_check
    check (match_status <> 'matched' or commercial_variant_id is not null),
  constraint ebay_sale_variant_matches_sale_game_fk
    foreign key (ebay_sale_id, game_id)
    references public.ebay_sales(id, game_id)
    on delete cascade,
  constraint ebay_sale_variant_matches_variant_game_fk
    foreign key (commercial_variant_id, game_id)
    references public.commercial_variants(id, game_id)
    on delete no action
);

insert into public.ebay_sale_variant_matches (
  ebay_sale_id,
  game_id,
  match_status,
  match_method,
  match_reason
)
select
  ebay_sales.id,
  ebay_sales.game_id,
  'pending',
  'legacy_card_only',
  'Legacy sync attached search results to a card without finish/treatment/language/grade variant resolution.'
from public.ebay_sales
on conflict (ebay_sale_id) do nothing;

create index if not exists idx_provider_products_printing
  on public.provider_products(game_id, card_printing_id, provider_id);
create index if not exists idx_provider_skus_variant
  on public.provider_skus(game_id, commercial_variant_id, provider_id);
create index if not exists idx_source_ingest_runs_scope
  on public.source_ingest_runs(game_id, provider_id, job_key, started_at desc);
create index if not exists idx_latest_price_facts_variant
  on public.latest_price_facts(game_id, commercial_variant_id, updated_at desc);
create index if not exists idx_ebay_sale_variant_matches_status
  on public.ebay_sale_variant_matches(game_id, match_status, updated_at desc);

alter table public.data_providers enable row level security;
alter table public.provider_products enable row level security;
alter table public.provider_skus enable row level security;
alter table public.source_ingest_runs enable row level security;
alter table public.price_observations enable row level security;
alter table public.latest_price_facts enable row level security;
alter table public.preferred_card_prices enable row level security;
alter table public.ebay_sale_variant_matches enable row level security;

revoke all on table public.data_providers from anon, authenticated;
revoke all on table public.provider_products from anon, authenticated;
revoke all on table public.provider_skus from anon, authenticated;
revoke all on table public.source_ingest_runs from anon, authenticated;
revoke all on table public.price_observations from anon, authenticated;
revoke all on table public.latest_price_facts from anon, authenticated;
revoke all on table public.preferred_card_prices from anon, authenticated;
revoke all on table public.ebay_sale_variant_matches from anon, authenticated;

grant select, insert, update, delete on table public.data_providers to service_role;
grant select, insert, update, delete on table public.provider_products to service_role;
grant select, insert, update, delete on table public.provider_skus to service_role;
grant select, insert, update, delete on table public.source_ingest_runs to service_role;
grant select, insert, update, delete on table public.price_observations to service_role;
grant select, insert, update, delete on table public.latest_price_facts to service_role;
grant select, insert, update, delete on table public.preferred_card_prices to service_role;
grant select, insert, update, delete on table public.ebay_sale_variant_matches to service_role;

notify pgrst, 'reload schema';

commit;
```

## 20260719113000_one_piece_treasure_rare_integrity.sql

```sql
begin;

-- Keep the public One Piece market indexes aligned with the English catalog.
-- The server-side fallback already applies this scope, but the cached summary
-- function historically counted JP rows as well.
do $$
declare
  current_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.refresh_public_game_summaries(uuid)'::regprocedure)
  into current_definition;

  if current_definition is null then
    raise exception 'refresh_public_game_summaries(uuid) is not installed';
  end if;

  if position($check$and (game_row.slug <> 'one_piece' or cards.region = 'en')$check$ in current_definition) = 0 then
    corrected_definition := replace(
      current_definition,
      $from$where cards.game_id = game_row.id$from$,
      $to$where cards.game_id = game_row.id
        and (game_row.slug <> 'one_piece' or cards.region = 'en')$to$
    );

    if corrected_definition = current_definition then
      raise exception 'Unexpected refresh_public_game_summaries definition; English-region scope was not applied';
    end if;

    execute corrected_definition;
  end if;
end
$$;

-- Repair the two legacy English rows that are known TR printings but were
-- imported under their base/SP rarity. These predicates include the release
-- set so a same-number base printing cannot be touched accidentally.
with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), corrected_cards as (
  select cards.id, cards.card_image_id
  from public.cards
  join one_piece on one_piece.id = cards.game_id
  join public.sets
    on sets.id = cards.set_id
   and sets.game_id = cards.game_id
  where cards.region = 'en'
    and (
      (cards.card_image_id = 'OP07-109_p2' and sets.code = 'OP08')
      or (cards.card_image_id = 'ST18-004_p1' and sets.code = 'OP09')
    )
)
update public.cards
set
  rarity = 'TR',
  variant_label = 'TR',
  name = case
    when card_image_id = 'OP07-109_p2' then regexp_replace(name, '\\(SP\\)', '(TR)', 'i')
    when name !~* '\\(TR\\)' then name || ' (TR)'
    else name
  end
where id in (select id from corrected_cards);

-- Existing correctly classified TR rows may predate variant_label. Setting it
-- makes provider matching deterministic and prevents a later base-card match.
update public.cards
set variant_label = 'TR'
where game_id = (select id from public.games where slug = 'one_piece')
  and region = 'en'
  and upper(coalesce(rarity, '')) = 'TR'
  and coalesce(variant_label, '') = '';

select public.refresh_public_game_summaries(
  (select id from public.games where slug = 'one_piece')
);

commit;
```

## 20260719114500_one_piece_tr_rarity_reference.sql

```sql
begin;

do $$
declare
  treasure_rarity_count integer;
begin
  select count(*)
  into treasure_rarity_count
  from public.game_rarities
  join public.games on games.id = game_rarities.game_id
  where games.slug = 'one_piece'
    and upper(game_rarities.code) = 'TR';

  if treasure_rarity_count <> 1 then
    raise exception 'Expected exactly one One Piece TR taxonomy row, found %', treasure_rarity_count;
  end if;
end
$$;

create or replace function public.sync_one_piece_tr_rarity_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  one_piece_id uuid;
  treasure_rarity_id uuid;
begin
  if upper(coalesce(new.rarity, '')) <> 'TR' then
    return new;
  end if;

  select id into one_piece_id
  from public.games
  where slug = 'one_piece'
  limit 1;

  if new.game_id <> one_piece_id then
    return new;
  end if;

  select id into treasure_rarity_id
  from public.game_rarities
  where game_id = new.game_id
    and upper(code) = 'TR'
  limit 1;

  if treasure_rarity_id is null then
    raise exception 'One Piece TR taxonomy row is missing';
  end if;

  new.rarity := 'TR';
  new.rarity_id := treasure_rarity_id;
  return new;
end;
$$;

drop trigger if exists cards_sync_one_piece_tr_rarity_reference on public.cards;
create trigger cards_sync_one_piece_tr_rarity_reference
before insert or update of rarity, rarity_id, game_id on public.cards
for each row
execute function public.sync_one_piece_tr_rarity_reference();

-- Reconcile existing English TR rows, including the two repaired legacy rows.
update public.cards
set
  rarity = 'TR',
  rarity_id = (
    select game_rarities.id
    from public.game_rarities
    where game_rarities.game_id = cards.game_id
      and upper(game_rarities.code) = 'TR'
    limit 1
  ),
  name = case
    when card_image_id = 'OP07-109_p2' then replace(name, '(SP)', '(TR)')
    else name
  end
where game_id = (select id from public.games where slug = 'one_piece')
  and region = 'en'
  and upper(coalesce(rarity, '')) = 'TR';

select public.refresh_public_game_summaries(
  (select id from public.games where slug = 'one_piece')
);

commit;
```


