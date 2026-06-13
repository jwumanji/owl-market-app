-- v42: Public page summary cache
-- Safe to run after v41. This adds precomputed summary tables for the public
-- rarity and character pages, then seeds them from the current catalog/prices.

create table if not exists public.public_rarity_summaries (
  game_id uuid not null references public.games(id) on delete cascade,
  rarity_code text not null,
  rarity_id uuid references public.game_rarities(id) on delete set null,
  rarity_name text,
  sort_order integer not null default 1000,
  card_count integer not null default 0,
  priced_count integer not null default 0,
  index_value numeric not null default 0,
  avg_card_price numeric not null default 0,
  chg_7d numeric not null default 0,
  chg_30d numeric not null default 0,
  top_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, rarity_code),
  constraint public_rarity_summaries_code_not_blank_check
    check (length(trim(rarity_code)) > 0)
);

create table if not exists public.public_character_summaries (
  game_id uuid not null references public.games(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  slug text not null,
  name text not null,
  subtitle text,
  faction text,
  tier integer,
  type_tag text,
  card_count integer not null default 0,
  priced_count integer not null default 0,
  index_value numeric not null default 0,
  chg_7d numeric not null default 0,
  chg_30d numeric not null default 0,
  top_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, character_id),
  constraint public_character_summaries_slug_not_blank_check
    check (length(trim(slug)) > 0),
  constraint public_character_summaries_name_not_blank_check
    check (length(trim(name)) > 0)
);

create unique index if not exists public_character_summaries_game_slug_uidx
  on public.public_character_summaries(game_id, slug);

create index if not exists idx_public_rarity_summaries_game_sort
  on public.public_rarity_summaries(game_id, sort_order, index_value desc);

create index if not exists idx_public_character_summaries_game_value
  on public.public_character_summaries(game_id, index_value desc);

