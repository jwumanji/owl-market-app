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
