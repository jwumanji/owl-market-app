-- Multi-TCG rollout hardening:
-- - atomic provider/job lock ownership across scoped and legacy cursors
-- - correlated provider/SKU/variant/observation foreign keys
-- - game-scoped integrity for production-only sealed and market-sync tables

begin;

-- Keep production DDL from waiting indefinitely behind application or
-- Supabase-managed transactions. A lock timeout leaves this transaction
-- fully rolled back and safe to retry during a quieter window.
set local lock_timeout = '10s';
set local statement_timeout = '15min';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.provider_products'::regclass
      and conname = 'provider_products_id_game_provider_key'
  ) then
    alter table public.provider_products
      add constraint provider_products_id_game_provider_key
      unique (id, game_id, provider_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commercial_variants'::regclass
      and conname = 'commercial_variants_id_game_printing_key'
  ) then
    alter table public.commercial_variants
      add constraint commercial_variants_id_game_printing_key
      unique (id, game_id, card_printing_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.provider_skus'::regclass
      and conname = 'provider_skus_id_game_provider_variant_key'
  ) then
    alter table public.provider_skus
      add constraint provider_skus_id_game_provider_variant_key
      unique (id, game_id, provider_id, commercial_variant_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.source_ingest_runs'::regclass
      and conname = 'source_ingest_runs_id_game_provider_key'
  ) then
    alter table public.source_ingest_runs
      add constraint source_ingest_runs_id_game_provider_key
      unique (id, game_id, provider_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.price_observations'::regclass
      and conname = 'price_observations_identity_key'
  ) then
    alter table public.price_observations
      add constraint price_observations_identity_key
      unique (id, observed_at, game_id, commercial_variant_id, provider_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.latest_price_facts'::regclass
      and conname = 'latest_price_facts_id_game_variant_key'
  ) then
    alter table public.latest_price_facts
      add constraint latest_price_facts_id_game_variant_key
      unique (id, game_id, commercial_variant_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sealed_products'::regclass
      and conname = 'sealed_products_id_game_id_key'
  ) then
    alter table public.sealed_products
      add constraint sealed_products_id_game_id_key
      unique (id, game_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.provider_skus'::regclass
      and conname = 'provider_skus_product_provider_game_fk'
  ) then
    alter table public.provider_skus
      add constraint provider_skus_product_provider_game_fk
      foreign key (provider_product_id, game_id, provider_id)
      references public.provider_products(id, game_id, provider_id)
      on delete no action
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.price_observations'::regclass
      and conname = 'price_observations_sku_identity_fk'
  ) then
    alter table public.price_observations
      add constraint price_observations_sku_identity_fk
      foreign key (provider_sku_id, game_id, provider_id, commercial_variant_id)
      references public.provider_skus(id, game_id, provider_id, commercial_variant_id)
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.price_observations'::regclass
      and conname = 'price_observations_ingest_provider_fk'
  ) then
    alter table public.price_observations
      add constraint price_observations_ingest_provider_fk
      foreign key (ingest_run_id, game_id, provider_id)
      references public.source_ingest_runs(id, game_id, provider_id)
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.latest_price_facts'::regclass
      and conname = 'latest_price_facts_sku_identity_fk'
  ) then
    alter table public.latest_price_facts
      add constraint latest_price_facts_sku_identity_fk
      foreign key (provider_sku_id, game_id, provider_id, commercial_variant_id)
      references public.provider_skus(id, game_id, provider_id, commercial_variant_id)
      on delete no action
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.latest_price_facts'::regclass
      and conname = 'latest_price_facts_observation_identity_fk'
  ) then
    alter table public.latest_price_facts
      add constraint latest_price_facts_observation_identity_fk
      foreign key (
        observation_id,
        observation_observed_at,
        game_id,
        commercial_variant_id,
        provider_id
      )
      references public.price_observations(
        id,
        observed_at,
        game_id,
        commercial_variant_id,
        provider_id
      )
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.preferred_card_prices'::regclass
      and conname = 'preferred_card_prices_variant_printing_fk'
  ) then
    alter table public.preferred_card_prices
      add constraint preferred_card_prices_variant_printing_fk
      foreign key (commercial_variant_id, game_id, card_printing_id)
      references public.commercial_variants(id, game_id, card_printing_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.preferred_card_prices'::regclass
      and conname = 'preferred_card_prices_fact_variant_fk'
  ) then
    alter table public.preferred_card_prices
      add constraint preferred_card_prices_fact_variant_fk
      foreign key (latest_price_fact_id, game_id, commercial_variant_id)
      references public.latest_price_facts(id, game_id, commercial_variant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.card_market_sync_status'::regclass
      and conname = 'card_market_sync_status_card_game_fk'
  ) then
    alter table public.card_market_sync_status
      add constraint card_market_sync_status_card_game_fk
      foreign key (card_id, game_id)
      references public.cards(id, game_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sealed_product_price_history'::regclass
      and conname = 'sealed_product_price_history_product_game_fk'
  ) then
    alter table public.sealed_product_price_history
      add constraint sealed_product_price_history_product_game_fk
      foreign key (sealed_product_id, game_id)
      references public.sealed_products(id, game_id)
      on delete cascade
      not valid;
  end if;
