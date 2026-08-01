begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    (
      'EB03-024_p2',
      'EB03 SP Vivi',
      array['EB03 Vivi SP', 'EB03 Portrait Vivi', 'EB03 SP Nefeltari Vivi', 'Vivi EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Nefeltari Vivi portrait SP printing.'
    ),
    (
      'EB03-045_p2',
      'EB03 SP Perona',
      array['EB03 Perona SP', 'EB03 Portrait Perona', 'Perona EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Perona portrait SP printing.'
    ),
    (
      'EB03-003_p2',
      'EB03 SP Uta',
      array['EB03 Uta SP', 'EB03 Portrait Uta', 'Uta EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Uta portrait SP printing.'
    ),
    (
      'EB03-031_p2',
      'EB03 SP Reiju',
      array['EB03 Reiju SP', 'EB03 Portrait Reiju', 'EB03 SP Vinsmoke Reiju', 'Reiju EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Vinsmoke Reiju portrait SP printing.'
    ),
    (
      'EB03-042_p2',
      'EB03 SP Koala',
      array['EB03 Koala SP', 'EB03 Portrait Koala', 'Koala EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Koala portrait SP printing.'
    ),
    (
      'EB03-018_p2',
      'EB03 SP Tashigi',
      array['EB03 Tashigi SP', 'EB03 Portrait Tashigi', 'Tashigi EB03 SP'],
      'high',
      'Uses the approved EB03 SP naming convention for the exact Tashigi portrait SP printing.'
    ),
    (
      'OP01-016_p2',
      'Pinwheel Nami',
      array['OP05 Pinwheel Nami', 'Nami Pinwheel SP', 'Pinwheel Nami SP', 'OP01-016 Pinwheel Nami'],
      'high',
      'Collector discussion distinguishes this exact Nami SP artwork as Pinwheel Nami or OP05 Pinwheel.'
    ),
    (
      'OP06-101_p2',
      'Festival O-Nami',
      array['Festival Nami', 'OP07 Festival Nami', 'O-Nami Festival SP', 'Fireworks O-Nami'],
      'high',
      'Collector discussion distinguishes this exact O-Nami SP artwork as Festival Nami or OP07 Festival.'
    ),
    (
      'OP07-109_p2',
      'Egghead Luffy (Treasure Rare)',
      array['Egghead Luffy TR', 'Treasure Rare Egghead Luffy', 'OP07 Egghead Luffy', 'OP08 Luffy TR'],
      'high',
      'Marketplace and collector references consistently identify this exact Treasure Rare printing as Egghead Luffy.'
    ),
    (
      'P-OP05-060',
      'PSA Magazine Luffy',
      array['Magazine Luffy', 'PSA Luffy Promo', 'PSA Magazine Promo Luffy', 'OP05-060 Magazine Luffy'],
      'high',
      'Marketplace listings consistently identify this exact OP05-060 promo as PSA Magazine Luffy or Magazine Luffy.'
    ),
    (
      'P-ST13-015',
      '2nd Anniversary Luffy',
      array['Second Anniversary Luffy', 'Gold Anniversary Luffy', 'ST13-015 Anniversary Luffy', '2nd Anniversary Gold Luffy'],
      'high',
      'Official product and marketplace references identify this exact gold-foil ST13-015 printing with the 2nd Anniversary Set.'
    ),
    (
      'P-OP09-119',
      '3rd Anniversary Luffy',
      array['Third Anniversary Luffy', 'OP09-119 Anniversary Luffy', '3rd Anniversary Promo Luffy', 'Purple Anniversary Luffy'],
      'high',
      'Marketplace listings consistently identify this exact OP09-119 promo with the 3rd Anniversary Set.'
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
    ('EB03-024_p2', 'EB03 SP Vivi', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Nefeltari Vivi.'),
    ('EB03-045_p2', 'EB03 SP Perona', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Perona.'),
    ('EB03-003_p2', 'EB03 SP Uta', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Uta.'),
    ('EB03-031_p2', 'EB03 SP Reiju', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Vinsmoke Reiju.'),
    ('EB03-042_p2', 'EB03 SP Koala', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Koala.'),
    ('EB03-018_p2', 'EB03 SP Tashigi', 'admin', 'Owl Market curation', 'https://owl-market-app.vercel.app/admin/market-names', 'EB03 portrait SP naming convention', 'Completes the user-approved EB03 SP Character naming convention for Tashigi.'),
    ('OP01-016_p2', 'Pinwheel Nami', 'community', 'Reddit', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1uk1ivx/firework_nami_undervalued/', 'Firework Nami Undervalued?', 'Collectors distinguish the Nami SP variants as OP05 pinwheel, OP07 festival, OP09 Egghead, and EB03 portrait.'),
    ('OP06-101_p2', 'Festival O-Nami', 'community', 'Reddit', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1uk1ivx/firework_nami_undervalued/', 'Firework Nami Undervalued?', 'Collectors distinguish this exact O-Nami SP artwork as OP07 festival.'),
    ('OP07-109_p2', 'Egghead Luffy (Treasure Rare)', 'marketplace', 'eBay', 'https://www.ebay.com/itm/157770065588', 'OP07-109 Egghead Luffy Treasure Rare', 'The marketplace title uses Egghead Luffy and Treasure Rare for this exact printing.'),
    ('P-OP05-060', 'PSA Magazine Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/shop/psa-magazine-luffy?_nkw=psa+magazine+luffy', 'PSA Magazine Luffy listings', 'Marketplace listings repeatedly use PSA Magazine Luffy for the exact OP05-060 promo.'),
    ('P-ST13-015', '2nd Anniversary Luffy', 'community', 'Reddit', 'https://www.reddit.com/r/OnePieceTCG/comments/1dk8r5f/one_piece_2nd_anniversary_box_premium_bandai/', 'One Piece 2nd Anniversary Box', 'The product discussion lists ST13-015 Luffy among the 2nd Anniversary Set cards.'),
    ('P-OP09-119', '3rd Anniversary Luffy', 'marketplace', 'eBay', 'https://www.ebay.com/itm/397570342878', 'Luffy Promo OP09-119 3rd Anniversary Set', 'The marketplace title identifies the exact OP09-119 printing as a 3rd Anniversary Set promo.')
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
