-- Stage Disney Lorcana catalog and JustTCG source contracts.
--
-- This migration intentionally keeps the game private, image writes disabled,
-- and price publication disabled. The first operational gate is a read-only
-- LorcanaJSON <-> JustTCG exact-ID reconciliation.

begin;

insert into public.data_providers (
  code,
  name,
  normalized_api_version,
  is_active,
  metadata
)
values (
  'lorcanajson',
  'LorcanaJSON',
  '2.x',
  true,
  '{"unofficial":true,"catalog_path":"current/en"}'::jsonb
)
on conflict (code) do update
set
  name = excluded.name,
  normalized_api_version = excluded.normalized_api_version,
  is_active = excluded.is_active,
  metadata = coalesce(public.data_providers.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

insert into public.games (slug, name, is_active, is_public, metadata)
values (
  'lorcana',
  'Disney Lorcana',
  true,
  false,
  jsonb_build_object(
    'route_slug', 'lorcana',
    'catalog_provider', 'lorcanajson',
    'catalog_status', 'staged',
    'pricing_provider', 'justtcg',
    'pricing_status', 'staged_raw_only',
    'asset_status', 'awaiting_commercial_use_clearance',
    'asset_writes_enabled', false,
    'publication_status', 'disabled'
  )
)
on conflict (slug) do update
set
  name = excluded.name,
  is_active = true,
  is_public = false,
  metadata = coalesce(public.games.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
)
update public.game_editions
set
  is_default = false,
  updated_at = now()
from lorcana
where game_editions.game_id = lorcana.game_id
  and game_editions.code <> 'en-global'
  and game_editions.is_default;

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
)
insert into public.game_editions (
  game_id,
  code,
  name,
  language_code,
  region_code,
  is_default,
  metadata
)
select
  lorcana.game_id,
  'en-global',
  'English / Global',
  'en',
  null,
  true,
  '{"source":"lorcanajson","catalog_path":"current/en"}'::jsonb
from lorcana
on conflict (game_id, code) do update
set
  name = excluded.name,
  language_code = excluded.language_code,
  region_code = excluded.region_code,
  is_default = excluded.is_default,
  metadata = coalesce(public.game_editions.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
),
seed(code, name, sort_order) as (
  values
    ('COMMON', 'Common', 10),
    ('UNCOMMON', 'Uncommon', 20),
    ('RARE', 'Rare', 30),
    ('SUPER_RARE', 'Super Rare', 40),
    ('LEGENDARY', 'Legendary', 50),
    ('ENCHANTED', 'Enchanted', 60),
    ('EPIC', 'Epic', 70),
    ('ICONIC', 'Iconic', 80),
    ('SPECIAL', 'Special', 90)
)
insert into public.game_rarities (game_id, code, name, sort_order, metadata)
select
  lorcana.game_id,
  seed.code,
  seed.name,
  seed.sort_order,
  '{"source":"lorcanajson"}'::jsonb
from lorcana
cross join seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = coalesce(public.game_rarities.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
),
seed(code, name, sort_order) as (
  values
    ('STANDARD', 'Standard', 10),
    ('PROMO', 'Promo', 20),
    ('ALTERNATE_ART', 'Alternate Art', 30),
    ('OVER_NUMBERED', 'Overnumbered', 40)
)
insert into public.game_variants (game_id, code, name, sort_order, metadata)
select
  lorcana.game_id,
  seed.code,
  seed.name,
  seed.sort_order,
  '{"source":"lorcanajson","finish_dimension":"preserved_separately"}'::jsonb
from lorcana
cross join seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = coalesce(public.game_variants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
),
seed(code, name, sort_order, metadata) as (
  values
    ('EXPANSION', 'Expansion', 10, '{"lorcanajson_type":"expansion"}'::jsonb),
    ('QUEST', 'Illumineer''s Quest', 20, '{"lorcanajson_type":"quest"}'::jsonb)
)
insert into public.game_set_types (game_id, code, name, sort_order, metadata)
select
  lorcana.game_id,
  seed.code,
  seed.name,
  seed.sort_order,
  seed.metadata || '{"source":"lorcanajson"}'::jsonb
