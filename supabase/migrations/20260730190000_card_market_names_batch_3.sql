begin;

with one_piece as (
  select id
  from public.games
  where slug = 'one_piece'
), candidates(card_image_id, market_name, aliases, confidence, research_note) as (
  values
    ('OP13-119_p2', 'Base Manga Ace', array['OP13 Manga Ace', 'Normal Manga Ace', 'Standard Manga Ace'], 'high', 'Base distinguishes this standard OP13 manga treatment from the approved Red Manga Ace printing.'),
    ('OP13-120_p2', 'Base Manga Sabo', array['OP13 Manga Sabo', 'Normal Manga Sabo', 'Standard Manga Sabo'], 'high', 'Base distinguishes this standard OP13 manga treatment from the approved Red Manga Sabo printing.'),
    ('OP09-004_p2', 'OP09 Manga Shanks', array['Emperors Manga Shanks', 'Manga Shanks OP09', 'New World Manga Shanks'], 'high', 'Set-qualified naming prevents confusion with the original OP01 manga and its PRB01 reprint.'),
    ('OP01-120_r2', 'PRB01 Manga Shanks', array['PRB Manga Shanks', 'Reprint Manga Shanks', 'Premium Booster Manga Shanks'], 'high', 'The set-qualified name distinguishes this Premium Booster reprint from OG Manga Shanks.'),
    ('OP03-122_p2', 'Manga Sogeking', array['Manga Usopp', 'Sogeking Manga', 'OP03 Manga Sogeking', 'King of Snipers Manga'], 'high', 'Sogeking is Usopp''s alter ego, so both collector search terms are retained.'),
    ('OP15-118_p2', 'Manga Enel', array['OP15 Manga Enel', 'Manga Eneru', 'God Enel Manga', 'Kami Island Manga Enel'], 'high', 'Treatment-first shorthand for the exact OP15-118 manga printing, including the Eneru localization alias.'),
    ('OP05-069_r1', 'PRB01 Manga Law', array['PRB Manga Law', 'Reprint Manga Law', 'Premium Booster Manga Law'], 'high', 'The set-qualified name distinguishes this Premium Booster reprint from the original OP05 Manga Law.'),
    ('OP02-013_r1', 'PRB01 Manga Ace', array['PRB Manga Ace', 'Reprint Manga Ace', 'Premium Booster Manga Ace'], 'high', 'The set-qualified name distinguishes this Premium Booster reprint from the original OP02 Manga Ace.'),
    ('OP09-051_p5', 'Silver SP Buggy', array['Silver Buggy', 'Buggy Silver SP', 'OP14 Silver Buggy'], 'high', 'Marketplace sales and TCGplayer data identify this OP14 anniversary treatment as Buggy SP Silver.'),
    ('OP09-004_p6', 'Silver SP Shanks', array['Silver Shanks', 'Shanks Silver SP', 'OP13 Silver Shanks'], 'high', 'Marketplace sales identify this OP13 third-anniversary treatment as Shanks SP Silver.'),
    ('EB03-053_p2', 'EB03 SP Nami', array['Portrait SP Nami', 'Nami Portrait SP', 'Heroines SP Nami'], 'high', 'The set-specific primary name is unambiguous; Portrait SP remains a collector search alias.'),
    ('EB03-026_p2', 'EB03 SP Boa', array['Portrait SP Boa', 'Boa Portrait SP', 'Boa Hancock Portrait SP', 'Heroines SP Boa'], 'high', 'The set-specific primary name is unambiguous; Portrait SP remains a collector search alias.'),
    ('EB03-055_p2', 'EB03 SP Nico Robin', array['Portrait SP Robin', 'Robin Portrait SP', 'Nico Robin Portrait SP', 'Heroines SP Robin'], 'high', 'The set-specific primary name uses the full character name; Portrait SP remains a collector search alias.'),
    ('OP08-058_sp_eb02', 'Gold Pudding Leader', array['EB02 Gold Pudding Leader', 'Gold Charlotte Pudding Leader', 'Anime 25th Pudding Leader'], 'high', 'Marketplace sales consistently call the EB02 SP leader treatment Gold Pudding Leader.'),
    ('OP05-001_sp_eb02', 'Gold Sabo Leader', array['EB02 Gold Sabo Leader', 'Anime 25th Sabo Leader', 'Gold Leader Sabo'], 'high', 'Marketplace sales consistently call the EB02 SP leader treatment Gold Sabo Leader.'),
    ('OP06-022_sp_eb02', 'Gold Yamato Leader', array['EB02 Gold Yamato Leader', 'Anime 25th Yamato Leader', 'Gold Leader Yamato'], 'high', 'Marketplace and collector usage consistently calls the EB02 SP treatment Gold Yamato Leader.'),
    ('OP06-021_sp_eb02', 'Gold Perona Leader', array['EB02 Gold Perona Leader', 'Anime 25th Perona Leader', 'Gold Leader Perona'], 'high', 'Marketplace and collector usage consistently calls the EB02 SP treatment Gold Perona Leader.'),
    ('OP06-001_sp_eb02', 'Gold Uta Leader', array['EB02 Gold Uta Leader', 'Anime 25th Uta Leader', 'Gold Leader Uta'], 'high', 'Marketplace usage consistently calls the EB02 SP treatment Gold Uta Leader.'),
    ('OP08-002_sp_eb02', 'Gold Marco Leader', array['EB02 Gold Marco Leader', 'Anime 25th Marco Leader', 'Gold Leader Marco'], 'high', 'Marketplace usage consistently calls the EB02 SP treatment Gold Marco Leader.'),
    ('EB03-061_p2', 'Manga Uta', array['EB03 Manga Uta', 'Heroines Manga Uta', 'Uta Manga'], 'high', 'Treatment-first shorthand for the exact EB03-061 manga printing.'),
    ('OP05-074_p2', 'Manga Kid', array['OP05 Manga Kid', 'Manga Eustass Kid', 'Awakening Manga Kid'], 'high', 'Treatment-first shorthand for the original OP05-074 manga printing.'),
    ('OP05-074_r2', 'PRB01 Manga Kid', array['PRB Manga Kid', 'Reprint Manga Kid', 'Premium Booster Manga Kid'], 'high', 'The set-qualified name distinguishes this Premium Booster reprint from the original OP05 Manga Kid.'),
    ('OP04-083_p2', 'Manga Sabo', array['OP04 Manga Sabo', 'Kingdoms Manga Sabo', 'Sabo Manga'], 'high', 'Treatment-first shorthand for the original OP04-083 manga printing.'),
    ('OP04-083_r1', 'PRB01 Manga Sabo', array['PRB Manga Sabo', 'Reprint Manga Sabo', 'Premium Booster Manga Sabo'], 'high', 'The set-qualified name distinguishes this Premium Booster reprint from the original OP04 Manga Sabo.'),
    ('OP12-118_p2', 'Manga Bonney', array['Manga Jewelry Bonney', 'OP12 Manga Bonney', 'Legacy Manga Bonney'], 'high', 'Treatment-first shorthand for the exact OP12-118 manga printing.'),
    ('OP10-119_p2', 'OP10 Manga Law', array['Royal Blood Manga Law', 'Manga Law OP10', 'OP10 Manga Trafalgar Law'], 'high', 'Set-qualified naming prevents confusion with the original OP05 Manga Law and its PRB01 reprint.'),
    ('OP14-119_p2', 'Manga Mihawk', array['Manga Dracule Mihawk', 'OP14 Manga Mihawk', 'Azure Sea Manga Mihawk'], 'high', 'Treatment-first shorthand for the exact OP14-119 manga printing.')
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
    ('OP13-119_p2', 'Base Manga Ace', 'marketplace', 'Collector Station', 'https://collectorstation.com/10-most-expensive-one-piece-cards-in-carrying-on-his-will', '10 Most Expensive One Piece Cards in Carrying On His Will', 'Distinguishes the scarce base Manga Ace from its red treatment.'),
    ('OP13-120_p2', 'Base Manga Sabo', 'marketplace', 'TCG Lover', 'https://tcg-lover.com/top-10-des-cartes-les-plus-cheres-de-lop-13-successors/', 'Top OP13 chase cards', 'Separates standard Manga Sabo from Manga Red Sabo.'),
    ('OP09-004_p2', 'OP09 Manga Shanks', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP09-004+Manga+Shanks&view=grid', 'OP09-004 Manga Shanks results', 'Exact card number and manga treatment support the set-qualified name.'),
    ('OP01-120_r2', 'PRB01 Manga Shanks', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP01-120+Manga+Shanks&view=grid', 'PRB01 OP01-120 Manga Shanks results', 'Premium Booster context distinguishes this reprint from the original OP01 manga.'),
    ('OP03-122_p2', 'Manga Sogeking', 'marketplace', 'SNKRDUNK', 'https://snkrdunk.com/en/magazine/2024/04/11/one-piece-card-game-this-manga-rare-features-the-self-proclaimed-king-of-snipers-sogeking-sec-sp-pillars-of-strength-op-03-op03-122/', 'Sogeking OP03-122 manga market guide', 'Identifies the exact card as Manga Rare and explains that Sogeking is Usopp.'),
    ('OP03-122_p2', 'Manga Sogeking', 'marketplace', 'Card Piece', 'https://cardpiece.com/products/sogeking-usopp-op03-122-manga-secret-alt-art-jpn', 'Sogeking / Usopp OP03-122 Manga', 'Marketplace title uses both Sogeking and Usopp for the exact manga printing.'),
    ('OP15-118_p2', 'Manga Enel', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP15-118+Manga+Enel&view=grid', 'OP15-118 Manga Enel results', 'Exact card number and manga treatment support Manga Enel.'),
    ('OP05-069_r1', 'PRB01 Manga Law', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP05-069+Manga+Law&view=grid', 'PRB01 OP05-069 Manga Law results', 'Premium Booster context distinguishes this reprint from the original OP05 manga.'),
    ('OP02-013_r1', 'PRB01 Manga Ace', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP02-013+Manga+Ace&view=grid', 'PRB01 OP02-013 Manga Ace results', 'Premium Booster context distinguishes this reprint from the original OP02 manga.'),
    ('OP09-051_p5', 'Silver SP Buggy', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-azure-sea%27s-seven/buggy-sp-silver-op09-051', 'Buggy SP Silver OP09-051 prices', 'TCGplayer and eBay sale titles repeatedly identify the exact printing as Silver SP Buggy.'),
    ('OP09-004_p6', 'Silver SP Shanks', 'marketplace', 'Pack Magik', 'https://www.packmagik.com/cards/1767522292124x452519820514782900', 'Shanks Silver SP price guide', 'Exact card page identifies the OP09-004 anniversary printing as Shanks Silver SP.'),
    ('EB03-053_p2', 'EB03 SP Nami', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Cards-Everybody-Wants-from-One-Piece-Heroines-Edition-EB-03/140366c7-0aaf-404f-961f-030d1386a8c2/', 'The 10 Cards Everybody Wants from One Piece Heroines Edition', 'Confirms the exact EB03 Nami SP chase card.'),
    ('EB03-053_p2', 'EB03 SP Nami', 'community', 'Reddit / Playkami', 'https://www.reddit.com/r/Playkami/comments/1reiav0/nami_beats_the_manga_rare_top_10_most_expensive/', 'EB03 Heroines market discussion', 'Supports Portrait SP as a searchable collector alias.'),
    ('EB03-026_p2', 'EB03 SP Boa', 'community', 'Reddit / OnePieceTCG', 'https://www.reddit.com/r/OnePieceTCG/comments/1fi6p0c/since_everyones_showing_off_their_collection/', 'Boa Portrait SP collector discussion', 'Supports Portrait SP as a searchable collector alias.'),
    ('EB03-026_p2', 'EB03 SP Boa', 'tcgplayer_editorial', 'TCGplayer', 'https://www.tcgplayer.com/content/article/The-10-Cards-Everybody-Wants-from-One-Piece-Heroines-Edition-EB-03/140366c7-0aaf-404f-961f-030d1386a8c2/', 'The 10 Cards Everybody Wants from One Piece Heroines Edition', 'Confirms the exact EB03 Boa Hancock SP chase card.'),
    ('EB03-055_p2', 'EB03 SP Nico Robin', 'community', 'Reddit / Playkami', 'https://www.reddit.com/r/Playkami/comments/1reiav0/nami_beats_the_manga_rare_top_10_most_expensive/', 'EB03 Heroines market discussion', 'Supports Portrait SP as a searchable collector alias.'),
    ('OP08-058_sp_eb02', 'Gold Pudding Leader', 'marketplace', 'PriceCharting', 'https://www.pricecharting.com/game/one-piece-extra-booster-anime-25th-collection/charlotte-pudding-op08-058', 'Charlotte Pudding OP08-058 prices', 'Recorded sales repeatedly call this exact EB02 SP a Special Gold Leader.'),
    ('OP05-001_sp_eb02', 'Gold Sabo Leader', 'marketplace', 'eBay', 'https://www.ebay.com/itm/336432950327', 'Sabo EB02 Gold Leader', 'Marketplace title identifies the exact OP05-001 EB02 SP as Gold Leader Sabo.'),
    ('OP06-022_sp_eb02', 'Gold Yamato Leader', 'community', 'Reddit / OnePieceTCG', 'https://www.reddit.com/r/OnePieceTCG/comments/1lkpnfb/gave_op11_luffy_the_glow_up_he_deserves/', 'EB02 gold leader collector discussion', 'Collector discussion explicitly uses Gold Yamato for the EB02 leader treatment.'),
    ('OP06-021_sp_eb02', 'Gold Perona Leader', 'community', 'Reddit / OnePieceTCG', 'https://www.reddit.com/r/OnePieceTCG/comments/1kkgm19/my_collection_to_far_3/', 'EB02 gold Perona collector discussion', 'Collector discussion explicitly uses gold leader for EB02 Perona.'),
    ('OP06-001_sp_eb02', 'Gold Uta Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB02+OP06-001+Uta+SP+Leader&view=grid', 'EB02 Uta SP leader results', 'Exact product identifies the EB02 Uta SP leader treatment.'),
    ('OP08-002_sp_eb02', 'Gold Marco Leader', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB02+OP08-002+Marco+SP+Leader&view=grid', 'EB02 Marco SP leader results', 'Exact product identifies the EB02 Marco SP leader treatment.'),
    ('EB03-061_p2', 'Manga Uta', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=EB03-061+Manga+Uta&view=grid', 'EB03-061 Manga Uta results', 'Exact card number and manga treatment support Manga Uta.'),
    ('OP05-074_p2', 'Manga Kid', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP05-074+Manga+Kid&view=grid', 'OP05-074 Manga Kid results', 'Exact card number and manga treatment support Manga Kid.'),
    ('OP05-074_r2', 'PRB01 Manga Kid', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP05-074+Manga+Kid&view=grid', 'PRB01 OP05-074 Manga Kid results', 'Premium Booster context distinguishes this reprint from the original OP05 manga.'),
    ('OP04-083_p2', 'Manga Sabo', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP04-083+Manga+Sabo&view=grid', 'OP04-083 Manga Sabo results', 'Exact card number and manga treatment support Manga Sabo.'),
    ('OP04-083_r1', 'PRB01 Manga Sabo', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=PRB01+OP04-083+Manga+Sabo&view=grid', 'PRB01 OP04-083 Manga Sabo results', 'Premium Booster context distinguishes this reprint from the original OP04 manga.'),
    ('OP12-118_p2', 'Manga Bonney', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP12-118+Manga+Bonney&view=grid', 'OP12-118 Manga Bonney results', 'Exact card number and manga treatment support Manga Bonney.'),
    ('OP10-119_p2', 'OP10 Manga Law', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP10-119+Manga+Law&view=grid', 'OP10-119 Manga Law results', 'Exact card number and Royal Blood context support the set-qualified name.'),
    ('OP14-119_p2', 'Manga Mihawk', 'tcgplayer_product', 'TCGplayer', 'https://www.tcgplayer.com/search/one-piece-card-game/product?q=OP14-119+Manga+Mihawk&view=grid', 'OP14-119 Manga Mihawk results', 'Exact card number and manga treatment support Manga Mihawk.')
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
