begin;

-- The Premium Card Collection -25th Edition- contains ten distinct promo
-- printings. Eight are already represented in the legacy catalog. Restore the
-- two missing printings without reusing the OP05 Nami SP or the English 1st
-- Anniversary rows, which are separate products with different market values.
with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), promo_set as (
  select sets.id
  from public.sets sets
  join one_piece on one_piece.id = sets.game_id
  where upper(sets.code) = 'P'
  limit 1
), alternate_art as (
  select variants.id
  from public.game_variants variants
  join one_piece on one_piece.id = variants.game_id
  where variants.code = 'ALTERNATE_ART'
  limit 1
), missing_printings(
  card_image_id,
  base_card_image_id,
  technical_name,
  image_url,
  tcg_product_id
) as (
  values
    (
      'OP01-013-25th-edition',
      'OP01-013',
      'Sanji - OP01-013 (Alternate Art)',
      'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_03.png?v2',
      'one-piece-card-game-one-piece-promotion-cards-sanji-op01-013-alternate-art-promo'
    ),
    (
      'OP01-016-25th-edition',
      'OP01-016',
      'Nami - OP01-016 (Alternate Art)',
      'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_05.png?v2',
      'one-piece-card-game-one-piece-promotion-cards-nami-op01-016-alternate-art-promo'
    )
)
insert into public.cards (
  card_image_id,
  card_number,
  name,
  name_base,
  variant_label,
  set_id,
  rarity,
  card_type,
  color,
  power,
  counter,
  life,
  cost,
  attribute,
  types,
  effect,
  trigger,
  artist,
  image_url,
  image_url_small,
  tcg_product_id,
  promo_source,
  is_stamped,
  is_serialized,
  character_id,
  promo_segment,
  printed_set_code,
  game_id,
  rarity_id,
  variant_id,
  game_payload,
  image_url_preview,
  image_source_url,
  image_mirror_status,
  region
)
select
  missing_printings.card_image_id,
  base.card_number,
  missing_printings.technical_name,
  coalesce(base.name_base, base.name),
  'Alternate Art',
  promo_set.id,
  base.rarity,
  base.card_type,
  base.color,
  base.power,
  base.counter,
  base.life,
  base.cost,
  base.attribute,
  base.types,
  base.effect,
  base.trigger,
  base.artist,
  missing_printings.image_url,
  missing_printings.image_url,
  missing_printings.tcg_product_id,
  'Premium Card Collection -25th Edition-',
  false,
  false,
  base.character_id,
  'Premium Card Collection -25th Edition-',
  base.printed_set_code,
  one_piece.id,
  base.rarity_id,
  alternate_art.id,
  jsonb_set(
    coalesce(base.game_payload, '{}'::jsonb),
    '{print}',
    coalesce(base.game_payload -> 'print', '{}'::jsonb)
      || jsonb_build_object(
        'promo_segment', 'Premium Card Collection -25th Edition-',
        'collection', 'Premium Card Collection -25th Edition-'
      ),
    true
  ),
  missing_printings.image_url,
  missing_printings.image_url,
  'external',
  'en'
from missing_printings
join one_piece on true
join promo_set on true
join alternate_art on true
join public.cards base
  on base.game_id = one_piece.id
 and base.card_image_id = missing_printings.base_card_image_id
