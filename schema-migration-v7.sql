-- schema-migration-v7.sql
-- Seeds ~30 additional characters identified from audit unmatched frequency analysis
-- Safe to run multiple times (idempotent via ON CONFLICT)

INSERT INTO characters (id, slug, name, subtitle, faction, tier, type_tag, aliases) VALUES
  -- Major players (12+ unmatched cards)
  (gen_random_uuid(), 'silvers-rayleigh',    'Silvers Rayleigh',    'Dark King',          'Roger Pirates',          1, 'legend',     ARRAY['Rayleigh']),
  (gen_random_uuid(), 'bartolomeo',          'Bartolomeo',          'Cannibal',           'Barto Club',             3, 'captain',    '{}'),
  (gen_random_uuid(), 'cavendish',           'Cavendish',           'White Horse',        'Beautiful Pirates',      3, 'captain',    ARRAY['Hakuba']),
  (gen_random_uuid(), 'capone-bege',         'Capone Bege',         'Gang',               'Fire Tank Pirates',      3, 'captain',    ARRAY['Bege', 'Capone"Gang"Bege']),
  (gen_random_uuid(), 'koala',               'Koala',               'Revolutionary',      'Revolutionary Army',     3, 'officer',    '{}'),

  -- Wano Country characters
  (gen_random_uuid(), 'monkey-d-dragon',     'Monkey D. Dragon',    'World''s Worst Criminal', 'Revolutionary Army', 2, 'leader',    ARRAY['Dragon']),
  (gen_random_uuid(), 'kouzuki-momonosuke',  'Kouzuki Momonosuke',  'Shogun of Wano',     'Wano Country',           3, 'ruler',      ARRAY['Momonosuke']),
  (gen_random_uuid(), 'kouzuki-hiyori',      'Kouzuki Hiyori',      'Komurasaki',         'Wano Country',           3, 'royalty',    ARRAY['Hiyori', 'Komurasaki']),
  (gen_random_uuid(), 'kinemon',             'Kin''emon',           'Foxfire',            'Wano Country',           3, 'samurai',    ARRAY['Kinemon', 'Kin''emon']),
  (gen_random_uuid(), 'denjiro',             'Denjiro',             'Kyoshirou',          'Wano Country',           3, 'samurai',    ARRAY['Kyoshirou']),
  (gen_random_uuid(), 'otama',               'Otama',               'Kunoichi',           'Wano Country',           3, 'ally',       ARRAY['O-Tama']),
  (gen_random_uuid(), 'kawamatsu',           'Kawamatsu',           'Kappa',              'Wano Country',           3, 'samurai',    '{}'),
  (gen_random_uuid(), 'raizo',               'Raizo',               'Raizo of the Mist',  'Wano Country',           3, 'samurai',    '{}'),
  (gen_random_uuid(), 'okiku',               'Okiku',               'Kikunojo',           'Wano Country',           3, 'samurai',    ARRAY['Kikunojo']),
  (gen_random_uuid(), 'shinobu',             'Shinobu',             'Kunoichi',           'Wano Country',           3, 'ally',       '{}'),
  (gen_random_uuid(), 'kurozumi-orochi',     'Kurozumi Orochi',     'Shogun',             'Wano Country',           3, 'villain',    ARRAY['Orochi']),

  -- Kid Pirates / Supernovas
  (gen_random_uuid(), 'killer',              'Killer',              'Massacre Soldier',   'Kid Pirates',            3, 'commander',  '{}'),

  -- Donquixote Pirates
  (gen_random_uuid(), 'baby-5',              'Baby 5',              'Weapons Girl',       'Donquixote Pirates',     3, 'officer',    '{}'),
  (gen_random_uuid(), 'sugar',               'Sugar',               'Hobby Hobby',        'Donquixote Pirates',     3, 'officer',    '{}'),
  (gen_random_uuid(), 'vergo',               'Vergo',               'Demon Bamboo',       'Donquixote Pirates',     3, 'officer',    '{}'),
  (gen_random_uuid(), 'monet',               'Monet',               'Snow Woman',         'Donquixote Pirates',     3, 'officer',    '{}'),

  -- Big Mom Pirates
  (gen_random_uuid(), 'charlotte-perospero', 'Charlotte Perospero', 'Candy Minister',    'Big Mom Pirates',        3, 'commander',  ARRAY['Perospero']),

  -- Baroque Works
  (gen_random_uuid(), 'mr2-bon-kurei',       'Mr.2 Bon Kurei',      'Bentham',           'Baroque Works',          3, 'officer',    ARRAY['Bentham', 'Bon Kurei', 'Bon Clay', 'Mr.2.Bon.Kurei']),
  (gen_random_uuid(), 'mr1-daz-bonez',       'Mr.1',                'Daz Bonez',         'Baroque Works',          3, 'officer',    ARRAY['Daz Bonez', 'Daz.Bonez', 'Mr.1']),
  (gen_random_uuid(), 'mr3-galdino',         'Mr.3',                'Galdino',           'Baroque Works',          3, 'officer',    ARRAY['Galdino', 'Mr.3']),

  -- Revolutionary Army
  (gen_random_uuid(), 'belo-betty',          'Belo Betty',          'East Army Commander','Revolutionary Army',     3, 'commander',  ARRAY['Betty']),
  (gen_random_uuid(), 'inazuma',             'Inazuma',             'Scissors',           'Revolutionary Army',     3, 'officer',    '{}'),

  -- Marines
  (gen_random_uuid(), 'helmeppo',            'Helmeppo',            'Marine Lieutenant',  'Marines',                3, 'officer',    '{}'),
  (gen_random_uuid(), 'hina',                'Hina',                'Black Cage',         'Marines',                3, 'captain',    '{}'),

  -- CP9
  (gen_random_uuid(), 'kalifa',              'Kalifa',              'CP9 Agent',          'CP9',                    3, 'agent',      '{}'),

  -- Dressrosa
  (gen_random_uuid(), 'kyros',               'Kyros',               'Legendary Gladiator','Dressrosa',              3, 'warrior',    '{}'),

  -- Beasts Pirates
  (gen_random_uuid(), 'black-maria',         'Black Maria',         'Tobi Roppo',        'Beasts Pirates',         3, 'officer',    '{}'),
  (gen_random_uuid(), 'whos-who',            'Who''s-Who',          'Tobi Roppo',        'Beasts Pirates',         3, 'officer',    ARRAY['Who''s.Who']),
  (gen_random_uuid(), 'sasaki',              'Sasaki',              'Tobi Roppo',        'Beasts Pirates',         3, 'officer',    '{}'),

  -- Punk Hazard
  (gen_random_uuid(), 'caesar-clown',        'Caesar Clown',        'Master',            'Punk Hazard',            3, 'scientist',  ARRAY['Caesar']),

  -- East Blue villains
  (gen_random_uuid(), 'bellamy',             'Bellamy',             'Hyena',              'Bellamy Pirates',        3, 'captain',    '{}'),
  (gen_random_uuid(), 'alvida',              'Alvida',              'Iron Mace',          'Alvida Pirates',         3, 'captain',    '{}'),
  (gen_random_uuid(), 'krieg',               'Krieg',               'Don',                'Krieg Pirates',          3, 'captain',    ARRAY['Don Krieg']),

  -- Whitebeard Pirates
  (gen_random_uuid(), 'izo',                 'Izo',                 'Commander',          'Whitebeard Pirates',     3, 'commander',  '{}'),

  -- Other
  (gen_random_uuid(), 'bepo',                'Bepo',                'Navigator',          'Heart Pirates',          3, 'navigator',  '{}'),
  (gen_random_uuid(), 'duval',               'Duval',               'Flying Fish Riders', 'Flying Fish Riders',    3, 'captain',    '{}')
ON CONFLICT (slug) DO UPDATE SET aliases = EXCLUDED.aliases;
