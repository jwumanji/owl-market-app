begin;

-- Historical values for the public character, set, and rarity indexes.
-- The current public summary tables remain a replace-in-place cache; this table
-- preserves one idempotent observation per entity and calendar date.
create table if not exists public.market_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  entity_type text not null,
  entity_key text not null,
  character_id uuid,
  set_id uuid,
  rarity_id uuid,
  entity_slug text not null,
  entity_code text,
  entity_name text not null,
  snapshot_date date not null,
  index_value numeric not null default 0,
  card_count integer not null default 0,
  priced_count integer not null default 0,
  chg_7d numeric,
  chg_30d numeric,
  price_basis text not null,
  metric_version integer not null default 1,
  captured_at timestamptz not null default now(),
  constraint market_index_snapshots_entity_type_check
    check (entity_type in ('character', 'set', 'rarity')),
  constraint market_index_snapshots_entity_key_not_blank_check
    check (length(trim(entity_key)) > 0),
  constraint market_index_snapshots_entity_slug_not_blank_check
    check (length(trim(entity_slug)) > 0),
  constraint market_index_snapshots_entity_name_not_blank_check
    check (length(trim(entity_name)) > 0),
  constraint market_index_snapshots_counts_check
    check (card_count >= 0 and priced_count >= 0 and priced_count <= card_count),
  constraint market_index_snapshots_index_value_check
    check (index_value >= 0),
  constraint market_index_snapshots_metric_version_check
    check (metric_version > 0),
  constraint market_index_snapshots_entity_reference_check
    check (
      (
        entity_type = 'character'
        and character_id is not null
        and set_id is null
        and rarity_id is null
      )
      or (
        entity_type = 'set'
        and character_id is null
        and rarity_id is null
      )
      or (
        entity_type = 'rarity'
        and character_id is null
        and set_id is null
      )
    ),
  constraint market_index_snapshots_character_game_fk
    foreign key (character_id, game_id)
    references public.characters(id, game_id),
  constraint market_index_snapshots_set_game_fk
    foreign key (set_id, game_id)
    references public.sets(id, game_id),
  constraint market_index_snapshots_rarity_game_fk
    foreign key (rarity_id, game_id)
    references public.game_rarities(id, game_id),
  constraint market_index_snapshots_entity_day_key
    unique (game_id, entity_type, entity_key, snapshot_date)
);

create index if not exists idx_market_index_snapshots_entity_history
  on public.market_index_snapshots(
    game_id,
    entity_type,
    entity_key,
    snapshot_date desc
  );

create index if not exists idx_market_index_snapshots_game_day
  on public.market_index_snapshots(game_id, snapshot_date desc, entity_type);

alter table public.market_index_snapshots enable row level security;
revoke all on table public.market_index_snapshots from anon, authenticated;

comment on table public.market_index_snapshots is
  'Weekly public market-index observations for character, set, and rarity history.';
comment on column public.market_index_snapshots.chg_7d is
  'The public entity 7-day change signal at capture time, aggregated from current card-level provider statistics.';
comment on column public.market_index_snapshots.chg_30d is
  'The public entity 30-day change signal at capture time, aggregated from current card-level provider statistics.';
comment on column public.market_index_snapshots.price_basis is
  'Documents the current-price definition used for index_value so historical metric changes remain auditable.';