on conflict (game_id, card_image_id) do update
set
  name = excluded.name,
  name_base = excluded.name_base,
  variant_label = excluded.variant_label,
  set_id = excluded.set_id,
  tcg_product_id = excluded.tcg_product_id,
  promo_source = excluded.promo_source,
  promo_segment = excluded.promo_segment,
  variant_id = excluded.variant_id,
  game_payload = excluded.game_payload,
  image_source_url = excluded.image_source_url,
  updated_at = now();

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), collection_cards(card_image_id) as (
  values
    ('P-001-alt-art-promo'),
    ('P-OP01-001'),
    ('OP01-013-25th-edition'),
    ('P-ST01-002'),
    ('OP01-016-25th-edition'),
    ('ST01-006-alt-art-promo'),
    ('P-ST01-008'),
    ('ST01-010-alt-art-promo'),
    ('P-OP01-022'),
    ('P-ST01-005')
)
update public.cards cards
set
  promo_source = 'Premium Card Collection -25th Edition-',
  promo_segment = 'Premium Card Collection -25th Edition-',
  game_payload = jsonb_set(
    coalesce(cards.game_payload, '{}'::jsonb),
    '{print}',
    coalesce(cards.game_payload -> 'print', '{}'::jsonb)
      || jsonb_build_object(
        'promo_segment', 'Premium Card Collection -25th Edition-',
        'collection', 'Premium Card Collection -25th Edition-'
      ),
    true
  ),
  updated_at = now()
from one_piece, collection_cards
where cards.game_id = one_piece.id
  and cards.card_image_id = collection_cards.card_image_id;

-- Keep the normalized catalog representation in step with the two restored
-- legacy rows and the corrected promotion-set membership.
with missing_printings(card_image_id, base_card_image_id) as (
  values
    ('OP01-013-25th-edition', 'OP01-013'),
    ('OP01-016-25th-edition', 'OP01-016')
), promo_reference as (
  select reference_printing.*
  from public.cards reference_card
  join public.card_printings reference_printing
    on reference_printing.legacy_card_id = reference_card.id
  join public.games games
    on games.id = reference_card.game_id
   and games.slug = 'one_piece'
  where reference_card.card_image_id = 'P-OP01-001'
  limit 1
)
insert into public.card_printings (
  game_id,
  card_definition_id,
  set_release_id,
  set_id,
  game_edition_id,
  legacy_card_id,
  collector_number,
  printed_name,
  printed_language_code,
  release_region_code,
  rarity_id,
  legacy_variant_label,
  image_url,
  payload_schema_version,
  source_payload,
  metadata
)
select
  target.game_id,
  base_printing.card_definition_id,
  promo_reference.set_release_id,
  promo_reference.set_id,
  promo_reference.game_edition_id,
  target.id,
  target.card_number,
  target.name,
  'en',
  null,
  target.rarity_id,
  target.variant_label,
  target.image_url,
  base_printing.payload_schema_version,
  base_printing.source_payload,
  jsonb_build_object(
    'bootstrap_status', 'restored_exact_promo_printing',
    'legacy_card_image_id', target.card_image_id,
    'collection', 'Premium Card Collection -25th Edition-'
  )
from missing_printings
join public.cards target
  on target.card_image_id = missing_printings.card_image_id
join public.games games
  on games.id = target.game_id
 and games.slug = 'one_piece'
join public.cards base
  on base.game_id = target.game_id
 and base.card_image_id = missing_printings.base_card_image_id
join public.card_printings base_printing
  on base_printing.legacy_card_id = base.id
join promo_reference on true
on conflict (legacy_card_id) do update
set
  set_release_id = excluded.set_release_id,
  set_id = excluded.set_id,
  legacy_variant_label = excluded.legacy_variant_label,
  image_url = excluded.image_url,
  metadata = excluded.metadata,
  updated_at = now();

with collection_cards(card_image_id) as (
  values
    ('P-001-alt-art-promo'),
    ('P-OP01-001'),
    ('OP01-013-25th-edition'),
    ('P-ST01-002'),
    ('OP01-016-25th-edition'),
    ('ST01-006-alt-art-promo'),
    ('P-ST01-008'),
    ('ST01-010-alt-art-promo'),
    ('P-OP01-022'),
    ('P-ST01-005')
), promo_reference as (
  select reference_printing.set_release_id, reference_printing.set_id
  from public.cards reference_card
  join public.card_printings reference_printing
    on reference_printing.legacy_card_id = reference_card.id
  join public.games games
    on games.id = reference_card.game_id
   and games.slug = 'one_piece'
  where reference_card.card_image_id = 'P-OP01-001'
  limit 1
)
update public.card_printings printings
set
  set_release_id = promo_reference.set_release_id,
  set_id = promo_reference.set_id,
  metadata = coalesce(printings.metadata, '{}'::jsonb)
    || jsonb_build_object('collection', 'Premium Card Collection -25th Edition-'),
  updated_at = now()
