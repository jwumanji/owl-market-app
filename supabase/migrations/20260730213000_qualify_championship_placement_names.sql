begin;

with replacements(card_image_id, old_name, market_name, aliases, research_note) as (
  values
    ('P-OP02-096', 'Championship Kuzan', 'Championship Kuzan (2023 Top 32)', array['Championship Kuzan', '2023 Championship Kuzan', '2023 Regional Top 32 Kuzan', 'Top 32 Kuzan', 'OP02 Championship Kuzan'], 'Official Championship 2023 Regional prizing identifies this exact OP02-096 Kuzan printing as a Top 32 prize.'),
    ('P-OP02-099', 'Championship Sakazuki', 'Championship Sakazuki (2023 Top 16)', array['Championship Sakazuki', '2023 Championship Sakazuki', '2023 Regional Top 16 Sakazuki', 'Top 16 Sakazuki', 'OP02 Championship Sakazuki'], 'Official Championship 2023 Regional prizing identifies this exact OP02-099 Sakazuki printing as a Top 16 prize.'),
    ('P-OP05-086', 'Championship Vivi', 'Championship Vivi (2024 Winner)', array['Championship Vivi', '2024 Championship Vivi Winner', '2024 Store Regional Winner Vivi', 'Regional Winner Vivi', 'Championship Nefeltari Vivi'], 'Official October 2024 Store Regional prizing identifies this exact OP05-086 Nefeltari Vivi printing as the Champion prize.'),
    ('P-OP05-091', 'Championship Rebecca', 'Championship Rebecca (2024 Top 8)', array['Championship Rebecca', '2024 Championship Rebecca', '2024 Regional Top 8 Rebecca', 'Top 8 Rebecca', 'October Championship Rebecca'], 'Official October 2024 Regional prizing identifies this exact OP05-091 Rebecca printing as a Top 8 prize.'),
    ('P-OP05-067', 'Championship Zoro-Juurou', 'Championship Zoro-Juurou (2025-26 Finalist)', array['Championship Zoro-Juurou', '2025-26 Championship Zoro-Juurou', 'CS 25-26 Finalist Zoro-Juurou', 'Finalist Zoro-Juurou', 'Championship Zorojuro'], 'The official product identity places this exact OP05-067 printing in the CS 25-26 Event Pack Finalist version.'),
    ('P-OP06-101', 'Championship O-Nami', 'Championship O-Nami (2025-26 Finalist)', array['Championship O-Nami', '2025-26 Championship O-Nami', 'CS 25-26 Finalist O-Nami', 'Finalist O-Nami', 'Championship Onami'], 'The official product identity places this exact OP06-101 printing in the CS 25-26 Event Pack Finalist version.'),
    ('P-OP07-066', 'Championship Chopper', 'Championship Chopper (2025-26 Finalist)', array['Championship Chopper', '2025-26 Championship Chopper', 'CS 25-26 Finalist Chopper', 'Finalist Chopper', 'Championship Tony Tony Chopper'], 'The official product identity places this exact OP07-066 printing in the CS 25-26 Finalist Card Set 1.'),
    ('P-OP09-050', 'Championship Nami', 'Championship Nami (2025-26 Top 64)', array['Championship Nami', '2025-26 Championship Nami', '2025 Regional Top 64 Nami', 'Top 64 Nami', 'OP09 Championship Nami'], 'Championship 25-26 Season 1 prizing identifies this exact OP09-050 Nami printing as the Top 64 prize.'),
    ('P-OP09-076', 'Championship Zoro', 'Championship Zoro (2025-26 Top 16)', array['Championship Zoro', '2025-26 Championship Zoro', '2025 Regional Top 16 Zoro', 'Top 16 Zoro', 'Championship Roronoa Zoro'], 'Championship 25-26 Season 1 prizing identifies this exact OP09-076 Zoro printing as the Top 16 prize.'),
    ('P-OP09-065', 'Championship Sanji', 'Championship Sanji (2025-26 Top 8)', array['Championship Sanji', '2025-26 Championship Sanji', '2025 Regional Top 8 Sanji', 'Top 8 Sanji', 'OP09 Championship Sanji'], 'Championship 25-26 Season 1 prizing identifies this exact OP09-065 Sanji printing as the Top 8 prize.'),
    ('P-OP09-004', 'Championship Shanks', 'Championship Shanks (2025-26 Top 8)', array['Championship Shanks', '2025-26 Championship Shanks', '2025 Regional Top 8 Shanks', 'Top 8 Shanks', 'OP09 Championship Shanks'], 'Official Championship 25-26 Season 2 prizing identifies this exact OP09-004 Shanks printing as the Top 8 prize.'),
    ('P-OP14-112', 'Championship Boa (Top 64 Winner)', 'Championship Boa (2026-27 Top 64)', array['Championship Boa', '2026-27 Championship Boa', '2026 Regional Top 64 Boa', 'Top 64 Boa', 'Boa Top 64 Prize', 'OP14-112 Top 64 Boa', 'Championship Boa Hancock'], 'Official and marketplace sources identify this exact OP14-112 Boa Hancock printing as the Championship 26-27 Season 1 Top 64 prize.')
), updated_suggestions as (
  update public.card_market_name_suggestions suggestions
  set
    proposed_market_name = replacements.market_name,
    proposed_aliases = replacements.aliases,
    confidence = 'high',
    research_note = replacements.research_note,
    updated_at = now()
  from public.cards cards
  join replacements on replacements.card_image_id = cards.card_image_id
  where suggestions.card_id = cards.id
    and suggestions.proposed_market_name = replacements.old_name
  returning suggestions.id, suggestions.card_id, suggestions.game_id, suggestions.status,
    suggestions.proposed_market_name, suggestions.proposed_aliases
), updated_cards as (
  update public.cards cards
  set
    market_name = updated_suggestions.proposed_market_name,
    market_name_updated_at = now()
  from updated_suggestions
  where updated_suggestions.status = 'approved'
    and cards.id = updated_suggestions.card_id
    and cards.game_id = updated_suggestions.game_id
  returning updated_suggestions.id
), removed_aliases as (
  delete from public.card_market_aliases aliases
  using updated_suggestions
  where updated_suggestions.status = 'approved'
    and aliases.source_suggestion_id = updated_suggestions.id
  returning aliases.id
)
insert into public.card_market_aliases (
  game_id,
  card_id,
  alias,
  source_suggestion_id,
  approved_at,
  updated_at
)
select
  updated_suggestions.game_id,
  updated_suggestions.card_id,
  alias_value,
  updated_suggestions.id,
  now(),
  now()
