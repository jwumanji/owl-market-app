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
