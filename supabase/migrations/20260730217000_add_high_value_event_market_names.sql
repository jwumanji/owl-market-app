begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    (
      'OP09-051',
      'Manga Buggy',
      array['Buggy Manga', 'OP09 Manga Buggy', 'OP09-051 Manga', 'Buggy Manga Rare'],
      'high',
      'Marketplace and collector price references identify this exact MR printing as Manga Buggy rather than the technical Buggy 051 catalog name.'
    ),
    (
      'P-ST10-010',
      'Championship Law (2024 Top 16)',
      array['Championship Law', '2024 Championship Law', '2024 Regional Top 16 Law', 'Top 16 Trafalgar Law', 'ST10 Championship Law'],
      'high',
      'Official Championship 2024 Regional prizing awards this exact ST10-010 Trafalgar Law printing at Top 16.'
    ),
    (
      'P-OP02-114',
      'Championship Borsalino (2023 Top 64)',
      array['Championship Borsalino', '2023 Championship Borsalino', '2023 Regional Top 64 Borsalino', 'Top 64 Borsalino', 'OP02 Championship Borsalino'],
      'high',
      'Official Championship 2023 Regional prizing awards this exact OP02-114 Borsalino printing at Top 64.'
    ),
    (
      'P-OP03-013',
      'Championship Marco (2023 Top 32)',
      array['Championship Marco', '2023 Championship Marco', '2023 Regional Top 32 Marco', 'Top 32 Marco', 'OP03 Championship Marco'],
      'high',
      'Official Championship 2023 Regional prizing awards this exact OP03-013 Marco printing at Top 32.'
    ),
    (
      'P-EB01-003',
      'Championship Kid & Killer (2025 Winner)',
      array['Regional Kid and Killer Winner', '2025 Championship Kid Killer', '2025 Regional Champion Kid and Killer', 'Offline Regional Kid Killer', 'EB01 Championship Kid Killer'],
      'high',
      'The official card catalog identifies this exact EB01-003 printing as the Offline Regional Champion Card Set 2025 Vol.2 version.'
    ),
    (
      'P-OP12-031',
      'Treasure Cup Tashigi (2025 Winner)',
      array['2025 Treasure Cup Tashigi', 'Treasure Cup Tashigi Top 16', '2025 Top 16 Tashigi', 'TC Tashigi Winner', 'OP12 Treasure Cup Tashigi'],
      'high',
      'Official November 2025 Treasure Cup prizing awards this exact OP12-031 Tashigi printing at Top 16. Winner follows the existing Owl Market convention for earned Treasure Cup prize cards.'
    ),
    (
      'P-OP07-064',
      'Championship Sanji (2024 Top Player)',
      array['2024 Championship Sanji', 'Championship Top Player Sanji', '2024 Top Player Pack Sanji', 'OP07 Championship Sanji', 'Top Player Sanji'],
      'high',
      'Marketplace product identity consistently names this exact OP07-064 printing as the Championship 2024 Top Player Pack version.'
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
    ('OP09-051', 'Manga Buggy', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-japanese-emperors-in-the-new-world/buggy-alternate-art-manga-op09-051', 'Buggy Alternate Art Manga OP09-051', 'Identifies this exact OP09-051 MR printing as Buggy Alternate Art Manga.'),
    ('P-ST10-010', 'Championship Law (2024 Top 16)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2024/offline_regional_march/index.php', 'Championship 2024 March-May Offline Regional', 'Official prize list awards ST10-010 Trafalgar Law at Top 16.'),
    ('P-OP02-114', 'Championship Borsalino (2023 Top 64)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2023/championship/offline_regional_wave2.php', 'Championship 2023 August-September Offline Regional', 'Official prize list awards OP02-114 Borsalino at Top 64.'),
    ('P-OP03-013', 'Championship Marco (2023 Top 32)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2023/championship/offline_regional_wave3.php', 'Championship 2023 October-December Offline Regional', 'Official prize list awards OP03-013 Marco at Top 32.'),
    ('P-EB01-003', 'Championship Kid & Killer (2025 Winner)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/cardlist/?series=569901', 'Championship 25-26 card list', 'Official card catalog lists EB01-003 Kid & Killer in the Offline Regional Champion Card Set 2025 Vol.2.'),
    ('P-OP12-031', 'Treasure Cup Tashigi (2025 Winner)', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2025/treasure_cup_november/', 'Treasure Cup November 2025', 'Official prize list awards OP12-031 Tashigi at Top 16.'),
    ('P-OP07-064', 'Championship Sanji (2024 Top Player)', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-500-years-in-the-future/sanji-championship-top-player-op07-064', 'Sanji Championship Top Player OP07-064', 'Marketplace sales consistently identify this exact printing as Championship 2024 Top Player Sanji.')
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
