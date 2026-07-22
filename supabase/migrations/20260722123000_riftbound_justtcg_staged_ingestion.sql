-- Enable staged JustTCG ingestion for Riftbound without changing the
-- Riftcodex-owned public catalog or publishing provider prices.

begin;

insert into public.price_provider_mappings (
  game_id,
  provider,
  source_game_slug,
  source_set_slug,
  product_key_rules,
  pricing_capabilities,
  is_active,
  metadata
)
select
  games.id,
  'justtcg',
  'riftbound-league-of-legends-trading-card-game',
  '',
  jsonb_build_object(
    'join', 'exact_tcgplayer_product_id',
    'source_key', 'cards.tcgplayerId',
    'target_key', 'card_external_ids[provider=tcgplayer,external_type=product_id].external_id',
    'unmatched_policy', 'retain_raw_only'
  ),
  jsonb_build_object(
    'catalog_raw', true,
    'variant_payloads', true,
    'raw_market_prices', true,
    'market_price', false,
    'price_history', false,
    'publish_prices', false
  ),
  true,
  jsonb_build_object(
    'status', 'staged_raw_only',
    'authoritative_catalog_provider', 'riftcodex',
    'adapter', 'justtcg_v1_riftbound_stage',
    'normalized_api_version', 'v1',
    'true_market_enabled', false
  )
from public.games
where games.slug = 'riftbound'
on conflict (game_id, provider, source_game_slug, source_set_slug)
do update set
  product_key_rules = excluded.product_key_rules,
  pricing_capabilities = excluded.pricing_capabilities,
  is_active = excluded.is_active,
  metadata = public.price_provider_mappings.metadata || excluded.metadata,
  updated_at = now();

update public.games
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'catalog_provider', 'riftcodex',
    'justtcg_ingestion_status', 'staged_raw_only',
    'pricing_status', 'deferred'
  ),
  updated_at = now()
where slug = 'riftbound';

commit;
