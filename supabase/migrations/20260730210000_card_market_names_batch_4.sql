begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('P-OP05-091', 'Championship Rebecca', array['CS Rebecca', 'Regional Rebecca', 'OP05 Championship Rebecca', 'October Championship Rebecca'], 'high', 'TCGplayer market coverage treats this exact OP05-091 online regional prize as a major Championship Rebecca reference card.'),
    ('P-OP09-004', 'Championship Shanks', array['CS Shanks', 'Regional Shanks', 'OP09 Championship Shanks', 'Top 8 Shanks'], 'high', 'Official and marketplace sources identify this exact OP09-004 printing as the Championship 25-26 regional prize.'),
    ('P-OP09-076', 'Championship Zoro', array['CS Zoro', 'Regional Zoro', 'OP09 Championship Zoro', 'Championship Roronoa Zoro'], 'high', 'TCGplayer identifies this exact OP09-076 printing as the Championship 25-26 Season 1 prize.'),
    ('P-OP14-112', 'Championship Boa', array['CS Boa', 'Regional Boa', 'OP14 Championship Boa', 'Championship Boa Hancock'], 'high', 'TCGplayer identifies this exact OP14-112 printing as the Championship 26-27 Season 1 prize.'),
    ('P-ST01-013', 'Treasure Cup Zoro', array['TC Zoro', 'ST01 Treasure Cup Zoro', 'Treasure Cup Roronoa Zoro'], 'high', 'Treasure Cup Zoro is the stable marketplace shortening for this exact ST01-013 prize printing.'),
    ('P-OP06-069', 'Treasure Cup Reiju', array['TC Reiju', 'OP06 Treasure Cup Reiju', 'Treasure Cup Vinsmoke Reiju'], 'high', 'TCGplayer editorial and product data identify this exact OP06-069 prize as Treasure Cup Reiju.'),
    ('P-OP10-005', 'Treasure Cup Sanji', array['TC Sanji', 'OP10 Treasure Cup Sanji', '2025 Treasure Cup Sanji'], 'high', 'The shortened name preserves the exact official Treasure Cup 2025 identity.'),
    ('P-ST01-007', 'New Year Winner Nami', array['New Year Nami', '2025 New Year Nami', 'ST01 Winner Nami'], 'high', 'Marketplace and TCGplayer sales consistently use New Year Event Winner Nami for this exact ST01-007 prize.'),
    ('P-OP02-099', 'Championship Sakazuki', array['CS Sakazuki', 'OP02 Championship Sakazuki', '2023 Championship Sakazuki'], 'high', 'The shortened name preserves the exact Championship 2023 identity.'),
    ('P-OP05-086', 'Championship Vivi', array['CS Vivi', 'Regional Vivi', 'OP05 Championship Vivi', 'Championship Nefeltari Vivi'], 'high', 'The shortened name preserves the exact October Championship store regional identity.'),
    ('P-OP05-067', 'Championship Zoro-Juurou', array['CS Zoro-Juurou', 'Finalist Zoro-Juurou', 'Championship Zorojuro', 'OP05 Championship Zoro-Juurou'], 'high', 'The primary name normalizes the exact Championship finalist printing while retaining common spelling variants.'),
    ('P-OP09-050', 'Championship Nami', array['CS Nami', 'Regional Nami', 'OP09 Championship Nami', 'Championship 25-26 Nami'], 'high', 'TCGplayer identifies this exact OP09-050 printing as the Championship 25-26 Season 1 prize.'),
    ('P-EB01-012', 'Treasure Cup Cavendish', array['TC Cavendish', 'EB01 Treasure Cup Cavendish', '2024 Treasure Cup Cavendish'], 'high', 'TCGplayer editorial and product data identify this exact EB01-012 prize as Treasure Cup Cavendish.'),
    ('P-OP02-096', 'Championship Kuzan', array['CS Kuzan', 'OP02 Championship Kuzan', '2023 Championship Kuzan'], 'high', 'The shortened name preserves the exact Championship 2023 identity.'),
    ('P-OP12-015', 'Treasure Cup Luffy', array['TC Luffy', 'OP12 Treasure Cup Luffy', '2025 Treasure Cup Luffy'], 'high', 'The shortened name preserves the exact Treasure Cup 2025 identity.'),
    ('P-OP01-121', 'Treasure Cup Yamato', array['TC Yamato', 'OP01 Treasure Cup Yamato', 'Yamato Treasure Cup'], 'high', 'Treasure Cup Yamato is the stable marketplace reference for this exact OP01-121 prize.'),
    ('P-ST21-014', '3rd Anniversary Treasure Luffy', array['Treasure Campaign Luffy', '3rd Anniversary Luffy', 'ST21 Anniversary Luffy', 'ST21 Treasure Luffy'], 'high', 'The compact name preserves both the 3rd Anniversary and Treasure Campaign identity of this exact ST21-014 printing.'),
    ('P-OP06-101', 'Championship O-Nami', array['CS O-Nami', 'Finalist O-Nami', 'OP06 Championship O-Nami', 'Championship Onami'], 'high', 'The primary name normalizes the exact Championship finalist printing while retaining the unhyphenated spelling.'),
    ('P-001-store-championship', 'Store Championship Luffy', array['Store Champ Luffy', 'Trophy Luffy', 'Store Championship Trophy Luffy', 'P-001 Trophy Luffy'], 'high', 'Marketplace naming consistently identifies this exact P-001 printing as the Store Championship trophy card.'),
    ('P-EB01-048', 'Treasure Cup Laboon', array['TC Laboon', 'EB01 Treasure Cup Laboon', '2025 Treasure Cup Laboon'], 'high', 'The shortened name preserves the exact Treasure Cup 2025 identity.'),
    ('P-OP09-069', 'Treasure Cup Law', array['TC Law', 'OP09 Treasure Cup Law', 'Treasure Cup Trafalgar Law'], 'high', 'The shortened name preserves the exact Treasure Cup 2025 identity.'),
    ('P-EB01-006', 'Treasure Cup Chopper', array['TC Chopper', 'EB01 Treasure Cup Chopper', 'Treasure Cup Tony Tony Chopper'], 'high', 'The shortened name preserves the exact Treasure Cup 2024 identity.'),
    ('P-OP09-065', 'Championship Sanji', array['CS Sanji', 'Regional Sanji', 'OP09 Championship Sanji', 'Championship 25-26 Sanji'], 'high', 'The shortened name preserves the exact Championship 25-26 Season 1 identity.'),
    ('P-OP07-066', 'Championship Chopper', array['CS Chopper', 'Finalist Chopper', 'OP07 Championship Chopper', 'Championship Tony Tony Chopper'], 'high', 'The shortened name preserves the exact Championship finalist card-set identity.'),
    ('P-OP06-093', 'Treasure Cup Perona', array['TC Perona', 'OP06 Treasure Cup Perona', '2024 Treasure Cup Perona'], 'high', 'TCGplayer product data identifies this exact OP06-093 printing as Treasure Cup Perona.')
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
    ('P-OP05-091', 'Championship Rebecca', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards/690d6de6-5b0b-4d1b-bda6-3cfe9c28fc38/', 'The 10 Most Expensive One Piece Cards', 'Uses the exact Rebecca OP05-091 October Championship prize in investor-focused coverage.'),
    ('P-OP09-004', 'Championship Shanks', 'official', 'Bandai', 'https://en.onepiece-cardgame.com/events/2025/championship/offline_regional_season2.php', 'Championship 25-26 Offline Regionals Season 2', 'Official event page lists OP09-004 Shanks as the prize card.'),
    ('P-OP09-076', 'Championship Zoro', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/categories/trading-and-collectible-card-games/one-piece-card-game/price-guides/one-piece-promotion-cards', 'One Piece Promotion Cards price guide', 'Lists Roronoa Zoro OP09-076 as Championship 25-26 Regionals Season 1.'),
    ('P-OP14-112', 'Championship Boa', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/all/product?q=op14+112', 'OP14-112 product results', 'Lists Boa Hancock OP14-112 as the Championship 26-27 regional prize.'),
    ('P-ST01-013', 'Treasure Cup Zoro', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=ST01-013+Treasure+Cup+Zoro&view=grid', 'ST01-013 Treasure Cup Zoro results', 'Exact product and card number support Treasure Cup Zoro.'),
    ('P-OP06-069', 'Treasure Cup Reiju', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards/690d6de6-5b0b-4d1b-bda6-3cfe9c28fc38/', 'The 10 Most Expensive One Piece Cards', 'Investor coverage explicitly uses Vinsmoke Reiju Treasure Cup 2024.'),
    ('P-OP10-005', 'Treasure Cup Sanji', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP10-005+Treasure+Cup+Sanji&view=grid', 'OP10-005 Treasure Cup Sanji results', 'Exact product and card number support Treasure Cup Sanji.'),
    ('P-ST01-007', 'New Year Winner Nami', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-starter-deck-1-straw-hat-crew/nami-new-year-event-winner-st01-007', 'Nami New Year Event Winner ST01-007 prices', 'TCGplayer and eBay sale titles consistently use New Year Event Winner Nami.'),
    ('P-OP02-099', 'Championship Sakazuki', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP02-099+Championship+Sakazuki&view=grid', 'OP02-099 Championship Sakazuki results', 'Exact product and card number support Championship Sakazuki.'),
    ('P-OP05-086', 'Championship Vivi', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP05-086+Championship+Vivi&view=grid', 'OP05-086 Championship Vivi results', 'Exact product and card number support Championship Vivi.'),
    ('P-OP05-067', 'Championship Zoro-Juurou', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP05-067+Championship+Zoro-Juurou&view=grid', 'OP05-067 Championship Zoro-Juurou results', 'Exact product and finalist treatment support the normalized market name.'),
    ('P-OP09-050', 'Championship Nami', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?inStock=true&q=OP09-050&view=grid', 'OP09-050 product results', 'Lists Nami OP09-050 as Championship 25-26 Regionals Season 1.'),
    ('P-EB01-012', 'Treasure Cup Cavendish', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards/690d6de6-5b0b-4d1b-bda6-3cfe9c28fc38/', 'The 10 Most Expensive One Piece Cards', 'Investor coverage explicitly uses Cavendish Treasure Cup 2024.'),
    ('P-OP02-096', 'Championship Kuzan', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP02-096+Championship+Kuzan&view=grid', 'OP02-096 Championship Kuzan results', 'Exact product and card number support Championship Kuzan.'),
    ('P-OP12-015', 'Treasure Cup Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP12-015+Treasure+Cup+Luffy&view=grid', 'OP12-015 Treasure Cup Luffy results', 'Exact product and card number support Treasure Cup Luffy.'),
    ('P-OP01-121', 'Treasure Cup Yamato', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP01-121+Treasure+Cup+Yamato&view=grid', 'OP01-121 Treasure Cup Yamato results', 'Exact product and card number support Treasure Cup Yamato.'),
    ('P-ST21-014', '3rd Anniversary Treasure Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=ST21-014+3rd+Anniversary+Treasure+Campaign+Luffy&view=grid', 'ST21-014 Anniversary Treasure Campaign results', 'Exact product supports the compact anniversary treasure name.'),
    ('P-OP06-101', 'Championship O-Nami', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP06-101+Championship+O-Nami&view=grid', 'OP06-101 Championship O-Nami results', 'Exact product and finalist treatment support Championship O-Nami.'),
    ('P-001-store-championship', 'Store Championship Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=P-001+Store+Championship+Trophy+Luffy&view=grid', 'P-001 Store Championship Trophy Luffy results', 'Exact product supports Store Championship Luffy and Trophy Luffy aliases.'),
    ('P-EB01-048', 'Treasure Cup Laboon', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB01-048+Treasure+Cup+Laboon&view=grid', 'EB01-048 Treasure Cup Laboon results', 'Exact product and card number support Treasure Cup Laboon.'),
    ('P-OP09-069', 'Treasure Cup Law', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-069+Treasure+Cup+Law&view=grid', 'OP09-069 Treasure Cup Law results', 'Exact product and card number support Treasure Cup Law.'),
    ('P-EB01-006', 'Treasure Cup Chopper', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB01-006+Treasure+Cup+Chopper&view=grid', 'EB01-006 Treasure Cup Chopper results', 'Exact product and card number support Treasure Cup Chopper.'),
    ('P-OP09-065', 'Championship Sanji', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-065+Championship+Sanji&view=grid', 'OP09-065 Championship Sanji results', 'Exact product and card number support Championship Sanji.'),
    ('P-OP07-066', 'Championship Chopper', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP07-066+Championship+Chopper&view=grid', 'OP07-066 Championship Chopper results', 'Exact product and finalist treatment support Championship Chopper.'),
    ('P-OP06-093', 'Treasure Cup Perona', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Perona+%28Treasure+Cup+2024%29+OP06-093&view=grid', 'OP06-093 Treasure Cup Perona results', 'Exact product and card number support Treasure Cup Perona.')
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
