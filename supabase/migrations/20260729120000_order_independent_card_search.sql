begin;

create or replace function public.normalize_card_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(left(coalesce(p_value, ''), 4000)),
        '([a-z]+)[[:space:]_-]+([0-9]+)',
        '\1\2',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.card_search_documents (
  card_id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  search_text text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', search_text)
  ) stored,
  updated_at timestamptz not null default now(),
  constraint card_search_documents_card_game_fk
    foreign key (card_id, game_id)
    references public.cards(id, game_id)
    on delete cascade
);

create index if not exists card_search_documents_game_idx
  on public.card_search_documents (game_id, card_id);

create index if not exists card_search_documents_vector_idx
  on public.card_search_documents using gin (search_vector);

alter table public.card_search_documents enable row level security;

revoke all on table public.card_search_documents from anon, authenticated;
grant select, insert, update, delete on table public.card_search_documents to service_role;

create or replace function public.refresh_card_search_document(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_row public.cards%rowtype;
  alias_text text;
begin
  select *
  into card_row
  from public.cards
  where id = p_card_id;

  if not found or card_row.region is distinct from 'en' then
    delete from public.card_search_documents where card_id = p_card_id;
    return;
  end if;

  select string_agg(alias, ' ' order by alias)
  into alias_text
  from public.card_market_aliases
  where card_id = card_row.id
    and game_id = card_row.game_id;

  insert into public.card_search_documents (
    card_id,
    game_id,
    search_text,
    updated_at
  )
  values (
    card_row.id,
    card_row.game_id,
    public.normalize_card_search_text(concat_ws(
      ' ',
      card_row.name,
      card_row.market_name,
      card_row.card_number,
      alias_text
    )),
    now()
  )
  on conflict (card_id)
  do update set
    game_id = excluded.game_id,
    search_text = excluded.search_text,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.sync_card_search_document_from_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_card_search_document(new.id);
  return new;
end;
$$;

create or replace function public.sync_card_search_document_from_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_card_search_document(old.card_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.card_id is distinct from new.card_id then
    perform public.refresh_card_search_document(old.card_id);
  end if;

  perform public.refresh_card_search_document(new.card_id);
  return new;
end;
$$;

drop trigger if exists cards_search_document_sync on public.cards;
create trigger cards_search_document_sync
after insert or update of name, market_name, card_number, game_id, region
on public.cards
for each row
execute function public.sync_card_search_document_from_card();

drop trigger if exists card_market_aliases_search_document_sync on public.card_market_aliases;
create trigger card_market_aliases_search_document_sync
after insert or update or delete
on public.card_market_aliases
for each row
execute function public.sync_card_search_document_from_alias();

insert into public.card_search_documents (
  card_id,
  game_id,
  search_text,
  updated_at
)
select
  cards.id,
  cards.game_id,
  public.normalize_card_search_text(concat_ws(
    ' ',
    cards.name,
    cards.market_name,
    cards.card_number,
    string_agg(aliases.alias, ' ' order by aliases.alias)
      filter (where aliases.id is not null)
  )),
  now()
from public.cards as cards
left join public.card_market_aliases as aliases
  on aliases.card_id = cards.id
 and aliases.game_id = cards.game_id
where cards.region = 'en'
group by cards.id, cards.game_id, cards.name, cards.market_name, cards.card_number
on conflict (card_id)
do update set
  game_id = excluded.game_id,
  search_text = excluded.search_text,
  updated_at = excluded.updated_at;

create or replace function public.search_card_ids_by_terms(
  p_game_id uuid,
  p_query text,
  p_limit integer default 200
)
returns table (
  card_id uuid,
  match_rank double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select public.normalize_card_search_text(left(coalesce(p_query, ''), 200)) as query
  ),
  query_tokens as (
    select distinct token
    from normalized,
      lateral regexp_split_to_table(normalized.query, '[[:space:]]+') as token
    where length(token) >= 2
    limit 8
  ),
  compiled_query as (
    select to_tsquery(
      'simple',
      string_agg(token || ':*', ' & ' order by token)
    ) as value
    from query_tokens
  )
  select
    documents.card_id,
    (
      case
        when public.normalize_card_search_text(cards.market_name) = normalized.query then 400
        when exists (
          select 1
          from public.card_market_aliases as aliases
          where aliases.card_id = documents.card_id
            and aliases.game_id = documents.game_id
            and public.normalize_card_search_text(aliases.alias) = normalized.query
        ) then 380
        when documents.search_text like '%' || normalized.query || '%' then 300
        else 200
      end
      + (ts_rank_cd(documents.search_vector, compiled_query.value) * 100)
    )::double precision as match_rank
  from public.card_search_documents as documents
  join public.cards as cards
    on cards.id = documents.card_id
   and cards.game_id = documents.game_id
  cross join normalized
  cross join compiled_query
  where documents.game_id = p_game_id
    and normalized.query <> ''
    and compiled_query.value is not null
    and documents.search_vector @@ compiled_query.value
  order by match_rank desc, documents.card_id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke all on function public.normalize_card_search_text(text) from public, anon, authenticated;
revoke all on function public.refresh_card_search_document(uuid) from public, anon, authenticated;
revoke all on function public.sync_card_search_document_from_card() from public, anon, authenticated;
revoke all on function public.sync_card_search_document_from_alias() from public, anon, authenticated;
revoke all on function public.search_card_ids_by_terms(uuid, text, integer) from public, anon, authenticated;

grant execute on function public.normalize_card_search_text(text) to service_role;
grant execute on function public.refresh_card_search_document(uuid) to service_role;
grant execute on function public.search_card_ids_by_terms(uuid, text, integer) to service_role;

comment on table public.card_search_documents is
  'Maintained, indexed search text for order-independent card name and approved alias lookup.';

comment on function public.search_card_ids_by_terms(uuid, text, integer) is
  'Returns cards whose official name, market name, number, or approved aliases contain every normalized query token in any order.';

commit;
