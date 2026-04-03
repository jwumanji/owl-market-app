-- schema-migration-v6.sql
-- Adds aliases column to characters + populates aliases + seeds new characters
-- Safe to run multiple times (idempotent)

-- 1. Add aliases column
ALTER TABLE characters ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- 2. Populate aliases for existing characters
UPDATE characters SET aliases = ARRAY['Luffy', 'Straw Hat Luffy'] WHERE slug = 'monkey-d-luffy';
UPDATE characters SET aliases = ARRAY['Zoro'] WHERE slug = 'roronoa-zoro';
UPDATE characters SET aliases = ARRAY['Ace', 'Fire Fist Ace'] WHERE slug = 'portgas-d-ace';
UPDATE characters SET aliases = ARRAY['Hancock'] WHERE slug = 'boa-hancock';
UPDATE characters SET aliases = ARRAY['Law'] WHERE slug = 'trafalgar-law';
UPDATE characters SET aliases = ARRAY['Sanji'] WHERE slug = 'vinsmoke-sanji';
UPDATE characters SET aliases = ARRAY['Robin'] WHERE slug = 'nico-robin';
UPDATE characters SET aliases = ARRAY['Chopper'] WHERE slug = 'tony-tony-chopper';
UPDATE characters SET aliases = ARRAY['Whitebeard', 'Newgate'] WHERE slug = 'edward-newgate';
UPDATE characters SET aliases = ARRAY['Big Mom', 'Linlin'] WHERE slug = 'charlotte-linlin';
UPDATE characters SET aliases = ARRAY['Blackbeard', 'Teach'] WHERE slug = 'marshall-d-teach';
UPDATE characters SET aliases = ARRAY['Roger', 'Gold Roger'] WHERE slug = 'gol-d-roger';
UPDATE characters SET aliases = ARRAY['Garp'] WHERE slug = 'monkey-d-garp';
UPDATE characters SET aliases = ARRAY['Doflamingo', 'Doffy'] WHERE slug = 'donquixote-doflamingo';
UPDATE characters SET aliases = ARRAY['Katakuri'] WHERE slug = 'charlotte-katakuri';
UPDATE characters SET aliases = ARRAY['Mihawk'] WHERE slug = 'dracule-mihawk';
UPDATE characters SET aliases = ARRAY['Kid'] WHERE slug = 'eustass-kid';
UPDATE characters SET aliases = ARRAY['Akainu'] WHERE slug = 'akainu';
UPDATE characters SET aliases = ARRAY['Aokiji'] WHERE slug = 'kuzan';
UPDATE characters SET aliases = ARRAY['Kizaru'] WHERE slug = 'borsalino';

