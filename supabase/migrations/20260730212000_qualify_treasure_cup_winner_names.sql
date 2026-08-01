begin;

with revisions(card_image_id, old_name, new_name, aliases, research_note) as (
  values
    ('P-ST01-013', 'Treasure Cup Zoro', 'Treasure Cup Zoro (2023 Winner)', array['Treasure Cup Zoro Winner', '2023 Treasure Cup Zoro', '2023 Treasure Cup Zoro Winner', 'TC Zoro Winner', 'ST01 Treasure Cup Zoro'], 'Official 2023 Treasure Cup prizing identifies this exact ST01-013 Zoro printing. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP01-121', 'Treasure Cup Yamato', 'Treasure Cup Yamato (2024 Winner)', array['Treasure Cup Yamato Winner', '2024 Treasure Cup Yamato', '2024 Treasure Cup Yamato Winner', 'TC Yamato Winner', 'OP01 Treasure Cup Yamato'], 'Official 2024 Treasure Cup prizing identifies this exact OP01-121 Yamato printing. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP06-069', 'Treasure Cup Reiju', 'Treasure Cup Reiju (2024 Winner)', array['Treasure Cup Reiju Winner', '2024 Treasure Cup Reiju', '2024 Treasure Cup Reiju Winner', 'TC Reiju Winner', 'Treasure Cup Vinsmoke Reiju'], 'TCGplayer identifies this exact OP06-069 printing as a 2024 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-EB01-012', 'Treasure Cup Cavendish', 'Treasure Cup Cavendish (2024 Winner)', array['Treasure Cup Cavendish Winner', '2024 Treasure Cup Cavendish', '2024 Treasure Cup Cavendish Winner', 'TC Cavendish Winner', 'EB01 Treasure Cup Cavendish'], 'TCGplayer identifies this exact EB01-012 printing as a 2024 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-EB01-006', 'Treasure Cup Chopper', 'Treasure Cup Chopper (2024 Winner)', array['Treasure Cup Chopper Winner', '2024 Treasure Cup Chopper', '2024 Treasure Cup Chopper Winner', 'TC Chopper Winner', 'Treasure Cup Tony Tony Chopper'], 'TCGplayer identifies this exact EB01-006 printing as a 2024 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP06-093', 'Treasure Cup Perona', 'Treasure Cup Perona (2024 Winner)', array['Treasure Cup Perona Winner', '2024 Treasure Cup Perona', '2024 Treasure Cup Perona Winner', 'TC Perona Winner', 'OP06 Treasure Cup Perona'], 'TCGplayer identifies this exact OP06-093 printing as a 2024 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP10-005', 'Treasure Cup Sanji', 'Treasure Cup Sanji (2025 Winner)', array['Treasure Cup Sanji Winner', '2025 Treasure Cup Sanji', '2025 Treasure Cup Sanji Winner', 'TC Sanji Winner', 'OP10 Treasure Cup Sanji'], 'TCGplayer identifies this exact OP10-005 printing as a 2025 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP12-015', 'Treasure Cup Luffy', 'Treasure Cup Luffy (2025 Winner)', array['Treasure Cup Luffy Winner', '2025 Treasure Cup Luffy', '2025 Treasure Cup Luffy Winner', 'TC Luffy Winner', 'OP12 Treasure Cup Luffy'], 'TCGplayer identifies this exact OP12-015 printing as a 2025 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-EB01-048', 'Treasure Cup Laboon', 'Treasure Cup Laboon (2025 Winner)', array['Treasure Cup Laboon Winner', '2025 Treasure Cup Laboon', '2025 Treasure Cup Laboon Winner', 'TC Laboon Winner', 'EB01 Treasure Cup Laboon'], 'TCGplayer identifies this exact EB01-048 printing as a 2025 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.'),
    ('P-OP09-069', 'Treasure Cup Law', 'Treasure Cup Law (2025 Winner)', array['Treasure Cup Law Winner', '2025 Treasure Cup Law', '2025 Treasure Cup Law Winner', 'TC Law Winner', 'Treasure Cup Trafalgar Law'], 'TCGplayer identifies this exact OP09-069 printing as a 2025 Treasure Cup prize. Winner denotes an earned tournament prize card, not exclusively the first-place Champion tier.')
), target_cards as (
  select
    cards.id,
    revisions.old_name,
    revisions.new_name,
    revisions.aliases,
    revisions.research_note
  from revisions
  join public.cards cards on cards.card_image_id = revisions.card_image_id
  join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
)
update public.card_market_name_suggestions suggestions
set
  proposed_market_name = target_cards.new_name,
  proposed_aliases = target_cards.aliases,
  research_note = target_cards.research_note,
  updated_at = now()
from target_cards
where suggestions.card_id = target_cards.id
  and suggestions.status = 'pending'
  and suggestions.proposed_market_name = target_cards.old_name;

with evidence(card_image_id, market_name, source_url, source_title, evidence_note) as (
  values
    ('P-ST01-013', 'Treasure Cup Zoro (2023 Winner)', 'https://en.onepiece-cardgame.com/events/2023/officialevents/treasure_cup_february.php', 'Treasure Cup February 2023', 'Official prize list identifies ST01-013 Zoro as a Top 8 Treasure Cup prize.'),
    ('P-OP01-121', 'Treasure Cup Yamato (2024 Winner)', 'https://en.onepiece-cardgame.com/events/2024/treasure_cup_may/', 'Treasure Cup May-June 2024', 'Official prize list identifies OP01-121 Yamato as a Top 64 Treasure Cup prize.')
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
