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
