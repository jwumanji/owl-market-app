-- Migration v5: Populate characters table + add character_id to cards
-- Run in Supabase SQL Editor. Idempotent.

-- 1. Seed characters table with top One Piece characters
INSERT INTO characters (slug, name, subtitle, faction, tier, type_tag, emoji) VALUES
  ('monkey-d-luffy',          'Monkey D. Luffy',          'Straw Hat Captain',       'Straw Hat Pirates',     1, 'captain',    NULL),
  ('roronoa-zoro',            'Roronoa Zoro',             'Pirate Hunter',           'Straw Hat Pirates',     1, 'swordsman',  NULL),
  ('shanks',                  'Shanks',                   'Red-Haired Emperor',      'Red Hair Pirates',      1, 'emperor',    NULL),
  ('portgas-d-ace',           'Portgas D. Ace',           'Fire Fist',               'Whitebeard Pirates',    1, 'commander',  NULL),
  ('boa-hancock',             'Boa Hancock',              'Pirate Empress',          'Kuja Pirates',          1, 'warlord',    NULL),
  ('trafalgar-law',           'Trafalgar Law',            'Surgeon of Death',        'Heart Pirates',         1, 'captain',    NULL),
  ('nami',                    'Nami',                     'Cat Burglar',             'Straw Hat Pirates',     2, 'navigator',  NULL),
  ('yamato',                  'Yamato',                   'Oni Princess',            'Straw Hat Allies',      2, 'ally',       NULL),
  ('edward-newgate',          'Edward Newgate',           'Whitebeard',              'Whitebeard Pirates',    1, 'emperor',    NULL),
  ('gol-d-roger',             'Gol D. Roger',             'Pirate King',             'Roger Pirates',         1, 'legend',     NULL),
  ('dracule-mihawk',          'Dracule Mihawk',           'Greatest Swordsman',      'Cross Guild',           2, 'swordsman',  NULL),
  ('charlotte-katakuri',      'Charlotte Katakuri',       'Sweet Commander',         'Big Mom Pirates',       2, 'commander',  NULL),
  ('donquixote-doflamingo',   'Donquixote Doflamingo',    'Heavenly Demon',          'Donquixote Pirates',    2, 'warlord',    NULL),
  ('vinsmoke-sanji',          'Vinsmoke Sanji',           'Black Leg',               'Straw Hat Pirates',     2, 'cook',       NULL),
  ('nico-robin',              'Nico Robin',               'Devil Child',             'Straw Hat Pirates',     2, 'archaeologist', NULL),
  ('tony-tony-chopper',       'Tony Tony Chopper',        'Cotton Candy Lover',      'Straw Hat Pirates',     3, 'doctor',     NULL),
  ('usopp',                   'Usopp',                    'God Usopp',               'Straw Hat Pirates',     3, 'sniper',     NULL),
  ('franky',                  'Franky',                   'Cyborg',                  'Straw Hat Pirates',     3, 'shipwright',  NULL),
  ('brook',                   'Brook',                    'Soul King',               'Straw Hat Pirates',     3, 'musician',   NULL),
  ('jinbe',                   'Jinbe',                    'Knight of the Sea',       'Straw Hat Pirates',     2, 'helmsman',   NULL),
  ('kaido',                   'Kaido',                    'King of Beasts',          'Beasts Pirates',        1, 'emperor',    NULL),
  ('charlotte-linlin',        'Charlotte Linlin',         'Big Mom',                 'Big Mom Pirates',       1, 'emperor',    NULL),
  ('marshall-d-teach',        'Marshall D. Teach',        'Blackbeard',              'Blackbeard Pirates',    1, 'emperor',    NULL),
  ('akainu',                  'Sakazuki',                 'Akainu',                  'Marines',               2, 'admiral',    NULL),
  ('kuzan',                   'Kuzan',                    'Aokiji',                  'Marines',               2, 'admiral',    NULL),
  ('borsalino',               'Borsalino',                'Kizaru',                  'Marines',               2, 'admiral',    NULL),
  ('monkey-d-garp',           'Monkey D. Garp',           'Hero of the Marines',     'Marines',               2, 'vice-admiral', NULL),
  ('sabo',                    'Sabo',                     'Flame Emperor',           'Revolutionary Army',    2, 'chief',      NULL),
  ('crocodile',               'Crocodile',                'Desert King',             'Cross Guild',           2, 'warlord',    NULL),
  ('eustass-kid',             'Eustass Kid',              'Captain Kid',             'Kid Pirates',           2, 'captain',    NULL),
  ('vegapunk',                'Vegapunk',                 'World''s Smartest',       'World Government',      3, 'scientist',  NULL),
  ('buggy',                   'Buggy',                    'The Genius Jester',       'Cross Guild',           3, 'emperor',    NULL),
  ('smoker',                  'Smoker',                   'White Hunter',            'Marines',               3, 'captain',    NULL),
  ('uta',                     'Uta',                      'World''s Diva',           'Neutral',               2, 'musician',   NULL)
ON CONFLICT (slug) DO NOTHING;

-- 2. Add character_id column to cards (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cards' AND column_name = 'character_id'
  ) THEN
    ALTER TABLE cards ADD COLUMN character_id uuid REFERENCES characters(id) ON DELETE SET NULL;
    CREATE INDEX idx_cards_character_id ON cards(character_id);
  END IF;
END $$;
