with context as (
  select
    games.id as game_id,
    providers.id as provider_id,
    products.id as provider_product_id,
    printings.id as card_printing_id,
    printings.legacy_card_id,
    variants.id as commercial_variant_id
  from public.games
  join public.data_providers as providers on providers.code = 'justtcg'
  join public.card_printings as printings on printings.game_id = games.id
  join public.commercial_variants as variants
    on variants.card_printing_id = printings.id
   and variants.variant_key = 'legacy'
  join public.provider_products as products
    on products.card_printing_id = printings.id
   and products.provider_id = providers.id
  where games.slug = 'one_piece'
), sku as (
  insert into public.provider_skus (
    game_id,
    provider_id,
    provider_product_id,
    commercial_variant_id,
    source_catalog_key,
    external_namespace,
    external_id,
    condition_code,
    market_code,
    currency_code
  )
  select
    game_id,
    provider_id,
    provider_product_id,
    commercial_variant_id,
    'one-piece-card-game',
    'variant_id',
    'variant-1',
    'near_mint',
    'global',
    'USD'
  from context
  on conflict (provider_id, source_catalog_key, external_namespace, external_id)
  do update set
    provider_product_id = excluded.provider_product_id,
    commercial_variant_id = excluded.commercial_variant_id
  returning id, game_id, provider_id, commercial_variant_id
), observation as (
  insert into public.price_observations (
    game_id,
    commercial_variant_id,
    provider_id,
    provider_sku_id,
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
  select
    game_id,
    commercial_variant_id,
    provider_id,
    id,
    'variant_id:variant-1:2026-07-19T00:00:00.000Z',
    'global',
    'USD',
    'near_mint',
    'market',
    12.34,
    timestamptz '2026-07-19T00:00:00Z',
    timestamptz '2026-07-19T00:00:00Z',
    '{"true_market_integration":"disabled"}'::jsonb
  from sku
  on conflict (provider_id, external_observation_key, observed_at)
  do update set amount = excluded.amount
  returning *
), latest as (
  insert into public.latest_price_facts (
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
    source_updated_at
  )
  select
    game_id,
    commercial_variant_id,
    provider_id,
    provider_sku_id,
    market_code,
    '',
    currency_code,
    condition_code,
    'ungraded',
    price_type,
    amount,
    id,
    observed_at,
    source_updated_at
  from observation
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
    source_updated_at = excluded.source_updated_at
  returning id, game_id, commercial_variant_id
)
insert into public.preferred_card_prices (
  card_printing_id,
  game_id,
  legacy_card_id,
  commercial_variant_id,
  latest_price_fact_id,
  policy_key,
  policy_version,
  metadata
)
select
  context.card_printing_id,
  context.game_id,
  context.legacy_card_id,
  context.commercial_variant_id,
  latest.id,
  'legacy_justtcg_near_mint',
  1,
  '{"true_market_integration":"disabled"}'::jsonb
from context
join latest on latest.commercial_variant_id = context.commercial_variant_id
on conflict (card_printing_id)
do update set
  commercial_variant_id = excluded.commercial_variant_id,
  latest_price_fact_id = excluded.latest_price_fact_id,
  selected_at = excluded.selected_at,
  metadata = excluded.metadata;

do $$
begin
  if (select count(*) from public.cards) <> (select count(*) from public.card_printings where legacy_card_id is not null) then
    raise exception 'Legacy card to printing bootstrap count mismatch';
  end if;
  if exists (
    select 1 from public.inventory_items
    where card_id is not null and commercial_variant_id is null
  ) then
    raise exception 'Inventory variant bootstrap is incomplete';
  end if;
  if (select count(*) from public.provider_sync_states) <> 4 then
    raise exception 'Legacy sync-state migration count mismatch';
  end if;
  if not exists (
    select 1 from public.ebay_sale_variant_matches
    where match_status = 'pending' and match_method = 'legacy_card_only'
  ) then
    raise exception 'Legacy eBay rows were not quarantined';
  end if;
  if not exists (
    select 1 from pg_partitioned_table
    where partrelid = 'public.price_observations'::regclass
  ) then
    raise exception 'price_observations is not partitioned';
  end if;
  if (select count(*) from public.price_observations where price_type = 'true_market') <> 0 then
    raise exception 'JustTCG True Market must remain disabled';
  end if;
  if exists (
    select 1
    from public.card_external_ids as external_ids
    left join public.data_providers as providers
      on providers.code = lower(external_ids.provider)
    where providers.id is null
  ) then
    raise exception 'A legacy card provider is not mapped to data_providers';
  end if;
  if (select count(*) from public.provider_products)
    <> (select count(*) from public.card_external_ids)
  then
    raise exception 'Provider product bootstrap silently skipped a legacy external ID';
  end if;
  if (select count(*) from public.game_rarities where game_id = (
    select id from public.games where slug = 'one_piece'
  ) and upper(code) = 'TR') <> 1 then
    raise exception 'One Piece must have exactly one TR taxonomy row';
  end if;
  if exists (
    select 1
    from public.cards
    left join public.game_rarities on game_rarities.id = cards.rarity_id
    where upper(coalesce(cards.rarity, '')) = 'TR'
      and (
        upper(coalesce(game_rarities.code, '')) <> 'TR'
        or cards.variant_label <> 'TR'
      )
  ) then
    raise exception 'One Piece TR card taxonomy references are inconsistent';
  end if;
  if (select count(*) from public.latest_price_facts) <> 1
    or (select count(*) from public.preferred_card_prices) <> 1
  then
    raise exception 'Exact latest-price and preferred-price layers are incomplete';
  end if;
end
$$;

select
  (select count(*) from public.card_definitions) as definitions,
  (select count(*) from public.card_printings) as printings,
  (select count(*) from public.commercial_variants) as variants,
  (select count(*) from public.provider_products) as provider_products,
  (select count(*) from public.price_observations) as price_observations,
  (select count(*) from public.latest_price_facts) as latest_price_facts,
  (select count(*) from public.preferred_card_prices) as preferred_card_prices,
  (select count(*) from public.provider_sync_states) as scoped_sync_states,
  (select count(*) from public.ebay_sale_variant_matches where match_status = 'pending') as quarantined_ebay_sales,
  (select string_agg(distinct lower(provider), ',' order by lower(provider)) from public.card_external_ids)
    as external_provider_codes;
