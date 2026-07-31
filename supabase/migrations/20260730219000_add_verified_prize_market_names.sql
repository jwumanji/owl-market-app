begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    (
      'P-OP03-123',
      'Championship Katakuri (2024 Top 16)',
      array['Championship Katakuri', '2024 Championship Katakuri', '2024 Regional Top 16 Katakuri', 'Top 16 Katakuri', 'OP03 Championship Katakuri'],
      'high',
      'Official Championship 2024 Regional prizing awards this exact OP03-123 Charlotte Katakuri printing at Top 16.'
    ),
    (
      'P-OP03-114',
      'Championship Linlin (2024 Top 8)',
      array['Championship Linlin', '2024 Championship Linlin', '2024 Regional Top 8 Linlin', 'Top 8 Charlotte Linlin', 'OP03 Championship Linlin'],
      'high',
      'Official Championship 2024 Regional prizing awards this exact OP03-114 Charlotte Linlin printing at Top 8.'
    ),
    (
      'P-ST07-010',
      'Treasure Cup Linlin (2024 Winner)',
      array['2024 Treasure Cup Linlin', 'Treasure Cup Linlin Top 16', '2024 Top 16 Charlotte Linlin', 'TC Linlin Winner', 'ST07 Treasure Cup Linlin'],
      'high',
      'Official May-June 2024 Treasure Cup prizing awards this exact ST07-010 Charlotte Linlin printing at Top 16. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-OP01-070',
      'Treasure Cup Mihawk (2024 Winner)',
      array['2024 Treasure Cup Mihawk', 'Treasure Cup Mihawk Top 8', '2024 Top 8 Dracule Mihawk', 'TC Mihawk Winner', 'OP01 Treasure Cup Mihawk'],
      'high',
      'Official August-September 2024 Treasure Cup prizing awards this exact OP01-070 Dracule Mihawk printing at Top 8. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-OP11-119',
      'Treasure Cup Koby (2025 Winner)',
      array['2025 Treasure Cup Koby', 'Treasure Cup Koby Top 8', '2025 Top 8 Koby', 'TC Koby Winner', 'OP11 Treasure Cup Koby'],
      'high',
      'Official August 2025 Treasure Cup prizing awards this exact OP11-119 Koby printing at Top 8. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-ST06-012',
      'Treasure Cup Garp (2024 Winner)',
      array['2024 Treasure Cup Garp', 'Treasure Cup Garp Top 16', '2024 Top 16 Monkey D Garp', 'TC Garp Winner', 'ST06 Treasure Cup Garp'],
      'high',
      'Official February 2024 Treasure Cup prizing awards this exact ST06-012 Monkey D. Garp printing at Top 16. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-ST18-003',
      'Treasure Cup San-Gorou (2025 Winner)',
      array['2025 Treasure Cup San-Gorou', 'Treasure Cup San-Gorou Top 64', '2025 Top 64 Sangoro', 'TC San-Gorou Winner', 'ST18 Treasure Cup Sanji'],
      'high',
      'Official February 2025 Treasure Cup prizing awards this exact ST18-003 San-Gorou printing at Top 64. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-OP08-084',
      'Treasure Cup Jack (2025 Winner)',
      array['2025 Treasure Cup Jack', 'Treasure Cup Jack Top 16', '2025 Top 16 Jack', 'TC Jack Winner', 'OP08 Treasure Cup Jack'],
      'high',
      'Official February 2025 Treasure Cup prizing awards this exact OP08-084 Jack printing at Top 16. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
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

with evidence(card_image_id, market_name, source_url, source_title, evidence_note) as (
  values
    ('P-OP03-123', 'Championship Katakuri (2024 Top 16)', 'https://en.onepiece-cardgame.com/events/2024/championship/offline_regional_wave2.php', 'Championship 2024 June-October Offline Regional', 'Official prize list awards OP03-123 Charlotte Katakuri at Top 16.'),
    ('P-OP03-114', 'Championship Linlin (2024 Top 8)', 'https://en.onepiece-cardgame.com/events/2024/championship/offline_regional_wave2.php', 'Championship 2024 June-October Offline Regional', 'Official prize list awards OP03-114 Charlotte Linlin at Top 8.'),
    ('P-ST07-010', 'Treasure Cup Linlin (2024 Winner)', 'https://en.onepiece-cardgame.com/events/2024/treasure_cup_may/', 'Treasure Cup May-June 2024', 'Official prize list awards ST07-010 Charlotte Linlin at Top 16.'),
    ('P-OP01-070', 'Treasure Cup Mihawk (2024 Winner)', 'https://en.onepiece-cardgame.com/events/2024/treasure_cup_august/', 'Treasure Cup August-September 2024', 'Official prize list awards OP01-070 Dracule Mihawk at Top 8.'),
    ('P-OP11-119', 'Treasure Cup Koby (2025 Winner)', 'https://en.onepiece-cardgame.com/events/2025/treasure_cup_august/', 'Treasure Cup August 2025', 'Official prize list awards OP11-119 Koby at Top 8.'),
    ('P-ST06-012', 'Treasure Cup Garp (2024 Winner)', 'https://en.onepiece-cardgame.com/events/2024/treasure_cup_feb/', 'Treasure Cup February 2024', 'Official prize list awards ST06-012 Monkey D. Garp at Top 16.'),
    ('P-ST18-003', 'Treasure Cup San-Gorou (2025 Winner)', 'https://en.onepiece-cardgame.com/events/2025/treasure_cup_february/', 'Treasure Cup February 2025', 'Official prize list awards ST18-003 San-Gorou at Top 64.'),
    ('P-OP08-084', 'Treasure Cup Jack (2025 Winner)', 'https://en.onepiece-cardgame.com/events/2025/treasure_cup_february/', 'Treasure Cup February 2025', 'Official prize list awards OP08-084 Jack at Top 16.')
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