from updated_suggestions
cross join lateral unnest(updated_suggestions.proposed_aliases) alias_value
where updated_suggestions.status = 'approved'
on conflict on constraint card_market_aliases_card_alias_key
do update set
  alias = excluded.alias,
  source_suggestion_id = excluded.source_suggestion_id,
  approved_at = excluded.approved_at,
  updated_at = excluded.updated_at;

with evidence(card_image_id, market_name, source_type, source_name, source_url, source_title, evidence_note) as (
  values
    ('P-OP02-096', 'Championship Kuzan (2023 Top 32)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2023/championship/online_regional_wave2.php', 'Championship 2023 July-August Online Regional', 'Official prize list awards OP02-096 Kuzan at Top 32.'),
    ('P-OP02-099', 'Championship Sakazuki (2023 Top 16)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2023/championship/online_regional_wave2.php', 'Championship 2023 July-August Online Regional', 'Official prize list awards OP02-099 Sakazuki at Top 16.'),
    ('P-OP05-086', 'Championship Vivi (2024 Winner)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2024/championship/store_regionals_october.php', 'October Championship 2024 Store Regionals', 'Official prize list awards OP05-086 Nefeltari Vivi to the Champion.'),
    ('P-OP05-091', 'Championship Rebecca (2024 Top 8)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2024/championship/online_regional_wave3.php', 'Championship 2024 October Online Regional', 'Official prize list awards OP05-091 Rebecca at Top 8.'),
    ('P-OP09-050', 'Championship Nami (2025-26 Top 64)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2025/02/19/one-piece-card-game-tournament-prize-cards-from-march-to-june-2025/', 'Tournament prize cards from March to June 2025', 'Identifies OP09-050 Nami as the Championship 25-26 Season 1 Top 64 prize.'),
    ('P-OP09-076', 'Championship Zoro (2025-26 Top 16)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2025/02/19/one-piece-card-game-tournament-prize-cards-from-march-to-june-2025/', 'Tournament prize cards from March to June 2025', 'Identifies OP09-076 Zoro as the Championship 25-26 Season 1 Top 16 prize.'),
    ('P-OP09-065', 'Championship Sanji (2025-26 Top 8)', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2025/02/19/one-piece-card-game-tournament-prize-cards-from-march-to-june-2025/', 'Tournament prize cards from March to June 2025', 'Identifies OP09-065 Sanji as the Championship 25-26 Season 1 Top 8 prize.'),
    ('P-OP09-004', 'Championship Shanks (2025-26 Top 8)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2025/championship/offline_regional_season2.php', 'Championship 25-26 Offline Regionals Season 2', 'Official prize list awards OP09-004 Shanks at Top 8.'),
    ('P-OP14-112', 'Championship Boa (2026-27 Top 64)', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-One-Piece-Card-Game-s-Organized-Play-System-Explained/9de155b5-7e73-400b-8e59-06ead018079d/', 'The One Piece Card Game organized play system, explained', 'Explicitly identifies OP14-112 Boa Hancock as the current Top 64 Regional prize.')
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