end
$$;

alter table public.provider_skus
  validate constraint provider_skus_product_provider_game_fk;
alter table public.price_observations
  validate constraint price_observations_sku_identity_fk;
alter table public.price_observations
  validate constraint price_observations_ingest_provider_fk;
alter table public.latest_price_facts
  validate constraint latest_price_facts_sku_identity_fk;
alter table public.latest_price_facts
  validate constraint latest_price_facts_observation_identity_fk;
alter table public.preferred_card_prices
  validate constraint preferred_card_prices_variant_printing_fk;
alter table public.preferred_card_prices
  validate constraint preferred_card_prices_fact_variant_fk;
alter table public.card_market_sync_status
  validate constraint card_market_sync_status_card_game_fk;
alter table public.sealed_product_price_history
  validate constraint sealed_product_price_history_product_game_fk;

create or replace function public.validate_provider_sku_printing_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product_printing_id uuid;
  v_variant_printing_id uuid;
begin
  if new.provider_product_id is null or new.commercial_variant_id is null then
    return new;
  end if;

  select card_printing_id
  into v_product_printing_id
  from public.provider_products
  where id = new.provider_product_id
    and game_id = new.game_id
    and provider_id = new.provider_id;

  select card_printing_id
  into v_variant_printing_id
  from public.commercial_variants
  where id = new.commercial_variant_id
    and game_id = new.game_id;

  if v_product_printing_id is not null
     and v_variant_printing_id is not null
     and v_product_printing_id <> v_variant_printing_id then
    raise exception
      'provider SKU product printing % does not match commercial variant printing %',
      v_product_printing_id,
      v_variant_printing_id;
  end if;

  return new;
end
$$;

revoke all on function public.validate_provider_sku_printing_identity()
  from public, anon, authenticated;

drop trigger if exists provider_skus_printing_identity_guard
  on public.provider_skus;
create trigger provider_skus_printing_identity_guard
before insert or update of provider_product_id, commercial_variant_id, game_id, provider_id
on public.provider_skus
for each row execute function public.validate_provider_sku_printing_identity();

