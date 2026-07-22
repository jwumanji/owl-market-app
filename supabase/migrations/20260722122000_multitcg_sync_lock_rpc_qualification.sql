-- Qualify lock columns that collide with acquire RPC output parameter names.
-- This forward fix restores legacy sync execution without changing rollout flags.

begin;

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
      update public.sync_state as legacy_rollback
      set locked_at = null, lock_owner = null, updated_at = v_now
      where legacy_rollback.key = p_legacy_key
        and legacy_rollback.lock_owner = p_lock_owner;
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
    update public.sync_state as legacy_refresh
    set state = v_state, updated_at = v_now
    where legacy_refresh.key = p_legacy_key
      and legacy_refresh.lock_owner = p_lock_owner;
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
  update public.provider_sync_states as scoped_release
  set
    state = coalesce(p_state, '{}'::jsonb),
    locked_at = null,
    lock_owner = null,
    updated_at = v_now
  where scoped_release.game_id = p_game_id
    and scoped_release.catalog_scope = coalesce(p_catalog_scope, '')
    and scoped_release.provider = p_provider
    and scoped_release.provider_api_version = coalesce(p_provider_api_version, '')
    and scoped_release.job_key = p_job_key
    and scoped_release.scope_key = coalesce(p_scope_key, '')
    and scoped_release.lock_owner = p_lock_owner;

  v_released := found;
  if not v_released then
    return false;
  end if;

  if p_legacy_key is not null then
    update public.sync_state as legacy_release
    set
      state = coalesce(p_state, '{}'::jsonb),
      locked_at = null,
      lock_owner = null,
      updated_at = v_now
    where legacy_release.key = p_legacy_key
      and legacy_release.lock_owner = p_lock_owner;
  end if;

  return true;
end
$$;

commit;