-- 3. Seed additional characters
INSERT INTO characters (id, slug, name, subtitle, faction, tier, type_tag, aliases) VALUES
  (gen_random_uuid(), 'rob-lucci',          'Rob Lucci',          'CP0 Agent',         'CP0',                    2, 'agent',      ARRAY['Lucci']),
  (gen_random_uuid(), 'marco',              'Marco',              'The Phoenix',       'Whitebeard Pirates',     2, 'commander',  '{}'),
  (gen_random_uuid(), 'jewelry-bonney',     'Jewelry Bonney',     'Glutton',           'Bonney Pirates',         2, 'captain',    ARRAY['Bonney']),
  (gen_random_uuid(), 'nefertari-vivi',     'Nefertari Vivi',     'Princess',          'Alabasta Kingdom',       3, 'royalty',    ARRAY['Vivi']),
  (gen_random_uuid(), 'bartholomew-kuma',   'Bartholomew Kuma',   'Tyrant',            'Revolutionary Army',     2, 'warlord',    ARRAY['Kuma']),
  (gen_random_uuid(), 'gecko-moria',        'Gecko Moria',        'Shadow Master',     'Thriller Bark Pirates',  2, 'warlord',    ARRAY['Moria']),
  (gen_random_uuid(), 'perona',             'Perona',             'Ghost Princess',    'Thriller Bark Pirates',  2, 'ally',       '{}'),
  (gen_random_uuid(), 'koby',               'Koby',               'Marine Hero',       'Marines',                3, 'captain',    ARRAY['Coby']),
  (gen_random_uuid(), 'king',               'King',               'Wildfire',          'Beasts Pirates',         2, 'commander',  '{}'),
  (gen_random_uuid(), 'queen',              'Queen',              'The Plague',        'Beasts Pirates',         3, 'commander',  '{}'),
  (gen_random_uuid(), 'carrot',              'Carrot',             'Sulong',            'Mink Tribe',             3, 'ally',       '{}'),
  (gen_random_uuid(), 'rebecca',            'Rebecca',            'Gladiator',         'Dressrosa',              2, 'ally',       '{}'),
  (gen_random_uuid(), 'emporio-ivankov',    'Emporio Ivankov',    'Miracle Person',    'Revolutionary Army',     3, 'commander',  ARRAY['Ivankov']),
  (gen_random_uuid(), 'donquixote-rosinante','Donquixote Rosinante','Corazon',         'Marines',                3, 'agent',      ARRAY['Rosinante', 'Corazon']),
  (gen_random_uuid(), 'x-drake',            'X Drake',            'Rear Admiral',      'Marines',                3, 'captain',    ARRAY['Drake']),
  (gen_random_uuid(), 'basil-hawkins',      'Basil Hawkins',      'Magician',          'Hawkins Pirates',        3, 'captain',    ARRAY['Hawkins']),
  (gen_random_uuid(), 'scratchmen-apoo',    'Scratchmen Apoo',    'Roar of the Sea',   'On Air Pirates',         3, 'captain',    ARRAY['Apoo']),
  (gen_random_uuid(), 'charlotte-pudding',  'Charlotte Pudding',  'Three-Eye',         'Big Mom Pirates',        3, 'ally',       ARRAY['Pudding']),
  (gen_random_uuid(), 'charlotte-brulee',   'Charlotte Brulee',   'Mirror World',      'Big Mom Pirates',        3, 'ally',       ARRAY['Brulee']),
  (gen_random_uuid(), 'inuarashi',          'Inuarashi',          'Ruler of Day',      'Mink Tribe',             3, 'ruler',      '{}'),
  (gen_random_uuid(), 'nekomamushi',        'Nekomamushi',        'Ruler of Night',    'Mink Tribe',             3, 'ruler',      '{}'),
  (gen_random_uuid(), 'shirahoshi',         'Shirahoshi',         'Mermaid Princess',  'Ryugu Kingdom',          3, 'royalty',    '{}'),
  (gen_random_uuid(), 'jack',               'Jack',               'The Drought',       'Beasts Pirates',         3, 'commander',  '{}'),
  (gen_random_uuid(), 'ulti',               'Ulti',               'Tobi Roppo',        'Beasts Pirates',         3, 'officer',    '{}'),
  (gen_random_uuid(), 'page-one',           'Page One',           'Tobi Roppo',        'Beasts Pirates',         3, 'officer',    '{}'),
  (gen_random_uuid(), 'enel',               'Enel',               'God of Skypiea',    'Skypiea',                2, 'villain',    ARRAY['Eneru']),
  (gen_random_uuid(), 'vinsmoke-reiju',     'Vinsmoke Reiju',     'Poison Pink',       'Germa 66',              3, 'commander',  ARRAY['Reiju']),
  (gen_random_uuid(), 'vinsmoke-ichiji',    'Vinsmoke Ichiji',    'Sparking Red',      'Germa 66',              3, 'commander',  ARRAY['Ichiji']),
  (gen_random_uuid(), 'vinsmoke-niji',      'Vinsmoke Niji',      'Dengeki Blue',      'Germa 66',              3, 'commander',  ARRAY['Niji']),
  (gen_random_uuid(), 'vinsmoke-yonji',     'Vinsmoke Yonji',     'Winch Green',       'Germa 66',              3, 'commander',  ARRAY['Yonji']),
  (gen_random_uuid(), 'vinsmoke-judge',     'Vinsmoke Judge',     'Garuda',            'Germa 66',              2, 'captain',    ARRAY['Judge']),
  (gen_random_uuid(), 'issho',              'Issho',              'Fujitora',          'Marines',                2, 'admiral',    ARRAY['Fujitora']),
  (gen_random_uuid(), 'tashigi',            'Tashigi',            'Marine Captain',    'Marines',                3, 'captain',    '{}'),
  (gen_random_uuid(), 'sengoku',            'Sengoku',            'The Buddha',        'Marines',                2, 'admiral',    '{}'),
  (gen_random_uuid(), 'magellan',           'Magellan',           'Warden',            'Impel Down',             2, 'warden',     '{}'),
  (gen_random_uuid(), 'kozuki-oden',        'Kozuki Oden',        'Samurai Legend',    'Wano Country',           2, 'samurai',    ARRAY['Oden']),
  (gen_random_uuid(), 'arlong',             'Arlong',             'Saw-Tooth',         'Arlong Pirates',         3, 'captain',    '{}'),
  (gen_random_uuid(), 'kuro',               'Kuro',               'Captain Kuro',      'Black Cat Pirates',      3, 'captain',    ARRAY['Captain Kuro']),
  (gen_random_uuid(), 'hody-jones',         'Hody Jones',         'New Fish-Man',      'New Fish-Man Pirates',   3, 'captain',    ARRAY['Hody'])
ON CONFLICT (slug) DO UPDATE SET aliases = EXCLUDED.aliases;
