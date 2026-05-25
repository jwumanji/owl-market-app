-- Migration v34: Hidden Pokemon game seed.
-- Run after v33. This creates the first non-One Piece game boundary without
-- exposing it publicly or enabling provider sync.
--
-- This migration is intentionally additive:
-- - inserts the hidden Pokemon game row
-- - seeds starter game-scoped rarity, variant, and set-type taxonomies
-- - adds an inactive provider mapping placeholder for future adapter work

begin;

with pokemon_game as (
  insert into public.games (slug, name, is_active, is_public, metadata)
  values (
    'pokemon',
    'Pokemon TCG',
    true,
    false,
    jsonb_build_object(
      'route_slug', 'pokemon',
      'source', 'owl_market_hidden_seed',
      'adapter_status', 'seeded',
      'public_release_status', 'hidden',
      'notes', 'Taxonomy and provider mappings are starter values for admin-only adapter development.'
    )
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    is_active = true,
    is_public = false,
    metadata = public.games.metadata || excluded.metadata,
    updated_at = now()
  returning id as game_id
),
rarity_seed(code, name, sort_order, metadata) as (
  values
    ('COMMON', 'Common', 100, '{"source":"starter_taxonomy"}'::jsonb),
    ('UNCOMMON', 'Uncommon', 110, '{"source":"starter_taxonomy"}'::jsonb),
    ('RARE', 'Rare', 120, '{"source":"starter_taxonomy"}'::jsonb),
    ('DOUBLE_RARE', 'Double Rare', 130, '{"source":"starter_taxonomy","symbols":["RR"]}'::jsonb),
    ('ULTRA_RARE', 'Ultra Rare', 140, '{"source":"starter_taxonomy","symbols":["UR"]}'::jsonb),
    ('ILLUSTRATION_RARE', 'Illustration Rare', 150, '{"source":"starter_taxonomy","symbols":["IR"]}'::jsonb),
    ('SPECIAL_ILLUSTRATION_RARE', 'Special Illustration Rare', 160, '{"source":"starter_taxonomy","symbols":["SIR"]}'::jsonb),
    ('HYPER_RARE', 'Hyper Rare', 170, '{"source":"starter_taxonomy","symbols":["HR"]}'::jsonb),
    ('ACE_SPEC_RARE', 'ACE SPEC Rare', 180, '{"source":"starter_taxonomy","symbols":["ACE SPEC"]}'::jsonb),
    ('PROMO', 'Promo', 190, '{"source":"starter_taxonomy"}'::jsonb),
    ('UNKNOWN', 'Unknown', 1000, '{"source":"starter_taxonomy","fallback":true}'::jsonb)
)
insert into public.game_rarities (game_id, code, name, sort_order, metadata)
select pokemon_game.game_id, rarity_seed.code, rarity_seed.name, rarity_seed.sort_order, rarity_seed.metadata
from pokemon_game
cross join rarity_seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = public.game_rarities.metadata || excluded.metadata,
  is_active = true,
  updated_at = now();

with pokemon_game as (
  select id as game_id
  from public.games
  where slug = 'pokemon'
),
variant_seed(code, name, sort_order, metadata) as (
  values
    ('STANDARD', 'Standard', 10, '{"source":"starter_taxonomy"}'::jsonb),
    ('HOLO', 'Holo', 20, '{"source":"starter_taxonomy"}'::jsonb),
    ('REVERSE_HOLO', 'Reverse Holo', 30, '{"source":"starter_taxonomy"}'::jsonb),
    ('FULL_ART', 'Full Art', 40, '{"source":"starter_taxonomy"}'::jsonb),
    ('ALT_ART', 'Alt Art', 50, '{"source":"starter_taxonomy"}'::jsonb),
    ('SECRET', 'Secret', 60, '{"source":"starter_taxonomy"}'::jsonb),
    ('PROMO_STAMP', 'Promo Stamp', 70, '{"source":"starter_taxonomy"}'::jsonb)
)
insert into public.game_variants (game_id, code, name, sort_order, metadata)
select pokemon_game.game_id, variant_seed.code, variant_seed.name, variant_seed.sort_order, variant_seed.metadata
from pokemon_game
cross join variant_seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = public.game_variants.metadata || excluded.metadata,
  is_active = true,
  updated_at = now();

with pokemon_game as (
  select id as game_id
  from public.games
  where slug = 'pokemon'
),
set_type_seed(code, name, sort_order, metadata) as (
  values
    ('EXPANSION', 'Expansion', 10, '{"source":"starter_taxonomy"}'::jsonb),
    ('SPECIAL_SET', 'Special Set', 20, '{"source":"starter_taxonomy"}'::jsonb),
    ('PROMO', 'Promotion Cards', 30, '{"source":"starter_taxonomy"}'::jsonb),
    ('THEME_DECK', 'Theme Deck', 40, '{"source":"starter_taxonomy"}'::jsonb),
    ('TRAINER_KIT', 'Trainer Kit', 50, '{"source":"starter_taxonomy"}'::jsonb)
)
insert into public.game_set_types (game_id, code, name, sort_order, metadata)
select pokemon_game.game_id, set_type_seed.code, set_type_seed.name, set_type_seed.sort_order, set_type_seed.metadata
from pokemon_game
cross join set_type_seed
on conflict (game_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  metadata = public.game_set_types.metadata || excluded.metadata,
  is_active = true,
  updated_at = now();

with pokemon_game as (
  select id as game_id
  from public.games
  where slug = 'pokemon'
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
  pokemon_game.game_id,
  'justtcg',
  'pokemon',
  '',
  '{
    "status": "placeholder",
    "card_product_key": "card_external_ids[provider=justtcg,external_type=product_id].external_id",
    "match_priority": ["product_id", "set_number_name", "set_number"]
  }'::jsonb,
  '{
    "card_catalog": false,
    "card_prices": false,
    "price_history": false,
    "sealed_products": false
  }'::jsonb,
  false,
  '{
    "source": "owl_market_hidden_seed",
    "adapter_status": "planned",
    "notes": "Verify provider game slug and product keys before enabling."
  }'::jsonb
from pokemon_game
on conflict (game_id, provider, source_game_slug, source_set_slug) do update
set
  product_key_rules = excluded.product_key_rules,
  pricing_capabilities = excluded.pricing_capabilities,
  metadata = public.price_provider_mappings.metadata || excluded.metadata,
  is_active = false,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