create or replace function public.refresh_public_game_summaries(p_game_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row record;
  promo_set_id uuid;
begin
  for game_row in
    select id, slug
    from public.games
    where p_game_id is null or id = p_game_id
  loop
    select id
    into promo_set_id
    from public.sets
    where game_id = game_row.id
      and slug = 'promo'
    limit 1;

    delete from public.public_rarity_summaries
    where game_id = game_row.id;

    delete from public.public_character_summaries
    where game_id = game_row.id;

    with normalized_cards as (
      select
        cards.id,
        cards.game_id,
        cards.rarity,
        cards.rarity_id,
        cards.set_id,
        cards.name,
        cards.card_image_id,
        cards.image_url,
        cards.image_url_small,
        case
          when game_row.slug = 'one_piece'
            and (
              (promo_set_id is not null and cards.set_id = promo_set_id)
              or upper(coalesce(cards.rarity, '')) in ('PR', 'PROMO')
              or upper(coalesce(game_rarities.code, '')) in ('PR', 'PROMO')
              or upper(coalesce(game_rarities.metadata->>'aggregate_code', '')) = 'PROMO'
            )
            then 'PROMO'
          when game_row.slug = 'one_piece' and upper(coalesce(cards.rarity, '')) = 'UNCOMMON'
            then 'UC'
          when game_row.slug = 'one_piece' and upper(coalesce(cards.rarity, '')) = 'DON!!'
            then 'DON'
          else coalesce(
            nullif(upper(trim(game_rarities.code)), ''),
            nullif(upper(trim(cards.rarity)), ''),
            'UNKNOWN'
          )
        end as rarity_code
      from public.cards
      left join public.game_rarities
        on game_rarities.id = cards.rarity_id
       and game_rarities.game_id = cards.game_id
      where cards.game_id = game_row.id
    ),
    counts as (
      select rarity_code, count(*)::integer as card_count
      from normalized_cards
      where rarity_code <> ''
      group by rarity_code
    ),
    priced_cards as (
      select
        normalized_cards.rarity_code,
        normalized_cards.id,
        normalized_cards.name,
        normalized_cards.rarity,
        normalized_cards.card_image_id,
        normalized_cards.image_url,
        normalized_cards.image_url_small,
        sets.code as set_code,
        price_stats.tcg_market,
        price_stats.market_avg,
        price_stats.chg_1d,
        price_stats.chg_7d,
        price_stats.chg_30d
      from normalized_cards
      join public.price_stats
        on price_stats.card_id = normalized_cards.id
       and price_stats.game_id = normalized_cards.game_id
      left join public.sets
        on sets.id = normalized_cards.set_id
       and sets.game_id = normalized_cards.game_id
      where price_stats.tcg_market is not null
    ),
    aggregates as (
      select
        rarity_code,
        count(*)::integer as priced_count,
        coalesce(sum(tcg_market), 0) as index_value,
        coalesce(avg(tcg_market), 0) as avg_card_price,
        coalesce(avg(chg_7d), 0) as chg_7d,
        coalesce(avg(chg_30d), 0) as chg_30d
      from priced_cards
      group by rarity_code
    ),
    ranked_top_cards as (
      select
        priced_cards.*,
        row_number() over (
          partition by priced_cards.rarity_code
          order by priced_cards.tcg_market desc nulls last, priced_cards.name
        ) as rank
      from priced_cards
    ),
    top_cards as (
      select
        rarity_code,
        jsonb_agg(
          jsonb_build_object(
            'cardId', id,
            'name', coalesce(name, ''),
            'set', coalesce(set_code, ''),
            'rarity', coalesce(rarity, rarity_code),
            'tcg', coalesce(tcg_market, 0),
            'avg', coalesce(market_avg, 0),
            'chg1d', coalesce(chg_1d, 0),
            'chg7d', coalesce(chg_7d, 0),
            'chg30d', coalesce(chg_30d, 0),
            'spark', jsonb_build_array(coalesce(tcg_market, 0), coalesce(tcg_market, 0)),
            'cardImageId', coalesce(card_image_id, ''),
            'imageSmall', coalesce(image_url_small, image_url)
          )
          order by tcg_market desc nulls last, name
        ) as top_cards
      from ranked_top_cards
      where rank <= 10
      group by rarity_code
    )
    insert into public.public_rarity_summaries (
      game_id,
      rarity_code,
      rarity_id,
      rarity_name,
      sort_order,
      card_count,
      priced_count,
      index_value,
      avg_card_price,
      chg_7d,
      chg_30d,
      top_cards,
      updated_at
    )
    select
      game_row.id,
      counts.rarity_code,
      rarity_lookup.id,
      coalesce(rarity_lookup.name, counts.rarity_code),
      coalesce(rarity_lookup.sort_order, 1000),
      counts.card_count,
      coalesce(aggregates.priced_count, 0),
      round(coalesce(aggregates.index_value, 0), 2),
      round(coalesce(aggregates.avg_card_price, 0), 2),
      round(coalesce(aggregates.chg_7d, 0), 1),
      round(coalesce(aggregates.chg_30d, 0), 1),
      coalesce(top_cards.top_cards, '[]'::jsonb),
      now()
    from counts
    left join aggregates
      on aggregates.rarity_code = counts.rarity_code
    left join top_cards
      on top_cards.rarity_code = counts.rarity_code
    left join lateral (
      select game_rarities.id, game_rarities.name, game_rarities.sort_order
      from public.game_rarities
      where game_rarities.game_id = game_row.id
        and (
          upper(game_rarities.code) = counts.rarity_code
          or upper(coalesce(game_rarities.metadata->>'aggregate_code', '')) = counts.rarity_code
        )
      order by
        case when upper(game_rarities.code) = counts.rarity_code then 0 else 1 end,
        game_rarities.sort_order,
        game_rarities.code
      limit 1
    ) as rarity_lookup on true;

    with card_counts as (
      select character_id, count(*)::integer as card_count
      from public.cards
      where game_id = game_row.id
        and character_id is not null
      group by character_id
    ),
    priced_cards as (
      select
        cards.character_id,
        cards.id,
        cards.name,
        cards.rarity,
        cards.card_image_id,
        cards.image_url,
        cards.image_url_small,
        sets.code as set_code,
        price_stats.tcg_market,
        price_stats.market_avg,
        price_stats.chg_1d,
        price_stats.chg_7d,
        price_stats.chg_30d
      from public.cards
      join public.price_stats
        on price_stats.card_id = cards.id
       and price_stats.game_id = cards.game_id
      left join public.sets
        on sets.id = cards.set_id
       and sets.game_id = cards.game_id
      where cards.game_id = game_row.id
        and cards.character_id is not null
        and price_stats.tcg_market is not null
    ),
    aggregates as (
      select
        character_id,
        count(*)::integer as priced_count,
        coalesce(sum(tcg_market), 0) as index_value,
        coalesce(avg(chg_7d), 0) as chg_7d,
        coalesce(avg(chg_30d), 0) as chg_30d
      from priced_cards
      group by character_id
    ),
    ranked_top_cards as (
      select
        priced_cards.*,
        row_number() over (
          partition by priced_cards.character_id
          order by priced_cards.tcg_market desc nulls last, priced_cards.name
        ) as rank
      from priced_cards
    ),
    top_cards as (
      select
        character_id,
        jsonb_agg(
          jsonb_build_object(
            'name', coalesce(name, ''),
            'set', coalesce(set_code, ''),
            'rarity', coalesce(rarity, ''),
            'tcg', coalesce(tcg_market, 0),
            'avg', coalesce(market_avg, 0),
            'chg1d', coalesce(chg_1d, 0),
            'chg7d', coalesce(chg_7d, 0),
            'chg30d', coalesce(chg_30d, 0),
            'spark', jsonb_build_array(coalesce(tcg_market, 0), coalesce(tcg_market, 0)),
            'imageUrl', image_url,
            'imageUrlSmall', image_url_small,
            'cardImageId', card_image_id
          )
          order by tcg_market desc nulls last, name
        ) as top_cards
      from ranked_top_cards
      where rank <= 10
      group by character_id
    )
    insert into public.public_character_summaries (
      game_id,
      character_id,
      slug,
      name,
      subtitle,
      faction,
      tier,
      type_tag,
      card_count,
      priced_count,
      index_value,
      chg_7d,
      chg_30d,
      top_cards,
      updated_at
    )
    select
      game_row.id,
      characters.id,
      characters.slug,
      characters.name,
      characters.subtitle,
      characters.faction,
      characters.tier,
      characters.type_tag,
      coalesce(card_counts.card_count, 0),
      coalesce(aggregates.priced_count, 0),
      round(coalesce(aggregates.index_value, 0), 2),
      round(coalesce(aggregates.chg_7d, 0), 1),
      round(coalesce(aggregates.chg_30d, 0), 1),
      coalesce(top_cards.top_cards, '[]'::jsonb),
      now()
    from public.characters
    left join card_counts
      on card_counts.character_id = characters.id
    left join aggregates
      on aggregates.character_id = characters.id
    left join top_cards
      on top_cards.character_id = characters.id
    where characters.game_id = game_row.id;
  end loop;
end;
$$;

grant select on table public.public_rarity_summaries to anon;
grant select on table public.public_rarity_summaries to authenticated;
grant select, insert, update, delete on table public.public_rarity_summaries to service_role;

grant select on table public.public_character_summaries to anon;
grant select on table public.public_character_summaries to authenticated;
grant select, insert, update, delete on table public.public_character_summaries to service_role;

grant execute on function public.refresh_public_game_summaries(uuid) to service_role;

select public.refresh_public_game_summaries();

notify pgrst, 'reload schema';