from collection_cards, promo_reference, public.cards cards, public.games games
where cards.card_image_id = collection_cards.card_image_id
  and games.id = cards.game_id
  and games.slug = 'one_piece'
  and printings.legacy_card_id = cards.id;

insert into public.commercial_variants (
  game_id,
  card_printing_id,
  variant_key,
  printed_language_code,
  edition_label,
  metadata
)
select
  printings.game_id,
  printings.id,
  'legacy',
  'en',
  'Alternate Art',
  jsonb_build_object(
    'bootstrap_status', 'restored_exact_promo_printing',
    'collection', 'Premium Card Collection -25th Edition-'
  )
from public.card_printings printings
join public.cards cards
  on cards.id = printings.legacy_card_id
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where cards.card_image_id in (
  'OP01-013-25th-edition',
  'OP01-016-25th-edition'
)
on conflict (card_printing_id, variant_key) do update
set
  printed_language_code = excluded.printed_language_code,
  edition_label = excluded.edition_label,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.card_external_ids (
  game_id,
  card_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  cards.game_id,
  cards.id,
  'justtcg',
  cards.tcg_product_id,
  'product_id',
  jsonb_build_object('source', 'cards.tcg_product_id')
from public.cards cards
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where cards.card_image_id in (
  'OP01-013-25th-edition',
  'OP01-016-25th-edition'
)
on conflict (card_id, provider, external_type) do update
set
  external_id = excluded.external_id,
  metadata = excluded.metadata,
  updated_at = now();

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    (
      'P-001-alt-art-promo',
      'Monkey.D.Luffy (25th Edition)',
      array['25th Edition Luffy', '25th Anniversary Luffy', 'Premium Card Collection Luffy', 'P-001 25th Luffy', '25th Edition Monkey D Luffy'],
      'high',
      'Official Bandai product imagery identifies this exact P-001 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'P-OP01-001',
      'Roronoa Zoro (25th Edition)',
      array['25th Edition Zoro', '25th Anniversary Zoro', 'Premium Card Collection Zoro', 'OP01-001 25th Zoro', '25th Edition Roronoa Zoro'],
      'high',
      'Official Bandai product imagery identifies this exact OP01-001 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'OP01-013-25th-edition',
      'Sanji (25th Edition)',
      array['25th Edition Sanji', '25th Anniversary Sanji', 'Premium Card Collection Sanji', 'OP01-013 25th Sanji'],
      'high',
      'Official Bandai product imagery identifies this exact OP01-013 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'P-ST01-002',
      'Usopp (25th Edition)',
      array['25th Edition Usopp', '25th Anniversary Usopp', 'Premium Card Collection Usopp', 'ST01-002 25th Usopp'],
      'high',
      'Official Bandai product imagery identifies this exact ST01-002 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'OP01-016-25th-edition',
      'Nami (25th Edition)',
      array['25th Edition Nami', '25th Anniversary Nami', 'Premium Card Collection Nami', 'OP01-016 25th Nami'],
      'high',
      'Official Bandai product imagery identifies this exact OP01-016 printing as part of the ten-card Premium Card Collection -25th Edition-. This is separate from the OP05 Pinwheel Nami SP.'
    ),
    (
      'ST01-006-alt-art-promo',
      'Tony Tony.Chopper (25th Edition)',
      array['25th Edition Chopper', '25th Anniversary Chopper', 'Premium Card Collection Chopper', 'ST01-006 25th Chopper', '25th Edition Tony Tony Chopper'],
      'high',
      'Official Bandai product imagery identifies this exact ST01-006 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'P-ST01-008',
      'Nico Robin (25th Edition)',
      array['25th Edition Robin', '25th Anniversary Robin', 'Premium Card Collection Robin', 'ST01-008 25th Robin', '25th Edition Nico Robin'],
      'high',
      'Official Bandai product imagery identifies this exact ST01-008 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'ST01-010-alt-art-promo',
      'Franky (25th Edition)',
      array['25th Edition Franky', '25th Anniversary Franky', 'Premium Card Collection Franky', 'ST01-010 25th Franky'],
      'high',
      'Official Bandai product imagery identifies this exact ST01-010 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'P-OP01-022',
      'Brook (25th Edition)',
      array['25th Edition Brook', '25th Anniversary Brook', 'Premium Card Collection Brook', 'OP01-022 25th Brook'],
      'high',
      'Official Bandai product imagery identifies this exact OP01-022 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    ),
    (
      'P-ST01-005',
      'Jinbe (25th Edition)',
      array['25th Edition Jinbe', '25th Anniversary Jinbe', 'Premium Card Collection Jinbe', 'ST01-005 25th Jinbe', '25th Edition Jimbei'],
      'high',
      'Official Bandai product imagery identifies this exact ST01-005 printing as part of the ten-card Premium Card Collection -25th Edition-.'
    )
)
insert into public.card_market_name_suggestions (
  game_id,
  card_id,
  proposed_market_name,
  proposed_aliases,
  confidence,
  research_note
)
select
  cards.game_id,
  cards.id,
  candidates.market_name,
  candidates.aliases,
  candidates.confidence,
  candidates.research_note
from one_piece
join public.cards cards on cards.game_id = one_piece.id
join candidates on candidates.card_image_id = cards.card_image_id
on conflict (card_id, proposed_market_name) do nothing;

with evidence(card_image_id, market_name, evidence_note) as (
  values
    ('P-001-alt-art-promo', 'Monkey.D.Luffy (25th Edition)', 'The official product page and card image identify P-001 as one of the ten 25th Edition cards.'),
    ('P-OP01-001', 'Roronoa Zoro (25th Edition)', 'The official product page and card image identify OP01-001 as one of the ten 25th Edition cards.'),
    ('OP01-013-25th-edition', 'Sanji (25th Edition)', 'The official product page and card image identify OP01-013 as one of the ten 25th Edition cards.'),
    ('P-ST01-002', 'Usopp (25th Edition)', 'The official product page and card image identify ST01-002 as one of the ten 25th Edition cards.'),
    ('OP01-016-25th-edition', 'Nami (25th Edition)', 'The official product page and card image identify OP01-016 as one of the ten 25th Edition cards.'),
    ('ST01-006-alt-art-promo', 'Tony Tony.Chopper (25th Edition)', 'The official product page and card image identify ST01-006 as one of the ten 25th Edition cards.'),
    ('P-ST01-008', 'Nico Robin (25th Edition)', 'The official product page and card image identify ST01-008 as one of the ten 25th Edition cards.'),
    ('ST01-010-alt-art-promo', 'Franky (25th Edition)', 'The official product page and card image identify ST01-010 as one of the ten 25th Edition cards.'),
    ('P-OP01-022', 'Brook (25th Edition)', 'The official product page and card image identify OP01-022 as one of the ten 25th Edition cards.'),
    ('P-ST01-005', 'Jinbe (25th Edition)', 'The official product page and card image identify ST01-005 as one of the ten 25th Edition cards.')
)
insert into public.card_market_name_evidence (
  suggestion_id,
  source_type,
  source_name,
  source_url,
  source_title,
  evidence_note
)
select
  suggestions.id,
  'official',
  'Bandai',
  'https://en.onepiece-cardgame.com/products/other/cardcollection25th.php',
  'Premium Card Collection -25th Edition-',
  evidence.evidence_note
from evidence
join public.cards cards on cards.card_image_id = evidence.card_image_id
join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
join public.card_market_name_suggestions suggestions
  on suggestions.card_id = cards.id
 and suggestions.proposed_market_name = evidence.market_name
on conflict (suggestion_id, source_url) do nothing;

commit;