create or replace function public.capture_market_index_snapshots(
  p_game_id uuid default null,
  p_snapshot_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row record;
  effective_snapshot_date date := coalesce(p_snapshot_date, current_date);
  character_rows integer := 0;
  rarity_rows integer := 0;
  set_rows integer := 0;
  affected_rows integer := 0;
begin
  -- Refresh the replace-in-place caches in the same transaction so character
  -- and rarity snapshots use one coherent view of the current card prices.
  perform public.refresh_public_game_summaries(p_game_id);

  for game_row in
    select id, slug
    from public.games
    where p_game_id is null or id = p_game_id
    order by id
  loop
    insert into public.market_index_snapshots (
      game_id,
      entity_type,
      entity_key,
      character_id,
      set_id,
      rarity_id,
      entity_slug,
      entity_code,
      entity_name,
      snapshot_date,
      index_value,
      card_count,
      priced_count,
      chg_7d,
      chg_30d,
      price_basis,
      metric_version,
      captured_at
    )
    select
      summaries.game_id,
      'character',
      summaries.character_id::text,
      summaries.character_id,
      null,
      null,
      summaries.slug,
      null,
      summaries.name,
      effective_snapshot_date,
      greatest(coalesce(summaries.index_value, 0), 0),
      greatest(coalesce(summaries.card_count, 0), 0),
      greatest(coalesce(summaries.priced_count, 0), 0),
      summaries.chg_7d,
      summaries.chg_30d,
      'market_avg_then_tcg_market',
      1,
      now()
    from public.public_character_summaries summaries
    where summaries.game_id = game_row.id
    on conflict (game_id, entity_type, entity_key, snapshot_date)
    do update set
      character_id = excluded.character_id,
      entity_slug = excluded.entity_slug,
      entity_name = excluded.entity_name,
      index_value = excluded.index_value,
      card_count = excluded.card_count,
      priced_count = excluded.priced_count,
      chg_7d = excluded.chg_7d,
      chg_30d = excluded.chg_30d,
      price_basis = excluded.price_basis,
      metric_version = excluded.metric_version,
      captured_at = excluded.captured_at;

    get diagnostics affected_rows = row_count;
    character_rows := character_rows + affected_rows;

    insert into public.market_index_snapshots (
      game_id,
      entity_type,
      entity_key,
      character_id,
      set_id,
      rarity_id,
      entity_slug,
      entity_code,
      entity_name,
      snapshot_date,
      index_value,
      card_count,
      priced_count,
      chg_7d,
      chg_30d,
      price_basis,
      metric_version,
      captured_at
    )
    select
      summaries.game_id,
      'rarity',
      upper(summaries.rarity_code),
      null,
      null,
      summaries.rarity_id,
      lower(summaries.rarity_code),
      upper(summaries.rarity_code),
      coalesce(nullif(summaries.rarity_name, ''), upper(summaries.rarity_code)),
      effective_snapshot_date,
      greatest(coalesce(summaries.index_value, 0), 0),
      greatest(coalesce(summaries.card_count, 0), 0),
      greatest(coalesce(summaries.priced_count, 0), 0),
      summaries.chg_7d,
      summaries.chg_30d,
      'market_avg_then_tcg_market',
      1,
      now()
    from public.public_rarity_summaries summaries
    where summaries.game_id = game_row.id
    on conflict (game_id, entity_type, entity_key, snapshot_date)
    do update set
      rarity_id = excluded.rarity_id,
      entity_slug = excluded.entity_slug,
      entity_code = excluded.entity_code,
      entity_name = excluded.entity_name,
      index_value = excluded.index_value,
      card_count = excluded.card_count,
      priced_count = excluded.priced_count,
      chg_7d = excluded.chg_7d,
      chg_30d = excluded.chg_30d,
      price_basis = excluded.price_basis,
      metric_version = excluded.metric_version,
      captured_at = excluded.captured_at;

    get diagnostics affected_rows = row_count;
    rarity_rows := rarity_rows + affected_rows;

    with set_dimensions as (
      select distinct
        case
          when game_row.slug = 'one_piece' then
            case
              when upper(trim(coalesce(sets.code, ''))) = 'N' then 'P'
              else upper(trim(coalesce(sets.code, '')))
            end
          else sets.id::text
        end as entity_key
      from public.sets
      where sets.game_id = game_row.id

      union

      select distinct
        case
          when game_row.slug = 'one_piece' then
            case
              when upper(trim(coalesce(cards.printed_set_code, ''))) = 'N' then 'P'
              else upper(trim(coalesce(cards.printed_set_code, '')))
            end
          else coalesce(cards.set_id::text, upper(trim(coalesce(cards.printed_set_code, ''))))
        end as entity_key
      from public.cards
      where cards.game_id = game_row.id
        and (game_row.slug <> 'one_piece' or cards.region = 'en')
    ),
    set_cards as (
      select
        case
          when game_row.slug = 'one_piece' then
            case
              when upper(trim(coalesce(cards.printed_set_code, sets.code, ''))) = 'N' then 'P'
              else upper(trim(coalesce(cards.printed_set_code, sets.code, '')))
            end
          else coalesce(cards.set_id::text, upper(trim(coalesce(cards.printed_set_code, sets.code, ''))))
        end as entity_key,
        price_stats.tcg_market,
        price_stats.chg_7d,
        price_stats.chg_30d
      from public.cards
      left join public.sets
        on sets.id = cards.set_id
       and sets.game_id = cards.game_id
      left join public.price_stats
        on price_stats.card_id = cards.id
       and price_stats.game_id = cards.game_id
      where cards.game_id = game_row.id
        and (game_row.slug <> 'one_piece' or cards.region = 'en')
    ),
    set_aggregates as (
      select
        entity_key,
        count(*)::integer as card_count,
        count(*) filter (where tcg_market > 0)::integer as priced_count,
        coalesce(sum(tcg_market) filter (where tcg_market > 0), 0) as index_value,
        (
          sum(tcg_market * chg_7d) filter (where tcg_market > 0 and chg_7d is not null)
          / nullif(sum(tcg_market) filter (where tcg_market > 0 and chg_7d is not null), 0)
        ) as chg_7d,
        (
          sum(tcg_market * chg_30d) filter (where tcg_market > 0 and chg_30d is not null)
          / nullif(sum(tcg_market) filter (where tcg_market > 0 and chg_30d is not null), 0)
        ) as chg_30d
      from set_cards
      where coalesce(entity_key, '') <> ''
      group by entity_key
    ),
    set_snapshot_rows as (
      select
        dimensions.entity_key,
        metadata.id as set_id,
        coalesce(nullif(metadata.slug, ''), lower(dimensions.entity_key)) as entity_slug,
        coalesce(nullif(metadata.code, ''), dimensions.entity_key) as entity_code,
        coalesce(nullif(metadata.name, ''), dimensions.entity_key) as entity_name,
        coalesce(aggregates.index_value, 0) as index_value,
        coalesce(aggregates.card_count, 0) as card_count,
        coalesce(aggregates.priced_count, 0) as priced_count,
        aggregates.chg_7d,
        aggregates.chg_30d
      from set_dimensions dimensions
      left join set_aggregates aggregates
        on aggregates.entity_key = dimensions.entity_key
      left join lateral (
        select sets.id, sets.slug, sets.code, sets.name
        from public.sets
        where sets.game_id = game_row.id
          and (
            (game_row.slug = 'one_piece' and upper(trim(coalesce(sets.code, ''))) = dimensions.entity_key)
            or (game_row.slug <> 'one_piece' and sets.id::text = dimensions.entity_key)
          )
        order by sets.release_date nulls last, sets.id
        limit 1
      ) metadata on true
      where coalesce(dimensions.entity_key, '') <> ''
    )
    insert into public.market_index_snapshots (
      game_id,
      entity_type,
      entity_key,
      character_id,
      set_id,
      rarity_id,
      entity_slug,
      entity_code,
      entity_name,
      snapshot_date,
      index_value,
      card_count,
      priced_count,
      chg_7d,
      chg_30d,
      price_basis,
      metric_version,
      captured_at
    )
    select
      game_row.id,
      'set',
      snapshots.entity_key,
      null,
      snapshots.set_id,
      null,
      snapshots.entity_slug,
      snapshots.entity_code,
      snapshots.entity_name,
      effective_snapshot_date,
      round(greatest(snapshots.index_value, 0), 2),
      greatest(snapshots.card_count, 0),
      greatest(snapshots.priced_count, 0),
      round(snapshots.chg_7d, 1),
      round(snapshots.chg_30d, 1),
      'tcg_market',
      1,
      now()
    from set_snapshot_rows snapshots
    on conflict (game_id, entity_type, entity_key, snapshot_date)
    do update set
      set_id = excluded.set_id,
      entity_slug = excluded.entity_slug,
      entity_code = excluded.entity_code,
      entity_name = excluded.entity_name,
      index_value = excluded.index_value,
      card_count = excluded.card_count,
      priced_count = excluded.priced_count,
      chg_7d = excluded.chg_7d,
      chg_30d = excluded.chg_30d,
      price_basis = excluded.price_basis,
      metric_version = excluded.metric_version,
      captured_at = excluded.captured_at;

    get diagnostics affected_rows = row_count;
    set_rows := set_rows + affected_rows;
  end loop;

  return jsonb_build_object(
    'snapshotDate', effective_snapshot_date,
    'characterRows', character_rows,
    'setRows', set_rows,
    'rarityRows', rarity_rows,
    'totalRows', character_rows + set_rows + rarity_rows
  );
end;
$$;

revoke all on function public.capture_market_index_snapshots(uuid, date)
  from public, anon, authenticated;
grant execute on function public.capture_market_index_snapshots(uuid, date)
  to service_role;

-- Keep the capture independent of application deployments. Supabase Cron uses
-- UTC, so this runs late Sunday after the regular price and summary refreshes.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'one-piece-market-index-snapshots'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'one-piece-market-index-snapshots',
    '40 23 * * 0',
    $command$
      select public.capture_market_index_snapshots(games.id, current_date)
      from public.games
      where games.slug = 'one_piece'
      limit 1;
    $command$
  );
end
$$;

commit;
