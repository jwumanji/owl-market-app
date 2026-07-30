begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('P-OP07-119', 'Serial Ace', array['Serial Numbered Ace', 'OP07 Serial Ace', 'Championship Serial Ace'], 'high', 'TCGplayer identifies this exact OP07-119 promotion as Portgas.D.Ace (Serial Numbered).'),
    ('P-OP01-120', 'Serial Shanks', array['Serial Numbered Shanks', 'Championship Serial Shanks', '2023 Serial Shanks'], 'high', 'TCGplayer identifies this exact OP01-120 promotion as the Championship 2023 serial-numbered printing.'),
    ('OP01-120_p2', 'OG Manga Shanks', array['Original Manga Shanks', 'OP01 Manga Shanks', 'Romance Dawn Manga Shanks'], 'medium_high', 'OG Manga Shanks distinguishes the original Romance Dawn manga printing from later reprints and the serial prize card.'),
    ('OP05-060_sp_eb02', 'Gold Luffy Leader', array['EB02 Gold Luffy Leader', 'Anime 25th Luffy Leader', 'Gold Leader Luffy'], 'medium_high', 'Marketplace shorthand consistently calls this EB02 Anime 25th SP treatment the gold Luffy leader.'),
    ('OP08-001_sp_eb02', 'Gold Chopper Leader', array['EB02 Gold Chopper Leader', 'Anime 25th Chopper Leader', 'Gold Leader Chopper'], 'medium_high', 'Marketplace sales consistently call this EB02 Anime 25th SP treatment the gold Chopper leader.'),
    ('OP09-119_p2', 'OP09 Manga Luffy', array['Gear 1 Manga Luffy', 'G1 Manga Luffy', 'Emperors Manga Luffy'], 'medium_high', 'The set-qualified primary name is unambiguous; Gear 1 is useful collector shorthand but is less formal.'),
    ('OP11-118_p2', 'Snakeman Manga Luffy', array['Gear 4 Manga Luffy', 'G4 Manga Luffy', 'OP11 Manga Luffy', 'Gear 4 Snakeman Manga Luffy'], 'high', 'Collector and market coverage identifies the pictured OP11 form as Gear 4 Snakeman.'),
    ('OP13-118_p2', 'Base Manga Luffy', array['OP13 Manga Luffy', 'Regular Manga Luffy', 'Base OP13 Manga Luffy'], 'high', 'TCGplayer editorial distinguishes this standard-color OP13 manga printing as base Manga Luffy from Red Manga Luffy.'),
    ('OP06-118_p2', 'Manga Zoro', array['OP06 Manga Zoro', 'Original Manga Zoro', 'Wings of the Captain Manga Zoro'], 'high', 'Treatment-first shorthand for the original OP06 manga printing.'),
    ('OP06-118_r1', 'PRB01 Manga Zoro', array['PRB Manga Zoro', 'Reprint Manga Zoro', 'Premium Booster Manga Zoro'], 'high', 'The set-qualified name prevents confusion with the original OP06 manga printing.'),
    ('OP07-051_p2', 'Manga Boa', array['Manga Boa Hancock', 'OP07 Manga Boa', '500 Years Manga Boa'], 'high', 'Common treatment-first shorthand for the exact OP07-051 manga printing.'),
    ('OP06-119_p3', 'PRB02 Manga Sanji', array['PRB Manga Sanji', 'Reprint Manga Sanji', 'Premium Booster 2 Manga Sanji'], 'high', 'The set-qualified name identifies the PRB02 manga treatment rather than another Sanji printing.'),
    ('OP01-016_p8', 'PRB01 Manga Nami', array['PRB Manga Nami', 'Reprint Manga Nami', 'Premium Booster Manga Nami'], 'high', 'The set-qualified name identifies the PRB01 manga treatment and separates it from other Nami chase cards.'),
    ('OP02-013_p2', 'Manga Ace', array['OP02 Manga Ace', 'Paramount War Manga Ace', 'Ace Manga'], 'high', 'Common treatment-first shorthand for the exact OP02-013 manga printing.'),
    ('EB01-006_p2', 'Manga Chopper', array['EB01 Manga Chopper', 'Memorial Collection Manga Chopper', 'Chopper Manga'], 'high', 'Common treatment-first shorthand for the exact EB01-006 manga printing.'),
    ('OP05-069_p2', 'Manga Law', array['OP05 Manga Law', 'Awakening Manga Law', 'Trafalgar Law Manga'], 'high', 'Common treatment-first shorthand for the exact OP05-069 manga printing.'),
    ('OP09-093_p2', 'Manga Blackbeard', array['Manga Teach', 'OP09 Manga Blackbeard', 'OP09 Manga Teach', 'Blackbeard Manga'], 'high', 'Blackbeard is the character name collectors commonly use for Marshall.D.Teach; both are retained for search.'),
    ('OP09-051_p2', 'Manga Buggy', array['OP09 Manga Buggy', 'Emperors Manga Buggy', 'Buggy Manga'], 'high', 'Targets the exact OP09-051_p2 manga printing, not the plain OP09-051 base row.'),
    ('OP09-051_p4', 'Gold SP Buggy', array['Gold Buggy', 'Gold Buggy SP', 'OP14 Gold Buggy'], 'high', 'TCGplayer and secondary market listings explicitly identify this printing as Buggy SP Gold.'),
    ('OP09-093_p5', 'Gold SP Blackbeard', array['Gold SP Teach', 'Gold Blackbeard', 'Gold Teach', 'OP12 Gold Blackbeard'], 'high', 'TCGplayer identifies this Legacy of the Master printing as Marshall.D.Teach SP Gold.'),
    ('OP09-093_p4', 'Silver SP Blackbeard', array['Silver SP Teach', 'Silver Blackbeard', 'Silver Teach', 'OP12 Silver Blackbeard'], 'high', 'TCGplayer identifies this Legacy of the Master printing as Marshall.D.Teach SP Silver.'),
    ('P-EB02-010', 'Dodgers Luffy', array['LA Dodgers Luffy', 'Dodgers x One Piece Luffy', 'Dodgers Collab Luffy'], 'high', 'TCGplayer identifies the exact promotion as the Dodgers x ONE PIECE printing.'),
    ('P-OP09-070', 'Gengar Nami', array['Zeus Nami', 'Purple Zeus Nami', 'Best Selection 4 Nami'], 'medium_high', 'Gengar Nami is established collector shorthand for this purple Zeus-themed Best Selection Vol. 4 printing.'),
    ('P-P-001', 'Super Pre-Release Winner Luffy', array['SPR Winner Luffy', 'Super Pre Release Luffy', 'P-001 Winner Luffy'], 'high', 'A concise normalization of TCGplayer''s exact Super Pre-Release Winner product title.')
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
    ('P-OP07-119', 'Serial Ace', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Portgas.D.Ace+%28Serial+Numbered%29+OP07-119&view=grid', 'Portgas.D.Ace (Serial Numbered) OP07-119 results', 'Exact product title and card number support Serial Ace.'),
    ('P-OP01-120', 'Serial Shanks', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/product/514047/one-piece-card-game-one-piece-promotion-cards-shanks-championship-2023-serial-number', 'Shanks (Championship 2023) [Serial Number]', 'Exact product title and card number support Serial Shanks.'),
    ('OP01-120_p2', 'OG Manga Shanks', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/all/product?q=op01+120', 'OP01-120 product results', 'Separates the Romance Dawn manga product from the later PRB manga and serial prize products.'),
    ('OP01-120_p2', 'OG Manga Shanks', 'community', 'Reddit / OnePieceTCGFinance', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1swh04d/shanks_manga_alt_art_psa_10_op01_120_whats_a_fair/', 'Shanks Manga OP01 collector discussion', 'Collector discussion explicitly refers to OP01 Shanks as the OG manga.'),
    ('OP05-060_sp_eb02', 'Gold Luffy Leader', 'marketplace', 'OPGoldfish', 'https://www.opgoldfish.com/sets/EB-02', 'Anime 25th Collection card list', 'Set listing identifies the high-value EB02 Luffy SP leader printing.'),
    ('OP05-060_sp_eb02', 'Gold Luffy Leader', 'community', 'Reddit / OnePieceTCGFinance', 'https://www.reddit.com/r/OnePieceTCGFinance/comments/1pml9im/eb02_luffy_alt_art_leader/', 'EB02 Luffy leader collector discussion', 'Collector discussion uses gold leader for the EB02 Luffy treatment.'),
    ('OP08-001_sp_eb02', 'Gold Chopper Leader', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/tony-tonychopper-op08-001', 'Tony Tony.Chopper OP08-001 prices', 'Recorded marketplace sales repeatedly use Gold Leader for this exact OP08-001 SP.'),
    ('OP09-119_p2', 'OP09 Manga Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-119+Manga+Luffy&view=grid', 'OP09-119 Manga Luffy results', 'Exact card number and manga treatment support the set-qualified market name.'),
    ('OP09-119_p2', 'OP09 Manga Luffy', 'community', 'Reddit / OnePieceTCG', 'https://www.reddit.com/r/OnePieceTCG/comments/1njurx0', 'Luffy manga forms collector discussion', 'Collector discussion maps Gear 1 Manga Luffy to OP09-119.'),
    ('OP11-118_p2', 'Snakeman Manga Luffy', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2025/03/03/one-piece-card-game-monkey-d-luffy-a-fist-of-divine-speed-op-11-op11-118-release-date-price-where-to-buy/', 'Monkey D. Luffy OP11-118 market guide', 'Identifies the manga art as Luffy in Gear 4 Snakeman form.'),
    ('OP13-118_p2', 'Base Manga Luffy', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Most-Expensive-One-Piece-Cards-of-2025/46ec13bd-9ff5-4256-8f25-fd69cf7daab1/', 'The 10 Most Expensive One Piece Cards of 2025', 'Editorial coverage distinguishes base Manga Luffy from the red manga version.'),
    ('OP06-118_p2', 'Manga Zoro', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP06-118+Manga+Zoro&view=grid', 'OP06-118 Manga Zoro results', 'Exact card number and manga treatment support Manga Zoro.'),
    ('OP06-118_r1', 'PRB01 Manga Zoro', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP06-118+Manga+Zoro&view=grid', 'PRB01 OP06-118 Manga Zoro results', 'Premium Booster context distinguishes this reprint from the original OP06 manga.'),
    ('OP07-051_p2', 'Manga Boa', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP07-051+Manga+Boa&view=grid', 'OP07-051 Manga Boa results', 'Exact card number and manga treatment support Manga Boa.'),
    ('OP06-119_p3', 'PRB02 Manga Sanji', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB02+OP06-119+Manga+Sanji&view=grid', 'PRB02 OP06-119 Manga Sanji results', 'Premium Booster Vol. 2 context supports the set-qualified manga name.'),
    ('OP01-016_p8', 'PRB01 Manga Nami', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP01-016+Manga+Nami&view=grid', 'PRB01 OP01-016 Manga Nami results', 'Premium Booster context supports the set-qualified manga name.'),
    ('OP02-013_p2', 'Manga Ace', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP02-013+Manga+Ace&view=grid', 'OP02-013 Manga Ace results', 'Exact card number and manga treatment support Manga Ace.'),
    ('EB01-006_p2', 'Manga Chopper', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB01-006+Manga+Chopper&view=grid', 'EB01-006 Manga Chopper results', 'Exact card number and manga treatment support Manga Chopper.'),
    ('OP05-069_p2', 'Manga Law', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP05-069+Manga+Law&view=grid', 'OP05-069 Manga Law results', 'Exact card number and manga treatment support Manga Law.'),
    ('OP09-093_p2', 'Manga Blackbeard', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-093+Manga+Marshall.D.Teach&view=grid', 'OP09-093 Manga Marshall.D.Teach results', 'Exact product supports the manga treatment; Blackbeard and Teach remain searchable.'),
    ('OP09-051_p2', 'Manga Buggy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-051+Manga+Buggy&view=grid', 'OP09-051 Manga Buggy results', 'Exact card number and manga treatment support Manga Buggy.'),
    ('OP09-051_p4', 'Gold SP Buggy', 'marketplace', 'TCGSearch', 'https://www.tcgsearch.com/card/671453', 'Buggy OP09-051 SP Gold', 'Exact marketplace product title uses SP Gold for this printing.'),
    ('OP09-093_p5', 'Gold SP Blackbeard', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?productLineName=one-piece-card-game&q=OP09-093+Marshall.D.Teach+SP+Gold&view=grid', 'Marshall.D.Teach SP Gold results', 'Exact product results distinguish the gold SP printing.'),
    ('OP09-093_p4', 'Silver SP Blackbeard', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?productLineName=one-piece-card-game&q=OP09-093+Marshall.D.Teach+SP+Silver&view=grid', 'Marshall.D.Teach SP Silver results', 'Exact product results distinguish the silver SP printing.'),
    ('P-EB02-010', 'Dodgers Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/all/product?q=eb02+EB02-010', 'EB02-010 product results', 'Exact promotion title is Monkey.D.Luffy (Dodgers x ONE PIECE).'),
    ('P-OP09-070', 'Gengar Nami', 'marketplace', 'Pop Collectibles', 'https://popcollectibles.ca/products/nami-op09-070-gengar-nami-premium-card-collection-best-selection-vol-4', 'Gengar Nami OP09-070', 'The listing explicitly says this Best Selection Vol. 4 printing is affectionately known as Gengar Nami.'),
    ('P-OP09-070', 'Gengar Nami', 'marketplace', 'Catawiki', 'https://www.catawiki.com/en/l/102782013-bandai-1-graded-card-one-piece-gengar-nami-cgc-pristine-10', 'One Piece Gengar Nami graded card', 'A second marketplace independently uses Gengar Nami for this printing.'),
    ('P-P-001', 'Super Pre-Release Winner Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=P-001+Monkey.D.Luffy+Super+Pre-Release+Winner&view=grid', 'P-001 Super Pre-Release Winner Luffy results', 'Exact product title supports the normalized display name and SPR alias.')
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
