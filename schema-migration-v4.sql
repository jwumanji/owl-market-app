-- Migration v4: Seed all known One Piece TCG sets
-- Run in Supabase SQL Editor. Idempotent via ON CONFLICT (slug) DO NOTHING.

INSERT INTO sets (slug, code, name, series, year) VALUES
  -- Booster Packs (OP)
  ('op01', 'OP01', 'Romance Dawn',              'BOOSTER', 2022),
  ('op02', 'OP02', 'Paramount War',             'BOOSTER', 2023),
  ('op03', 'OP03', 'Pillars of Strength',       'BOOSTER', 2023),
  ('op04', 'OP04', 'Kingdoms of Intrigue',       'BOOSTER', 2023),
  ('op05', 'OP05', 'Awakening of the New Era',   'BOOSTER', 2023),
  ('op06', 'OP06', 'Wings of the Captain',       'BOOSTER', 2024),
  ('op07', 'OP07', '500 Years in the Future',    'BOOSTER', 2024),
  ('op08', 'OP08', 'Two Legends',                'BOOSTER', 2024),
  ('op09', 'OP09', 'The Four Emperors',          'BOOSTER', 2024),
  ('op10', 'OP10', 'Royal Blood',                'BOOSTER', 2025),
  ('op11', 'OP11', 'A Fist of Divine Speed',     'BOOSTER', 2025),
  ('op12', 'OP12', 'Legacy of the Master',       'BOOSTER', 2025),
  ('op13', 'OP13', 'Carrying On His Will',       'BOOSTER', 2025),
  ('op14', 'OP14', 'The Azure Sea''s Seven',     'BOOSTER', 2026),
  ('op15', 'OP15', 'Adventure on Kami''s Island', 'BOOSTER', 2026),
  ('op16', 'OP16', 'The Time of Battle',         'BOOSTER', 2026),

  -- Extra Boosters (EB)
  ('eb01', 'EB01', 'Memorial Collection',         'EXTRA_BOOSTER', 2024),
  ('eb02', 'EB02', 'Anime 25th Collection',       'EXTRA_BOOSTER', 2024),
  ('eb03', 'EB03', 'One Piece Heroines Edition',   'EXTRA_BOOSTER', 2026),
  ('eb04', 'EB04', 'Egghead Crisis',              'EXTRA_BOOSTER', 2026),

  -- Premium Boosters (PRB)
  ('prb01', 'PRB01', 'Premium Booster The Best',        'PREMIUM_BOOSTER', 2024),
  ('prb02', 'PRB02', 'Premium Booster The Best Vol. 2', 'PREMIUM_BOOSTER', 2025),

  -- Starter Decks (ST)
  ('st01', 'ST01', 'Straw Hat Crew',                'STARTER', 2022),
  ('st02', 'ST02', 'Worst Generation',              'STARTER', 2022),
  ('st03', 'ST03', 'The Seven Warlords of the Sea', 'STARTER', 2022),
  ('st04', 'ST04', 'Animal Kingdom Pirates',        'STARTER', 2022),
  ('st05', 'ST05', 'One Piece Film Edition',         'STARTER', 2023),
  ('st06', 'ST06', 'Absolute Justice',               'STARTER', 2023),
  ('st07', 'ST07', 'Big Mom Pirates',                'STARTER', 2023),
  ('st08', 'ST08', 'Monkey D. Luffy',               'STARTER', 2023),
  ('st09', 'ST09', 'Yamato',                        'STARTER', 2023),
  ('st10', 'ST10', 'The Three Captains',             'STARTER', 2023),
  ('st11', 'ST11', 'Uta',                           'STARTER', 2023),
  ('st12', 'ST12', 'Zoro and Sanji',                'STARTER', 2024),
  ('st13', 'ST13', 'The Three Brothers',             'STARTER', 2024),
  ('st14', 'ST14', '3D2Y',                          'STARTER', 2024),
  ('st15', 'ST15', 'RED Edward Newgate',             'STARTER', 2024),
  ('st16', 'ST16', 'GREEN Uta',                     'STARTER', 2024),
  ('st17', 'ST17', 'BLUE Donquixote Doflamingo',    'STARTER', 2024),
  ('st18', 'ST18', 'PURPLE Monkey D. Luffy',        'STARTER', 2024),
  ('st19', 'ST19', 'BLACK Smoker',                   'STARTER', 2024),
  ('st20', 'ST20', 'YELLOW Charlotte Katakuri',     'STARTER', 2024),
  ('st21', 'ST21', 'Gear 5',                        'STARTER', 2025),
  ('st22', 'ST22', 'Ace & Newgate',                 'STARTER', 2025),
  ('st23', 'ST23', 'RED Shanks',                    'STARTER', 2025),
  ('st24', 'ST24', 'GREEN Jewelry Bonney',          'STARTER', 2025),
  ('st25', 'ST25', 'BLUE Buggy',                    'STARTER', 2025),
  ('st26', 'ST26', 'PURPLE/BLACK Monkey D. Luffy',  'STARTER', 2025),
  ('st27', 'ST27', 'BLACK Marshall D. Teach',       'STARTER', 2025),
  ('st28', 'ST28', 'GREEN/YELLOW Yamato',           'STARTER', 2025),
  ('st29', 'ST29', 'Egghead',                       'STARTER', 2026),
  ('st30', 'ST30', 'Luffy & Ace',                   'STARTER', 2026),

  -- Promo (catch-all, already exists from v3)
  ('promo', 'P', 'One Piece Promotion Cards', 'PROMO', NULL)

ON CONFLICT (slug) DO NOTHING;
