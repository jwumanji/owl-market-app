begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('OP07-059_sp_eb02', 'Gold Foxy Leader', array['EB02 Gold Foxy Leader', 'Foxy Gold Leader', 'Anime 25th Foxy Leader', 'Gold SP Leader Foxy'], 'high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the Gold Foxy Leader.'),
    ('OP06-020_sp_eb02', 'Gold Hody Jones Leader', array['EB02 Gold Hody Jones Leader', 'Hody Jones Gold Leader', 'Anime 25th Hody Jones Leader', 'Gold SP Leader Hody Jones'], 'high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the Gold Hody Jones Leader.'),
    ('OP08-098_sp_eb02', 'Gold Kalgara Leader', array['EB02 Gold Kalgara Leader', 'Kalgara Gold Leader', 'Anime 25th Kalgara Leader', 'Gold SP Leader Kalgara'], 'high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the Gold Kalgara Leader.'),
    ('EB01-040_sp_eb02', 'Gold Kyros Leader', array['EB02 Gold Kyros Leader', 'Kyros Gold Leader', 'Anime 25th Kyros Leader', 'Gold SP Leader Kyros'], 'high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the Gold Kyros Leader.'),
    ('EB01-021_sp_eb02', 'Gold Hannyabal Leader', array['EB02 Gold Hannyabal Leader', 'Hannyabal Gold Leader', 'Anime 25th Hannyabal Leader', 'Gold SP Leader Hannyabal'], 'high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the Gold Hannyabal Leader.')
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

with evidence(card_image_id, market_name, source_url, source_title, evidence_note) as (
  values
    ('OP07-059_sp_eb02', 'Gold Foxy Leader', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/foxy-op07-059', 'Foxy OP07-059 prices', 'Recorded marketplace sales repeatedly identify the exact EB02 printing as a Gold Leader, Gold Text SP Leader, or Gold SP Leader.'),
    ('OP06-020_sp_eb02', 'Gold Hody Jones Leader', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/hody-jones-op06-020', 'Hody Jones OP06-020 prices', 'Recorded marketplace sales repeatedly identify the exact EB02 printing as a Gold Leader or Special Alternate Art Gold Leader.'),
    ('OP08-098_sp_eb02', 'Gold Kalgara Leader', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/kalgara-op08-098', 'Kalgara OP08-098 prices', 'Recorded marketplace sales identify the exact EB02 printing as a Gold Alternate Art Leader, Gold Text, or Gold Leader.'),
    ('EB01-040_sp_eb02', 'Gold Kyros Leader', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/kyros-eb01-040', 'Kyros EB01-040 prices', 'Recorded marketplace sales repeatedly identify the exact EB02 printing as Kyros Gold Leader or SPR Gold Leader.'),
    ('EB01-021_sp_eb02', 'Gold Hannyabal Leader', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/hannyabal-eb01-021', 'Hannyabal EB01-021 prices', 'Recorded marketplace sales repeatedly identify the exact EB02 printing as Hannyabal Gold Leader or Gold SP Leader.')
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
  'marketplace',
  'PriceCharting',
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