from lorcana
cross join seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = coalesce(public.game_set_types.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

insert into public.catalog_source_authorities (
  game_id,
  provider,
  entity_scope,
  authority_role,
  authority_rank,
  is_active,
  metadata
)
select
  games.id,
  desired.provider,
  desired.entity_scope,
  desired.authority_role,
  desired.authority_rank,
  desired.is_active,
  desired.metadata
from public.games
cross join (
  values
    (
      'ravensburger_lorcana',
      'card_identity',
      'monitor',
      1,
      true,
      '{"official":true,"automation":"manual_diff"}'::jsonb
    ),
    (
      'ravensburger_lorcana',
      'card_text',
      'monitor',
      1,
      true,
      '{"official":true,"automation":"manual_diff"}'::jsonb
    ),
    (
      'lorcanajson',
      'card_identity',
      'canonical',
      10,
      true,
      '{"unofficial":true,"language":"en","format_contract":"2.x"}'::jsonb
    ),
    (
      'lorcanajson',
      'card_text',
      'canonical',
      10,
      true,
      '{"unofficial":true,"language":"en","format_contract":"2.x"}'::jsonb
    ),
    (
      'ravensburger_lorcana',
      'card_asset',
      'monitor',
      1,
      false,
      '{"official":true,"writes_enabled":false,"reason":"commercial_use_clearance_required"}'::jsonb
    ),
    (
      'lorcanajson',
      'card_asset',
      'fallback',
      20,
      false,
      '{"writes_enabled":false,"reason":"source_urls_are_not_an_asset_license"}'::jsonb
    ),
    (
      'tcgplayer',
      'commercial_identity',
      'commercial',
      1,
      true,
      '{"join":"exact_product_id"}'::jsonb
    ),
    (
      'justtcg',
      'market_price',
      'commercial',
      1,
      true,
      '{"api_version":"v1","publication_enabled":false}'::jsonb
    ),
    (
      'lorcast',
      'reconciliation',
      'monitor',
      10,
      true,
      '{"registration_required":false}'::jsonb
    ),
    (
      'tcgcsv',
      'reconciliation',
      'monitor',
      20,
      true,
      '{"registration_required":false,"category_id":71}'::jsonb
    )
) as desired(
  provider,
  entity_scope,
  authority_role,
  authority_rank,
  is_active,
  metadata
)
where games.slug = 'lorcana'
on conflict (game_id, provider, entity_scope) do update
set
  authority_role = excluded.authority_role,
  authority_rank = excluded.authority_rank,
  is_active = excluded.is_active,
  metadata = coalesce(public.catalog_source_authorities.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

with lorcana as (
  select id as game_id from public.games where slug = 'lorcana'
)
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
  lorcana.game_id,
  'justtcg',
  'disney-lorcana',
  '',
  '{
    "join": "exact_tcgplayer_product_id",
    "canonical_key": "lorcanajson.cards[].externalLinks.tcgPlayerId",
    "provider_key": "justtcg.cards[].tcgplayerId",
    "require_unique_on_both_sides": true,
    "unmatched_policy": "quarantine",
    "finish_policy": "preserve_provider_printing"
  }'::jsonb,
  '{
    "catalog_raw": true,
    "variant_payloads": true,
    "raw_market_prices": true,
    "market_price": false,
    "price_history": false,
    "publish_prices": false
  }'::jsonb,
  true,
  '{
    "status": "staged",
    "api_version": "v1",
    "audit_required": true,
    "publication_enabled": false
  }'::jsonb
from lorcana
on conflict (game_id, provider, source_game_slug, source_set_slug) do update
set
  product_key_rules = excluded.product_key_rules,
  pricing_capabilities = excluded.pricing_capabilities,
  is_active = excluded.is_active,
  metadata = coalesce(public.price_provider_mappings.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
