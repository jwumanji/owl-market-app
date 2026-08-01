begin;

-- Restore the distinct P-041 attendee promo before suggesting its collector
-- name. The three existing P-041 rows are tournament and regional prize
-- printings, so reusing any of them would combine unrelated market values.
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
), source_card as (
  select cards.*
  from public.cards cards
  join one_piece on one_piece.id = cards.game_id
  where cards.card_image_id = 'P-041-other'
  limit 1
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
  'P-041-bandai-fest-23-24',
  'P-041',
  'Monkey.D.Luffy (BANDAI CARD GAMES Fest 23-24 World Tour)',
  coalesce(source_card.name_base, 'Monkey.D.Luffy'),
  'Event Promo',
  promo_set.id,
  source_card.rarity,
  source_card.card_type,
  source_card.color,
  source_card.power,
  source_card.counter,
  source_card.life,
  source_card.cost,
  source_card.attribute,
  source_card.types,
  source_card.effect,
  source_card.trigger,
  source_card.artist,
  'https://tcgplayer-cdn.tcgplayer.com/product/532752_in_1000x1000.jpg',
  'https://tcgplayer-cdn.tcgplayer.com/product/532752_in_1000x1000.jpg',
  'one-piece-card-game-one-piece-promotion-cards-monkey-d-luffy-041-bandai-card-games-fest-23-24-world-tour-promo',
  'BANDAI CARD GAMES Fest 23-24 World Tour',
  true,
  false,
  source_card.character_id,
  'Attendance Promo',
  'P',
  one_piece.id,
  source_card.rarity_id,
  alternate_art.id,
  jsonb_set(
    coalesce(source_card.game_payload, '{}'::jsonb),
    '{print}',
    coalesce(source_card.game_payload -> 'print', '{}'::jsonb)
      || jsonb_build_object(
        'promo_segment', 'Attendance Promo',
        'event', 'BANDAI CARD GAMES Fest 23-24 World Tour',
        'is_stamped', true
      ),
    true
  ),
  'https://tcgplayer-cdn.tcgplayer.com/product/532752_in_1000x1000.jpg',
  'https://tcgplayer-cdn.tcgplayer.com/product/532752_in_1000x1000.jpg',
  'external',
  'en'
from one_piece
join promo_set on true
join alternate_art on true
join source_card on true
on conflict (game_id, card_image_id) do update
set
  name = excluded.name,
  name_base = excluded.name_base,
  variant_label = excluded.variant_label,
  set_id = excluded.set_id,
  tcg_product_id = excluded.tcg_product_id,
  promo_source = excluded.promo_source,
  promo_segment = excluded.promo_segment,
  is_stamped = excluded.is_stamped,
  variant_id = excluded.variant_id,
  game_payload = excluded.game_payload,
  image_source_url = excluded.image_source_url,
  updated_at = now();

with source_printing as (
  select printings.*
  from public.cards cards
  join public.card_printings printings
    on printings.legacy_card_id = cards.id
  join public.games games
    on games.id = cards.game_id
   and games.slug = 'one_piece'
  where cards.card_image_id = 'P-041-other'
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
  source_printing.card_definition_id,
  source_printing.set_release_id,
  source_printing.set_id,
  source_printing.game_edition_id,
  target.id,
  target.card_number,
  target.name,
  'en',
  null,
  target.rarity_id,
  target.variant_label,
  target.image_url,
  source_printing.payload_schema_version,
  source_printing.source_payload,
  jsonb_build_object(
    'bootstrap_status', 'restored_exact_event_printing',
    'legacy_card_image_id', target.card_image_id,
    'event', 'BANDAI CARD GAMES Fest 23-24 World Tour'
  )
from public.cards target
join public.games games
  on games.id = target.game_id
 and games.slug = 'one_piece'
join source_printing on true
where target.card_image_id = 'P-041-bandai-fest-23-24'
on conflict (legacy_card_id) do update
set
  legacy_variant_label = excluded.legacy_variant_label,
  image_url = excluded.image_url,
  metadata = excluded.metadata,
  updated_at = now();

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
  'BANDAI Fest 23-24 Event Promo',
  jsonb_build_object(
    'bootstrap_status', 'restored_exact_event_printing',
    'event', 'BANDAI CARD GAMES Fest 23-24 World Tour'
  )
from public.card_printings printings
join public.cards cards
  on cards.id = printings.legacy_card_id
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where cards.card_image_id = 'P-041-bandai-fest-23-24'
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
where cards.card_image_id = 'P-041-bandai-fest-23-24'
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
      'P-041-bandai-fest-23-24',
      'Gear 5 Luffy (BANDAI Fest 23-24)',
      array['BANDAI Fest Gear 5 Luffy', 'P-041 Gear 5 Luffy', 'BCG Fest 23-24 Luffy', 'World Tour Gear 5 Luffy', 'Nika Luffy BANDAI Fest'],
      'high',
      'Editorial and marketplace references identify the distinct P-041 World Tour attendee promo as Gear 5 Luffy and preserve the 23-24 event year.'
    ),
    (
      'P-P-080',
      'SSG Luffy (BANDAI Fest 24-25)',
      array['BANDAI Fest SSG Luffy', 'Egghead SSG Luffy', 'P-080 BANDAI Fest Luffy', 'BCG Fest 24-25 Luffy', 'SSG Luffy P-080'],
      'high',
      'Bandai confirms P-080 as the 24-25 attendee giveaway, while collector marketplace listings consistently call the artwork SSG Luffy or Egghead SSG Luffy.'
    ),
    (
      'P-OP11-106',
      'Zeus Playmat Promo (BANDAI Fest 24-25)',
      array['BANDAI Fest Zeus', 'OP11-106 Zeus Promo', 'Zeus Official Playmat Promo', 'Nami Zeus Playmat Promo', 'BCG Fest 24-25 Zeus'],
      'high',
      'TCGplayer and completed-sale references identify this exact OP11-106 printing as the official playmat BANDAI Card Games Fest 24-25 promo.'
    ),
    (
      'ST13-001-premium-card-collection',
      'Gold Text Sabo (BANDAI Fest 24-25)',
      array['Sabo Gold Text Leader', 'Leader Collection Sabo', 'ST13-001 Gold Text Sabo', 'BANDAI Fest Sabo Leader', 'Gold Leader Sabo'],
      'high',
      'Collector marketplaces distinguish this Leader Collection printing by its gold leader and power text; the six-card collection was sold at BANDAI Fest 24-25.'
    ),
    (
      'ST13-002-premium-card-collection',
      'Gold Text Ace (BANDAI Fest 24-25)',
      array['Ace Gold Text Leader', 'Leader Collection Ace', 'ST13-002 Gold Text Ace', 'BANDAI Fest Ace Leader', 'Gold Leader Portgas D Ace'],
      'high',
      'Collector marketplaces distinguish this Leader Collection printing by its gold leader and power text; the six-card collection was sold at BANDAI Fest 24-25.'
    ),
    (
      'ST13-003-premium-card-collection',
      'Gold Text Luffy (BANDAI Fest 24-25)',
      array['Luffy Gold Text Leader', 'Leader Collection Luffy', 'ST13-003 Gold Text Luffy', 'BANDAI Fest Leader Luffy', 'Gold Text Leader Collection Luffy'],
      'high',
      'Investor references explicitly call this ST13-003 printing Gold-Text Leader Collection Luffy and distinguish it from the silver-text version.'
    ),
    (
      'ST03-001-premium-card-collection',
      'Gold Text Crocodile (BANDAI Fest 24-25)',
      array['Crocodile Gold Text Leader', 'Leader Collection Crocodile', 'ST03-001 Gold Text Crocodile', 'BANDAI Fest Crocodile Leader', 'Gold Leader Crocodile'],
      'high',
      'Collector marketplaces distinguish this Leader Collection printing by its gold leader and power text; the six-card collection was sold at BANDAI Fest 24-25.'
    ),
    (
      'ST04-001-premium-card-collection',
      'Gold Text Kaido (BANDAI Fest 24-25)',
      array['Kaido Gold Text Leader', 'Leader Collection Kaido', 'ST04-001 Gold Text Kaido', 'BANDAI Fest Kaido Leader', 'Gold Leader Kaido'],
      'high',
      'Marketplace sales repeatedly use Gold Text Kaido for this exact Leader Collection ST04-001 printing.'
    ),
    (
      'ST02-001-premium-card-collection',
      'Gold Text Eustass Kid (BANDAI Fest 24-25)',
      array['Kid Gold Text Leader', 'Leader Collection Kid', 'ST02-001 Gold Text Kid', 'BANDAI Fest Kid Leader', 'Gold Leader Eustass Kid'],
      'high',
      'Collector marketplaces distinguish this Leader Collection printing by its gold leader and power text; the six-card collection was sold at BANDAI Fest 24-25.'
    ),
    (
      'P-001-premium-card-collection',
      'Luffy (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Luffy', 'P-001 BANDAI Fest Luffy', 'BCG Fest Collection Luffy', 'Premium Card Collection 23-24 Luffy'],
      'high',
      'Bandai identifies this exact P-001 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
    ),
    (
      'OP03-116-premium-card-collection',
      'Shirahoshi (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Shirahoshi', 'OP03-116 BANDAI Fest Shirahoshi', 'BCG Fest Collection Shirahoshi', 'Premium Card Collection 23-24 Shirahoshi'],
      'high',
      'Bandai identifies this exact OP03-116 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
    ),
    (
      'P-030-premium-card-collection',
      'Jinbe (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Jinbe', 'P-030 BANDAI Fest Jinbe', 'BCG Fest Collection Jinbe', 'Premium Card Collection 23-24 Jinbe', 'BANDAI Fest Jimbei'],
      'high',
      'Bandai identifies this exact P-030 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
    ),
    (
      'ST06-006-premium-card-collection',
      'Tashigi (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Tashigi', 'ST06-006 BANDAI Fest Tashigi', 'BCG Fest Collection Tashigi', 'Premium Card Collection 23-24 Tashigi'],
      'high',
      'Bandai identifies this exact ST06-006 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
    ),
    (
      'ST03-007-premium-card-collection',
      'Sentomaru (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Sentomaru', 'ST03-007 BANDAI Fest Sentomaru', 'BCG Fest Collection Sentomaru', 'Premium Card Collection 23-24 Sentomaru'],
      'high',
      'Bandai identifies this exact ST03-007 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
    ),
    (
      'ST04-008-premium-card-collection',
      'Jack (BANDAI Fest 23-24 Collection)',
      array['BANDAI Fest 23-24 Collection Jack', 'ST04-008 BANDAI Fest Jack', 'BCG Fest Collection Jack', 'Premium Card Collection 23-24 Jack'],
      'high',
      'Bandai identifies this exact ST04-008 alternative printing as one of the twelve cards in the BANDAI Card Games Fest 23-24 Premium Card Collection.'
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

with evidence(card_image_id, market_name, source_type, source_name, source_url, source_title, evidence_note) as (
  values
    ('P-041-bandai-fest-23-24', 'Gear 5 Luffy (BANDAI Fest 23-24)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2024/05/08/one-piece-card-game-a-world-tour-original-monkey-d-luffy-promotional-cards-p-041/', 'A World Tour Original: Monkey D. Luffy P-041', 'Identifies the 23-24 World Tour P-041 attendee promo and its Gear 5 artwork.'),
    ('P-P-080', 'SSG Luffy (BANDAI Fest 24-25)', 'official', 'Bandai', 'https://www.bandaicardgames-fest.com/24-25/en/manila/giveaway/02_34.html', 'BANDAI Card Games Fest 24-25 free giveaways', 'Official event page identifies P-080 Monkey.D.Luffy as the 24-25 attendee souvenir.'),
    ('P-P-080', 'SSG Luffy (BANDAI Fest 24-25)', 'marketplace', 'Carousell', 'https://www.carousell.sg/p/one-piece-card-game-monkey-d-luffy-ssg-character-card-bandai-card-games-fest-p-080-1449071913/', 'Monkey D. Luffy SSG Character Card P-080', 'Marketplace title uses SSG Luffy for this exact P-080 BANDAI Fest printing.'),
    ('P-OP11-106', 'Zeus Playmat Promo (BANDAI Fest 24-25)', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-fist-of-divine-speed/zeus-bandai-card-games-fest-24-25-op11-106', 'Zeus BANDAI Card Games Fest 24-25 OP11-106', 'Completed sales and TCGplayer listings identify the exact official playmat event printing.'),
    ('ST13-001-premium-card-collection', 'Gold Text Sabo (BANDAI Fest 24-25)', 'marketplace', 'CardTrader', 'https://www.cardtrader.com/it/cards/sabo-gold-text-premium-card-collection-leader-collection-premium-card-collection', 'Sabo Gold Text Leader Collection', 'Marketplace identity explicitly labels ST13-001 as Gold Text and Leader Collection.'),
    ('ST13-002-premium-card-collection', 'Gold Text Ace (BANDAI Fest 24-25)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2024/09/23/one-piece-card-game-premium-card-collection-leader-collection-release-date-price-where-to-buy/', 'Premium Card Collection Leader Collection', 'Lists Portgas.D.Ace ST13-002 among the six Leader Collection cards sold at BANDAI Fest 24-25.'),
    ('ST13-003-premium-card-collection', 'Gold Text Luffy (BANDAI Fest 24-25)', 'community', 'TCGIntel', 'https://www.tcgintel.app/', 'Monkey.D.Luffy Gold-Text Leader Collection', 'Investor reference distinguishes the ST13-003 parallel by its gold name text and event-only BANDAI Fest supply.'),
    ('ST03-001-premium-card-collection', 'Gold Text Crocodile (BANDAI Fest 24-25)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2024/09/23/one-piece-card-game-premium-card-collection-leader-collection-release-date-price-where-to-buy/', 'Premium Card Collection Leader Collection', 'Lists Crocodile ST03-001 among the six Leader Collection cards sold at BANDAI Fest 24-25.'),
    ('ST04-001-premium-card-collection', 'Gold Text Kaido (BANDAI Fest 24-25)', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-japanese-starter-deck-4-animal-kingdom-pirates/kaido-leader-collection-st04-001', 'Kaido Leader Collection ST04-001', 'Completed marketplace sales repeatedly identify this exact printing as Gold Text Kaido.'),
    ('ST02-001-premium-card-collection', 'Gold Text Eustass Kid (BANDAI Fest 24-25)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2024/09/23/one-piece-card-game-premium-card-collection-leader-collection-release-date-price-where-to-buy/', 'Premium Card Collection Leader Collection', 'Lists Eustass Kid ST02-001 among the six Leader Collection cards sold at BANDAI Fest 24-25.'),
    ('P-001-premium-card-collection', 'Luffy (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.'),
    ('OP03-116-premium-card-collection', 'Shirahoshi (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.'),
    ('P-030-premium-card-collection', 'Jinbe (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.'),
    ('ST06-006-premium-card-collection', 'Tashigi (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.'),
    ('ST03-007-premium-card-collection', 'Sentomaru (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.'),
    ('ST04-008-premium-card-collection', 'Jack (BANDAI Fest 23-24 Collection)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/products/other/cardcollection_bcgfest23-24.php', 'Premium Card Collection BANDAI Card Games Fest 23-24 Edition', 'Official product page confirms the twelve-card alternative-art collection and its 23-24 event identity.')
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
  evidence.source_type,
  evidence.source_name,
  evidence.source_url,
  evidence.source_title,
  evidence.evidence_note
from evidence
join public.cards cards on cards.card_image_id = evidence.card_image_id
join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
join public.card_market_name_suggestions suggestions
  on suggestions.card_id = cards.id
 and suggestions.proposed_market_name = evidence.market_name
on conflict (suggestion_id, source_url) do nothing;

commit;
