-- Classify Riftbound catalog discrepancies and publish only exact-ID JustTCG
-- prices. Riot remains the canonical card-data authority once an app key is
-- available; commercial-only records are quarantined until then.

begin;

create table if not exists public.catalog_source_authorities (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  provider text not null,
  entity_scope text not null,
  authority_role text not null,
  authority_rank integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_authorities_provider_check check (length(trim(provider)) > 0),
  constraint catalog_source_authorities_scope_check
    check (entity_scope in ('card_identity', 'card_text', 'card_asset', 'commercial_identity', 'market_price', 'reconciliation')),
  constraint catalog_source_authorities_role_check
    check (authority_role in ('canonical', 'commercial', 'fallback', 'monitor')),
  constraint catalog_source_authorities_rank_check check (authority_rank > 0),
  constraint catalog_source_authorities_game_provider_scope_key
    unique (game_id, provider, entity_scope)
);

create table if not exists public.catalog_reconciliation_candidates (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  external_id text not null,
  status text not null,
  reason text not null,
  canonical_card_id uuid,
  canonical_set_id uuid,
  source_set_external_id text,
  tcgplayer_product_id text,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_reconciliation_candidates_provider_check check (length(trim(provider)) > 0),
  constraint catalog_reconciliation_candidates_external_id_check check (length(trim(external_id)) > 0),
  constraint catalog_reconciliation_candidates_entity_check
    check (entity_type in ('set', 'card', 'commercial_variant', 'sealed_product')),
  constraint catalog_reconciliation_candidates_status_check
    check (status in (
      'official_new',
      'official_preview',
      'commercial_variant',
      'provider_ahead',
      'catalog_only',
      'identity_conflict',
      'sealed_product',
      'resolved',
      'ignored'
    )),
  constraint catalog_reconciliation_candidates_game_provider_entity_external_key
    unique (game_id, provider, entity_type, external_id),
  constraint catalog_reconciliation_candidates_card_game_fk
    foreign key (canonical_card_id, game_id)
    references public.cards(id, game_id)
    on delete no action,
  constraint catalog_reconciliation_candidates_set_game_fk
    foreign key (canonical_set_id, game_id)
    references public.sets(id, game_id)
    on delete no action
);

create index if not exists idx_catalog_reconciliation_candidates_work_queue
  on public.catalog_reconciliation_candidates(game_id, status, last_seen_at desc);
create index if not exists idx_catalog_reconciliation_candidates_tcgplayer
  on public.catalog_reconciliation_candidates(game_id, tcgplayer_product_id)
  where tcgplayer_product_id is not null;

insert into public.catalog_source_authorities (
  game_id,
  provider,
  entity_scope,
  authority_role,
  authority_rank,
  metadata
)
select
  games.id,
  desired.provider,
  desired.entity_scope,
  desired.authority_role,
  desired.authority_rank,
  desired.metadata
from public.games
cross join (
  values
    ('riot_riftbound', 'card_identity', 'canonical', 1, '{"requires_app_key":true}'::jsonb),
    ('riot_riftbound', 'card_text', 'canonical', 1, '{"requires_app_key":true}'::jsonb),
    ('riot_riftbound', 'card_asset', 'canonical', 1, '{"requires_app_key":true}'::jsonb),
    ('tcgplayer', 'commercial_identity', 'commercial', 1, '{}'::jsonb),
    ('justtcg', 'market_price', 'commercial', 1, '{"api_version":"v1"}'::jsonb),
    ('riftcodex', 'reconciliation', 'monitor', 10, '{"unofficial":true}'::jsonb)
) as desired(provider, entity_scope, authority_role, authority_rank, metadata)
where games.slug = 'riftbound'
on conflict (game_id, provider, entity_scope)
do update set
  authority_role = excluded.authority_role,
  authority_rank = excluded.authority_rank,
  is_active = true,
  metadata = public.catalog_source_authorities.metadata || excluded.metadata,
  updated_at = now();

update public.price_provider_mappings
set
  product_key_rules = product_key_rules || jsonb_build_object(
    'join', 'exact_tcgplayer_product_id',
    'unmatched_policy', 'classify_and_quarantine'
  ),
  pricing_capabilities = pricing_capabilities || jsonb_build_object(
    'catalog_raw', true,
    'variant_payloads', true,
    'raw_market_prices', true,
    'market_price', true,
    'price_history', true,
    'publish_prices', true
  ),
  metadata = metadata || jsonb_build_object(
    'status', 'live_exact_matches',
    'authoritative_catalog_provider', 'riot_riftbound',
    'reconciliation_provider', 'riftcodex',
    'adapter', 'justtcg_v1_riftbound_reconciliation',
    'true_market_enabled', false
  ),
  updated_at = now()
where game_id = (select id from public.games where slug = 'riftbound')
  and provider = 'justtcg'
  and source_game_slug = 'riftbound-league-of-legends-trading-card-game'
  and source_set_slug = '';

update public.games
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'catalog_provider', 'riot_riftbound',
    'catalog_provider_status', 'awaiting_api_key',
    'catalog_reconciliation_provider', 'riftcodex',
    'pricing_provider', 'justtcg',
    'justtcg_ingestion_status', 'live_exact_matches',
    'pricing_status', 'live'
  ),
  updated_at = now()
