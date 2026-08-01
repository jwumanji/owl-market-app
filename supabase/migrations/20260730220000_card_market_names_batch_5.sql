begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('OP05-022_sp_eb02', 'Gold Rosinante Leader', array['Gold Rosinante', 'Gold Corazon Leader', 'Gold Corazon', 'EB02 Gold Rosinante'], 'high', 'TCGplayer identifies this exact OP05-022 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP07-097_sp_eb02', 'Gold Vegapunk Leader', array['Gold Vegapunk', 'EB02 Gold Vegapunk', 'Anime 25th Vegapunk'], 'high', 'TCGplayer identifies this exact OP07-097 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP08-021_sp_eb02', 'Gold Carrot Leader', array['Gold Carrot', 'EB02 Gold Carrot', 'Anime 25th Carrot'], 'high', 'TCGplayer identifies this exact OP08-021 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP06-042_sp_eb02', 'Gold Reiju Leader', array['Gold Reiju', 'Gold Vinsmoke Reiju', 'EB02 Gold Reiju'], 'high', 'TCGplayer identifies this exact OP06-042 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('EB01-001_sp_eb02', 'Gold Oden Leader', array['Gold Oden', 'Gold Kouzuki Oden', 'EB02 Gold Oden'], 'high', 'TCGplayer identifies this exact EB01-001 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP07-001_sp_eb02', 'Gold Dragon Leader', array['Gold Dragon', 'Gold Monkey D Dragon', 'EB02 Gold Dragon', 'Anime 25th Dragon'], 'high', 'TCGplayer identifies this exact OP07-001 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP05-098_sp_eb02', 'Gold Enel Leader', array['Gold Enel', 'Gold Eneru Leader', 'EB02 Gold Enel', 'Anime 25th Enel'], 'high', 'TCGplayer identifies this exact OP05-098 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP07-079_sp_eb02', 'Gold Lucci Leader', array['Gold Lucci', 'Gold Rob Lucci', 'EB02 Gold Lucci', 'Anime 25th Lucci'], 'high', 'TCGplayer identifies this exact OP07-079 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP08-057_sp_eb02', 'Gold King Leader', array['Gold King', 'EB02 Gold King', 'Anime 25th King'], 'high', 'TCGplayer identifies this exact OP08-057 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP07-019_sp_eb02', 'Gold Bonney Leader', array['Gold Bonney', 'Gold Jewelry Bonney', 'EB02 Gold Bonney'], 'high', 'TCGplayer identifies this exact OP07-019 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP05-002_sp_eb02', 'Gold Belo Betty Leader', array['Gold Belo Betty', 'Gold Betty Leader', 'EB02 Gold Belo Betty'], 'high', 'TCGplayer identifies this exact OP05-002 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('OP06-080_sp_eb02', 'Gold Moria Leader', array['Gold Moria', 'Gold Gecko Moria', 'EB02 Gold Moria'], 'high', 'TCGplayer identifies this exact OP06-080 printing as the Anime 25th Collection SP leader; gold is the established collector treatment name.'),
    ('EB04-044_p2', 'Manga Koby', array['EB04 Manga Koby', 'EB04-044 Manga Koby', 'Koby Manga Rare'], 'high', 'Marketplace listings consistently identify the top EB04-044 printing as Manga Koby.'),
    ('OP08-118_p2', 'Manga Rayleigh', array['Manga Silvers Rayleigh', 'OP08 Manga Rayleigh', 'OP08-118 Manga Rayleigh'], 'high', 'Marketplace and collector listings consistently identify this exact OP08-118 parallel as Manga Rayleigh.'),
    ('OP03-122_r1', 'PRB01 Manga Sogeking', array['Premium Booster Manga Sogeking', 'PRB01 Manga Usopp', 'OP03-122 PRB01 Manga Sogeking'], 'high', 'TCGplayer identifies this exact OP03-122 reprint as Sogeking Manga from Premium Booster The Best.'),
    ('OP05-119_p6', 'OP09 Wanted Poster Luffy', array['Wanted Poster Luffy', 'Emperors Wanted Poster Luffy', 'OP05-119 Wanted Poster Luffy', 'OP09 Luffy Wanted Poster'], 'high', 'TCGplayer identifies this exact OP05-119 printing from Emperors in the New World as Monkey.D.Luffy Wanted Poster.'),
    ('OP13-119_p4', 'OP13 Wanted Poster Ace', array['Wanted Poster Ace', 'OP13 Ace Wanted Poster', 'OP13-119 Wanted Poster Ace', 'Portgas D Ace Wanted Poster'], 'high', 'TCGplayer identifies this exact OP13-119 printing as Portgas.D.Ace Wanted Poster.'),
    ('OP13-118_p4', 'OP13 Wanted Poster Luffy', array['Wanted Poster Luffy', 'OP13 Luffy Wanted Poster', 'OP13-118 Wanted Poster Luffy', 'Carrying On His Will Wanted Luffy'], 'high', 'TCGplayer identifies this exact OP13-118 printing as Monkey.D.Luffy Wanted Poster.'),
    ('OP13-120_p4', 'OP13 Wanted Poster Sabo', array['Wanted Poster Sabo', 'OP13 Sabo Wanted Poster', 'OP13-120 Wanted Poster Sabo'], 'high', 'TCGplayer identifies this exact OP13-120 printing as Sabo Wanted Poster.'),
    ('OP09-118_p3', 'Wanted Poster Roger', array['OP13 Wanted Poster Roger', 'SP Wanted Poster Roger', 'Gol D Roger Wanted Poster', 'OP09-118 Wanted Poster Roger'], 'high', 'TCGplayer identifies this exact OP09-118 SP printing as Gol.D.Roger Wanted Poster.'),
    ('OP09-004_p3', 'Wanted Poster Shanks', array['OP09 Wanted Poster Shanks', 'Shanks Wanted Poster', 'OP09-004 Wanted Poster Shanks'], 'high', 'TCGplayer identifies this exact OP09-004 printing as Shanks Wanted Poster.'),
    ('OP09-093_p3', 'Wanted Poster Blackbeard', array['Wanted Poster Teach', 'Marshall D Teach Wanted Poster', 'OP09 Wanted Poster Blackbeard', 'OP09-093 Wanted Poster Teach'], 'high', 'TCGplayer identifies this exact OP09-093 printing as Marshall.D.Teach Wanted Poster; Blackbeard is the common character reference.'),
    ('OP09-051_p3', 'Wanted Poster Buggy', array['OP09 Wanted Poster Buggy', 'Buggy Wanted Poster', 'OP09-051 Wanted Poster Buggy'], 'high', 'TCGplayer identifies this exact OP09-051 printing as Buggy Wanted Poster.'),
    ('P-OP11-041', 'Whole Cake Nami', array['Whole Cake Island Nami', 'Whole Cake Nami Leader', 'OP11 Whole Cake Nami', 'OP11-041 Whole Cake Nami'], 'high', 'Marketplace references consistently shorten the Official Playmat and Card Set Whole Cake Island Arc promo to Whole Cake Nami.'),
    ('OP09-051-anniversary-set', '2nd Anniversary Buggy', array['Second Anniversary Buggy', 'English 2nd Anniversary Buggy', 'OP09-051 Anniversary Buggy'], 'high', 'TCGplayer and secondary-market listings identify this exact OP09-051 promo as English Version 2nd Anniversary Set Buggy.')
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
    ('OP05-022_sp_eb02', 'Gold Rosinante Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Donquixote+Rosinante+OP05-022+SP&view=grid', 'Donquixote Rosinante OP05-022 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP07-097_sp_eb02', 'Gold Vegapunk Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Vegapunk+OP07-097+SP&view=grid', 'Vegapunk OP07-097 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP08-021_sp_eb02', 'Gold Carrot Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Carrot+OP08-021+SP&view=grid', 'Carrot OP08-021 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP06-042_sp_eb02', 'Gold Reiju Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Vinsmoke+Reiju+OP06-042+SP&view=grid', 'Vinsmoke Reiju OP06-042 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('EB01-001_sp_eb02', 'Gold Oden Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Kouzuki+Oden+EB01-001+SP&view=grid', 'Kouzuki Oden EB01-001 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP07-001_sp_eb02', 'Gold Dragon Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Dragon+OP07-001+SP&view=grid', 'Monkey.D.Dragon OP07-001 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP05-098_sp_eb02', 'Gold Enel Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Enel+OP05-098+SP&view=grid', 'Enel OP05-098 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP07-079_sp_eb02', 'Gold Lucci Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Rob+Lucci+OP07-079+SP&view=grid', 'Rob Lucci OP07-079 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP08-057_sp_eb02', 'Gold King Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=King+OP08-057+SP&view=grid', 'King OP08-057 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP07-019_sp_eb02', 'Gold Bonney Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Jewelry+Bonney+OP07-019+SP&view=grid', 'Jewelry Bonney OP07-019 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP05-002_sp_eb02', 'Gold Belo Betty Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Belo+Betty+OP05-002+SP&view=grid', 'Belo Betty OP05-002 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('OP06-080_sp_eb02', 'Gold Moria Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Gecko+Moria+OP06-080+SP&view=grid', 'Gecko Moria OP06-080 SP results', 'Lists the exact Anime 25th Collection SP leader printing.'),
    ('EB04-044_p2', 'Manga Koby', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-extra-booster-eb04/koby-manga-eb04-044', 'Koby Manga EB04-044 prices', 'Uses Manga Koby for the exact EB04-044 treatment.'),
    ('OP08-118_p2', 'Manga Rayleigh', 'marketplace', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Silvers+Rayleigh+OP08-118+Manga&view=grid', 'Silvers Rayleigh OP08-118 Manga results', 'Marketplace results identify the exact OP08-118 manga treatment.'),
    ('OP03-122_r1', 'PRB01 Manga Sogeking', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/product/587710/', 'Sogeking Manga Premium Booster The Best', 'Identifies OP03-122 Sogeking Manga as the PRB01 reprint.'),
    ('OP05-119_p6', 'OP09 Wanted Poster Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Luffy+Wanted+Poster+OP05-119&view=grid', 'OP05-119 Wanted Poster Luffy results', 'Lists the exact Emperors in the New World Wanted Poster printing.'),
    ('OP13-119_p4', 'OP13 Wanted Poster Ace', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Portgas.D.Ace+OP13-119+Wanted+Poster&view=grid', 'OP13-119 Wanted Poster Ace results', 'Lists the exact Carrying On His Will Wanted Poster printing.'),
    ('OP13-118_p4', 'OP13 Wanted Poster Luffy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Monkey.D.Luffy+OP13-118+Wanted+Poster&view=grid', 'OP13-118 Wanted Poster Luffy results', 'Lists the exact Carrying On His Will Wanted Poster printing.'),
    ('OP13-120_p4', 'OP13 Wanted Poster Sabo', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Sabo+OP13-120+Wanted+Poster&view=grid', 'OP13-120 Wanted Poster Sabo results', 'Lists the exact Carrying On His Will Wanted Poster printing.'),
    ('OP09-118_p3', 'Wanted Poster Roger', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Gol.D.Roger+OP09-118+Wanted+Poster&view=grid', 'OP09-118 Wanted Poster Roger results', 'Lists the exact SP Wanted Poster printing.'),
    ('OP09-004_p3', 'Wanted Poster Shanks', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Shanks+OP09-004+Wanted+Poster&view=grid', 'OP09-004 Wanted Poster Shanks results', 'Lists the exact Emperors in the New World Wanted Poster printing.'),
    ('OP09-093_p3', 'Wanted Poster Blackbeard', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Marshall.D.Teach+OP09-093+Wanted+Poster&view=grid', 'OP09-093 Wanted Poster Teach results', 'Lists the exact Wanted Poster printing under the official Marshall.D.Teach name.'),
    ('OP09-051_p3', 'Wanted Poster Buggy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Buggy+OP09-051+Wanted+Poster&view=grid', 'OP09-051 Wanted Poster Buggy results', 'Lists the exact Emperors in the New World Wanted Poster printing.'),
    ('P-OP11-041', 'Whole Cake Nami', 'marketplace', 'OP.LOG', 'https://ai.op-log.gg/cards/OP11-041_promo_whole-cake-island-arc', 'Nami Whole Cake Island Arc promo', 'Uses Whole Cake Island Arc for the exact OP11-041 promo.'),
    ('OP09-051-anniversary-set', '2nd Anniversary Buggy', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=Buggy+English+Version+2nd+Anniversary+Set+OP09-051&view=grid', 'OP09-051 English Version 2nd Anniversary Buggy results', 'Lists the exact English Version 2nd Anniversary Set printing.')
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
