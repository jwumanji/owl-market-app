begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    (
      'PRB02-006_p2',
      'Bubble Zoro',
      array['Bubble Zoro SP', 'OP14 Bubble Zoro', 'PRB02 Bubble Zoro', 'Sabaody Bubble Zoro'],
      'high',
      'Collector discussions and marketplace listings consistently use Bubble Zoro for this exact PRB02-006 SP artwork.'
    ),
    (
      'OP08-106_p2',
      'Firework Nami',
      array['Fireworks Nami', 'Nami Firework SP', 'Egghead Nami SP', 'OP09 Nami SP'],
      'high',
      'Collector discussions use Firework Nami for this exact OP08-106 SP artwork and distinguish it from the other Nami SP printings.'
    ),
    (
      'ST26-005_p1',
      'Beer Luffy',
      array['Beer Luffy SP', 'ST26 Beer Luffy', 'OP15 Beer Luffy', 'Purple Beer Luffy'],
      'high',
      'Players and marketplace listings consistently use Beer Luffy for this exact ST26-005 printing and its SP artwork.'
    ),
    (
      'P-OP07-073',
      'Afro Luffy',
      array['Bandai Fest Afro Luffy', '2025 Afro Luffy', 'OP07 Afro Luffy', 'P-OP07-073 Afro Luffy'],
      'high',
      'Collector discussions and marketplace listings consistently use Afro Luffy for this exact Bandai Card Games Fest 25-26 promo.'
    ),
    (
      'OP15-092_p1',
      'Nightmare Luffy',
      array['Zombie Luffy', 'OP15 Nightmare Luffy', 'OP15 Zombie Luffy', 'OP15-092 Luffy'],
      'high',
      'Marketplace listings use Nightmare Luffy while players also use Zombie Luffy for this exact OP15-092 alternate-art printing.'
    ),
    (
      'OP15-098_p1',
      'Golden Bell Luffy',
      array['Bell Luffy', 'Skypiea Bell Luffy', 'OP15 Bell Luffy', 'OP15-098 Bell Luffy'],
      'high',
      'Collector and deck-market references use Bell Luffy or Golden Bell Luffy for this exact OP15-098 alternate-art leader.'
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
    ('PRB02-006_p2', 'Bubble Zoro', 'marketplace', 'eBay', 'https://www.ebay.com/itm/397849083054', 'Roronoa Zoro PRB02-006 Bubble Zoro', 'The marketplace title uses Bubble Zoro for this exact PRB02-006 SP printing.'),
    ('OP08-106_p2', 'Firework Nami', 'community', 'Reddit', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1uk1ivx/firework_nami_undervalued/', 'Firework Nami Undervalued?', 'Collector discussion repeatedly identifies this exact Nami SP as Firework Nami.'),
    ('ST26-005_p1', 'Beer Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/itm/198230560951', 'ST26-005 Beer Luffy', 'The marketplace title uses Beer Luffy for this exact ST26-005 card.'),
    ('P-OP07-073', 'Afro Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/itm/397111133755', 'Bandai Card Games Fest Afro Luffy', 'The marketplace title identifies the exact OP07-073 event promo as Afro Luffy.'),
    ('OP15-092_p1', 'Nightmare Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/itm/406743428798', 'OP15-092 Alternate Art Zombie Luffy', 'Marketplace naming uses both Nightmare Luffy and Zombie Luffy for this exact printing.'),
    ('OP15-098_p1', 'Golden Bell Luffy', 'community', 'OnePiece.gg', 'https://onepiece.gg/decks/luffy-bell/', 'Luffy Bell deck reference', 'Community deck references consistently shorten the OP15 Luffy identity to Bell Luffy.')
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