where slug = 'riftbound';

create or replace function public.publish_riftbound_justtcg_prices(
  p_game_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written_count integer := 0;
  history_count integer := 0;
begin
  if not exists (
    select 1 from public.games where id = p_game_id and slug = 'riftbound'
  ) then
    raise exception 'publish_riftbound_justtcg_prices requires the Riftbound game id';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as value
    left join public.cards
      on cards.id = (value ->> 'card_id')::uuid
     and cards.game_id = p_game_id
    where cards.id is null
  ) then
    raise exception 'price payload contains a card outside the Riftbound game';
  end if;

  with input as (
    select
      (value ->> 'card_id')::uuid as card_id,
      (value ->> 'tcg_market')::numeric as tcg_market,
      nullif(value ->> 'tcg_low', '')::numeric as tcg_low,
      nullif(value ->> 'tcg_mid', '')::numeric as tcg_mid,
      nullif(value ->> 'tcg_high', '')::numeric as tcg_high,
      (value ->> 'market_avg')::numeric as market_avg,
      nullif(value ->> 'chg_1d', '')::numeric as chg_1d,
      nullif(value ->> 'chg_7d', '')::numeric as chg_7d,
      nullif(value ->> 'chg_30d', '')::numeric as chg_30d,
      nullif(value ->> 'ath', '')::numeric as ath,
      nullif(value ->> 'ath_date', '')::date as ath_date,
      nullif(value ->> 'atl', '')::numeric as atl,
      nullif(value ->> 'atl_date', '')::date as atl_date,
      coalesce(nullif(value ->> 'observed_at', '')::timestamptz, now()) as observed_at
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as value
    where (value ->> 'tcg_market')::numeric >= 0
  ),
  upserted as (
    insert into public.price_stats as stats (
      game_id,
      card_id,
      tcg_market,
      tcg_low,
      tcg_mid,
      tcg_high,
      market_avg,
      chg_1d,
      chg_7d,
      chg_30d,
      ath,
      ath_date,
      atl,
      atl_date,
      updated_at
    )
    select
      p_game_id,
      input.card_id,
      input.tcg_market,
      input.tcg_low,
      input.tcg_mid,
      input.tcg_high,
      input.market_avg,
      input.chg_1d,
      input.chg_7d,
      input.chg_30d,
      input.ath,
      input.ath_date,
      input.atl,
      input.atl_date,
      input.observed_at
    from input
    on conflict (game_id, card_id)
    do update set
      tcg_market = excluded.tcg_market,
      tcg_low = excluded.tcg_low,
      tcg_mid = excluded.tcg_mid,
      tcg_high = excluded.tcg_high,
      market_avg = excluded.market_avg,
      chg_1d = excluded.chg_1d,
      chg_7d = excluded.chg_7d,
      chg_30d = excluded.chg_30d,
      ath = excluded.ath,
      ath_date = excluded.ath_date,
      atl = excluded.atl,
      atl_date = excluded.atl_date,
      updated_at = excluded.updated_at
    returning card_id
  )
  select count(*) into written_count from upserted;

  with input as (
    select
      (value ->> 'card_id')::uuid as card_id,
      (value ->> 'tcg_market')::numeric as tcg_market,
      (value ->> 'market_avg')::numeric as market_avg,
      coalesce(nullif(value ->> 'observed_at', '')::timestamptz, now()) as observed_at,
      value ->> 'provider_variant_id' as provider_variant_id
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as value
    where (value ->> 'tcg_market')::numeric >= 0
  ),
  inserted as (
    insert into public.price_history (
      game_id,
      card_id,
      tcg_market,
      market_avg,
      recorded_at,
      source,
      metadata
    )
    select
      p_game_id,
      input.card_id,
      input.tcg_market,
      input.market_avg,
      input.observed_at,
      'justtcg',
      jsonb_strip_nulls(jsonb_build_object(
        'provider', 'justtcg',
        'provider_variant_id', input.provider_variant_id,
        'policy', 'riftbound_near_mint_normal_v1'
      ))
    from input
    where not exists (
      select 1
      from public.price_history existing
      where existing.game_id = p_game_id
        and existing.card_id = input.card_id
        and (existing.recorded_at at time zone 'UTC')::date =
            (input.observed_at at time zone 'UTC')::date
    )
    returning id
  )
  select count(*) into history_count from inserted;

  return jsonb_build_object(
    'prices_written', written_count,
    'history_written', history_count
  );
end
$$;

revoke all on table public.catalog_source_authorities from public, anon, authenticated;
revoke all on table public.catalog_reconciliation_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_source_authorities to service_role;
grant select, insert, update, delete on table public.catalog_reconciliation_candidates to service_role;

revoke all on function public.publish_riftbound_justtcg_prices(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_riftbound_justtcg_prices(uuid, jsonb)
  to service_role;

alter table public.catalog_source_authorities enable row level security;
alter table public.catalog_reconciliation_candidates enable row level security;

notify pgrst, 'reload schema';

commit;