create or replace function public.acquire_provider_sync_state(
  p_game_id uuid,
  p_catalog_scope text,
  p_provider text,
  p_provider_api_version text,
  p_job_key text,
  p_scope_key text,
  p_legacy_key text,
  p_lock_owner text,
  p_lock_ttl_seconds integer,
  p_reset boolean,
  p_reset_state jsonb
)
returns table (
  state jsonb,
  locked_at timestamptz,
  lock_owner text,
  acquired boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_state jsonb := coalesce(p_reset_state, '{}'::jsonb);
  v_locked_at timestamptz;
  v_lock_owner text;
begin
  if p_lock_ttl_seconds <= 0 then
    raise exception 'p_lock_ttl_seconds must be positive';
  end if;
  if nullif(trim(p_lock_owner), '') is null then
    raise exception 'p_lock_owner is required';
  end if;

  if p_legacy_key is not null then
    insert into public.sync_state as legacy (
      key,
      state,
      locked_at,
      lock_owner,
      updated_at
    )
    values (
      p_legacy_key,
      v_state,
      v_now,
      p_lock_owner,
      v_now
    )
    on conflict (key) do update set
      state = case when p_reset then excluded.state else legacy.state end,
      locked_at = excluded.locked_at,
      lock_owner = excluded.lock_owner,
      updated_at = excluded.updated_at
    where legacy.lock_owner is null
       or legacy.lock_owner = p_lock_owner
       or legacy.locked_at is null
       or legacy.locked_at <= v_now - make_interval(secs => p_lock_ttl_seconds)
    returning legacy.state, legacy.locked_at, legacy.lock_owner
      into v_state, v_locked_at, v_lock_owner;

    if not found then
      return query
      select legacy.state, legacy.locked_at, legacy.lock_owner, false
      from public.sync_state as legacy
      where legacy.key = p_legacy_key;
      return;
    end if;
  end if;

  insert into public.provider_sync_states as scoped (
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
    updated_at
  )
  values (
    p_game_id,
    coalesce(p_catalog_scope, ''),
    p_provider,
    coalesce(p_provider_api_version, ''),
    p_job_key,
    coalesce(p_scope_key, ''),
    p_legacy_key,
    v_state,
    v_now,
    p_lock_owner,
    v_now
  )
  on conflict (game_id, catalog_scope, provider, provider_api_version, job_key, scope_key)
  do update set
    legacy_key = coalesce(excluded.legacy_key, scoped.legacy_key),
    state = case when p_reset then excluded.state else scoped.state end,
    locked_at = excluded.locked_at,
    lock_owner = excluded.lock_owner,
    updated_at = excluded.updated_at
  where scoped.lock_owner is null
     or scoped.lock_owner = p_lock_owner
     or scoped.locked_at is null
     or scoped.locked_at <= v_now - make_interval(secs => p_lock_ttl_seconds)
  returning scoped.state, scoped.locked_at, scoped.lock_owner
    into v_state, v_locked_at, v_lock_owner;

  if not found then
    if p_legacy_key is not null then
      update public.sync_state
      set locked_at = null, lock_owner = null, updated_at = v_now
      where key = p_legacy_key
        and lock_owner = p_lock_owner;
    end if;

    return query
    select scoped.state, scoped.locked_at, scoped.lock_owner, false
    from public.provider_sync_states as scoped
    where scoped.game_id = p_game_id
      and scoped.catalog_scope = coalesce(p_catalog_scope, '')
      and scoped.provider = p_provider
      and scoped.provider_api_version = coalesce(p_provider_api_version, '')
      and scoped.job_key = p_job_key
      and scoped.scope_key = coalesce(p_scope_key, '');
    return;
  end if;

  if p_legacy_key is not null then
    update public.sync_state
    set state = v_state, updated_at = v_now
    where key = p_legacy_key
      and lock_owner = p_lock_owner;
  end if;

  return query select v_state, v_locked_at, v_lock_owner, true;
end
$$;

create or replace function public.release_provider_sync_state(
  p_game_id uuid,
  p_catalog_scope text,
  p_provider text,
  p_provider_api_version text,
  p_job_key text,
  p_scope_key text,
  p_legacy_key text,
  p_lock_owner text,
  p_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_released boolean;
begin
  update public.provider_sync_states
  set
    state = coalesce(p_state, '{}'::jsonb),
    locked_at = null,
    lock_owner = null,
    updated_at = v_now
  where game_id = p_game_id
    and catalog_scope = coalesce(p_catalog_scope, '')
    and provider = p_provider
    and provider_api_version = coalesce(p_provider_api_version, '')
    and job_key = p_job_key
    and scope_key = coalesce(p_scope_key, '')
    and lock_owner = p_lock_owner;

  v_released := found;
  if not v_released then
    return false;
  end if;

  if p_legacy_key is not null then
    update public.sync_state
    set
      state = coalesce(p_state, '{}'::jsonb),
      locked_at = null,
      lock_owner = null,
      updated_at = v_now
    where key = p_legacy_key
      and lock_owner = p_lock_owner;
  end if;

  return true;
end
$$;

revoke all on function public.acquire_provider_sync_state(
  uuid, text, text, text, text, text, text, text, integer, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.acquire_provider_sync_state(
  uuid, text, text, text, text, text, text, text, integer, boolean, jsonb
) to service_role;

revoke all on function public.release_provider_sync_state(
  uuid, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.release_provider_sync_state(
  uuid, text, text, text, text, text, text, text, jsonb
) to service_role;

create or replace function public.write_justtcg_shadow_price_batch(
  p_game_id uuid,
  p_provider_id uuid,
  p_source_catalog_key text,
  p_ingest_run_id uuid,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match jsonb;
  v_printing_id uuid;
  v_variant_id uuid;
  v_product_id uuid;
  v_sku_id uuid;
  v_observation_id uuid;
  v_latest_fact_id uuid;
  v_legacy_card_id uuid;
  v_product_external_id text;
  v_product_namespace text;
  v_sku_external_id text;
  v_sku_namespace text;
  v_condition_code text;
  v_observed_at timestamptz;
  v_amount numeric;
  v_observation_key text;
  v_written integer := 0;
begin
  if jsonb_typeof(p_matches) <> 'array' then
    raise exception 'p_matches must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.source_ingest_runs
    where id = p_ingest_run_id
      and game_id = p_game_id
      and provider_id = p_provider_id
      and status = 'running'
  ) then
    raise exception 'active source ingest run % was not found', p_ingest_run_id;
  end if;

  for v_match in select value from jsonb_array_elements(p_matches)
  loop
    v_legacy_card_id := (v_match ->> 'legacy_card_id')::uuid;
    v_product_external_id := nullif(trim(v_match ->> 'provider_product_external_id'), '');
    v_product_namespace := nullif(trim(v_match ->> 'provider_product_namespace'), '');
    v_sku_external_id := nullif(trim(v_match ->> 'provider_sku_external_id'), '');
    v_sku_namespace := nullif(trim(v_match ->> 'provider_sku_namespace'), '');
    v_condition_code := coalesce(nullif(trim(v_match ->> 'condition_code'), ''), 'unspecified');
    v_observed_at := (v_match ->> 'observed_at')::timestamptz;
    v_amount := (v_match ->> 'amount')::numeric;

    if v_product_external_id is null
       or v_product_namespace is null
       or v_sku_external_id is null
       or v_sku_namespace is null then
      raise exception 'provider product and SKU identities are required';
    end if;
    if v_amount < 0 then
      raise exception 'price amount must be non-negative';
    end if;

    v_printing_id := null;
    v_variant_id := null;
    select printings.id, variants.id
    into v_printing_id, v_variant_id
    from public.card_printings as printings
    join public.commercial_variants as variants
      on variants.card_printing_id = printings.id
     and variants.game_id = printings.game_id
     and variants.variant_key = 'legacy'
    where printings.game_id = p_game_id
      and printings.legacy_card_id = v_legacy_card_id;

    if v_printing_id is null or v_variant_id is null then
      raise exception 'legacy card % has no bootstrapped printing/variant', v_legacy_card_id;
    end if;

    v_product_id := null;
    insert into public.provider_products as products (
      game_id,
      provider_id,
      card_printing_id,
      source_catalog_key,
      external_namespace,
      external_id,
      raw_payload,
      metadata
    )
    values (
      p_game_id,
      p_provider_id,
      v_printing_id,
      p_source_catalog_key,
      v_product_namespace,
      v_product_external_id,
      coalesce(v_match -> 'raw_product', '{}'::jsonb),
      jsonb_build_object(
        'adapter', 'justtcg_v1_shadow',
        'source_set_slug', v_match ->> 'source_set_slug'
      )
    )
    on conflict (provider_id, source_catalog_key, external_namespace, external_id)
    do update set
      card_printing_id = coalesce(products.card_printing_id, excluded.card_printing_id),
      raw_payload = excluded.raw_payload,
      metadata = products.metadata || excluded.metadata,
      updated_at = now()
    where products.game_id = excluded.game_id
      and (
        products.card_printing_id is null
        or products.card_printing_id = excluded.card_printing_id
      )
    returning products.id into v_product_id;

    if v_product_id is null then
      raise exception
        'provider product collision for %:%',
        v_product_namespace,
        v_product_external_id;
    end if;

    v_sku_id := null;
    insert into public.provider_skus as skus (
      game_id,
      provider_id,
      provider_product_id,
      commercial_variant_id,
      source_catalog_key,
      external_namespace,
      external_id,
      condition_code,
      market_code,
      currency_code,
      raw_payload,
      metadata
    )
    values (
      p_game_id,
      p_provider_id,
      v_product_id,
      v_variant_id,
      p_source_catalog_key,
      v_sku_namespace,
      v_sku_external_id,
      v_condition_code,
      'global',
      'USD',
      coalesce(v_match -> 'raw_variant', '{}'::jsonb),
      jsonb_build_object(
        'adapter', 'justtcg_v1_shadow',
        'printing', v_match ->> 'printing',
        'tcgplayer_sku_id', v_match ->> 'tcgplayer_sku_id'
      )
    )
    on conflict (provider_id, source_catalog_key, external_namespace, external_id)
    do update set
      provider_product_id = coalesce(skus.provider_product_id, excluded.provider_product_id),
      commercial_variant_id = coalesce(skus.commercial_variant_id, excluded.commercial_variant_id),
      condition_code = excluded.condition_code,
      raw_payload = excluded.raw_payload,
      metadata = skus.metadata || excluded.metadata,
      updated_at = now()
    where skus.game_id = excluded.game_id
      and (
        skus.provider_product_id is null
        or skus.provider_product_id = excluded.provider_product_id
      )
      and (
        skus.commercial_variant_id is null
        or skus.commercial_variant_id = excluded.commercial_variant_id
      )
    returning skus.id into v_sku_id;

    if v_sku_id is null then
      raise exception 'provider SKU collision for %:%', v_sku_namespace, v_sku_external_id;
    end if;

    perform public.ensure_price_observation_partition(v_observed_at::date);
    v_observation_key :=
      v_sku_namespace || ':' || v_sku_external_id || ':' ||
      to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

    insert into public.price_observations as observations (
      game_id,
      commercial_variant_id,
      provider_id,
      provider_sku_id,
      ingest_run_id,
      external_observation_key,
      market_code,
      currency_code,
      condition_code,
      price_type,
      amount,
      observed_at,
      source_updated_at,
      metadata
    )
    values (
      p_game_id,
      v_variant_id,
      p_provider_id,
      v_sku_id,
      p_ingest_run_id,
      v_observation_key,
      'global',
      'USD',
      v_condition_code,
      'market',
      v_amount,
      v_observed_at,
      v_observed_at,
      jsonb_build_object(
        'adapter', 'justtcg_v1_shadow',
        'true_market_enabled', false
      )
    )
    on conflict (provider_id, external_observation_key, observed_at)
    do update set
      amount = excluded.amount,
      ingest_run_id = excluded.ingest_run_id,
      source_updated_at = excluded.source_updated_at,
      metadata = observations.metadata || excluded.metadata
    returning observations.id into v_observation_id;

    insert into public.latest_price_facts as facts (
      game_id,
      commercial_variant_id,
      provider_id,
      provider_sku_id,
      market_code,
      market_region_scope,
      currency_code,
      condition_code,
      grade_key,
      price_type,
      amount,
      observation_id,
      observation_observed_at,
      source_updated_at,
      updated_at
    )
    values (
      p_game_id,
      v_variant_id,
      p_provider_id,
      v_sku_id,
      'global',
      '',
      'USD',
      v_condition_code,
      'ungraded',
      'market',
      v_amount,
      v_observation_id,
      v_observed_at,
      v_observed_at,
      now()
    )
    on conflict (
      commercial_variant_id,
      provider_id,
      market_code,
      market_region_scope,
      currency_code,
      condition_code,
      grade_key,
      price_type
    )
    do update set
      provider_sku_id = excluded.provider_sku_id,
      amount = excluded.amount,
      observation_id = excluded.observation_id,
      observation_observed_at = excluded.observation_observed_at,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at
    returning facts.id into v_latest_fact_id;

    insert into public.preferred_card_prices as preferred (
      card_printing_id,
      game_id,
      legacy_card_id,
      commercial_variant_id,
      latest_price_fact_id,
      policy_key,
      policy_version,
      selected_at,
      metadata
    )
    values (
      v_printing_id,
      p_game_id,
      v_legacy_card_id,
      v_variant_id,
      v_latest_fact_id,
      'justtcg_v1_near_mint_market',
      1,
      now(),
      jsonb_build_object('adapter', 'justtcg_v1_shadow')
    )
    on conflict (card_printing_id)
    do update set
      legacy_card_id = excluded.legacy_card_id,
      commercial_variant_id = excluded.commercial_variant_id,
      latest_price_fact_id = excluded.latest_price_fact_id,
      policy_key = excluded.policy_key,
      policy_version = excluded.policy_version,
      selected_at = excluded.selected_at,
      metadata = preferred.metadata || excluded.metadata;

    v_written := v_written + 1;
  end loop;

  return jsonb_build_object(
    'attempted', jsonb_array_length(p_matches),
    'observations_written', v_written,
    'preferred_prices_written', (
      select count(distinct value ->> 'legacy_card_id')
      from jsonb_array_elements(p_matches)
    )
  );
end
$$;

revoke all on function public.write_justtcg_shadow_price_batch(
  uuid, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.write_justtcg_shadow_price_batch(
  uuid, uuid, text, uuid, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
