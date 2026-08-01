begin;

-- The Premium Card Collection -Leader Collection- was sold at BANDAI Card
-- Games Fest 24-25 APAC stops, but it was also sold at Championship 2024
-- Finals WAVE3. Treat Leader Collection as the product identity and keep the
-- event venues only as distribution history in the research notes.
with corrected(card_image_id, old_name, new_name, aliases, research_note) as (
  values
    (
      'ST13-001-premium-card-collection',
      'Gold Text Sabo (BANDAI Fest 24-25)',
      'Gold Text Sabo (Leader Collection)',
      array['Sabo Gold Text Leader', 'Leader Collection Sabo', 'ST13-001 Gold Text Sabo', 'Gold Leader Sabo'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    ),
    (
      'ST13-002-premium-card-collection',
      'Gold Text Ace (BANDAI Fest 24-25)',
      'Gold Text Ace (Leader Collection)',
      array['Ace Gold Text Leader', 'Leader Collection Ace', 'ST13-002 Gold Text Ace', 'Gold Leader Portgas D Ace'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    ),
    (
      'ST13-003-premium-card-collection',
      'Gold Text Luffy (BANDAI Fest 24-25)',
      'Gold Text Luffy (Leader Collection)',
      array['Luffy Gold Text Leader', 'Leader Collection Luffy', 'ST13-003 Gold Text Luffy', 'Gold Text Leader Collection Luffy'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    ),
    (
      'ST03-001-premium-card-collection',
      'Gold Text Crocodile (BANDAI Fest 24-25)',
      'Gold Text Crocodile (Leader Collection)',
      array['Crocodile Gold Text Leader', 'Leader Collection Crocodile', 'ST03-001 Gold Text Crocodile', 'Gold Leader Crocodile'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    ),
    (
      'ST04-001-premium-card-collection',
      'Gold Text Kaido (BANDAI Fest 24-25)',
      'Gold Text Kaido (Leader Collection)',
      array['Kaido Gold Text Leader', 'Leader Collection Kaido', 'ST04-001 Gold Text Kaido', 'Gold Leader Kaido'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    ),
    (
      'ST02-001-premium-card-collection',
      'Gold Text Eustass Kid (BANDAI Fest 24-25)',
      'Gold Text Eustass Kid (Leader Collection)',
      array['Kid Gold Text Leader', 'Leader Collection Kid', 'ST02-001 Gold Text Kid', 'Gold Leader Eustass Kid'],
      'Gold-text parallel from Premium Card Collection -Leader Collection-. The product was sold at multiple venues, including BANDAI Card Games Fest 24-25 APAC stops and Championship 2024 Finals WAVE3, so event branding is excluded from the market name.'
    )
)
update public.card_market_name_suggestions suggestions
set
  proposed_market_name = corrected.new_name,
  proposed_aliases = corrected.aliases,
  research_note = corrected.research_note,
  updated_at = now()
from corrected
join public.cards cards
  on cards.card_image_id = corrected.card_image_id
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where suggestions.card_id = cards.id
  and suggestions.proposed_market_name = corrected.old_name;

with corrected(card_image_id, old_name, new_name) as (
  values
    ('ST13-001-premium-card-collection', 'Gold Text Sabo (BANDAI Fest 24-25)', 'Gold Text Sabo (Leader Collection)'),
    ('ST13-002-premium-card-collection', 'Gold Text Ace (BANDAI Fest 24-25)', 'Gold Text Ace (Leader Collection)'),
    ('ST13-003-premium-card-collection', 'Gold Text Luffy (BANDAI Fest 24-25)', 'Gold Text Luffy (Leader Collection)'),
    ('ST03-001-premium-card-collection', 'Gold Text Crocodile (BANDAI Fest 24-25)', 'Gold Text Crocodile (Leader Collection)'),
    ('ST04-001-premium-card-collection', 'Gold Text Kaido (BANDAI Fest 24-25)', 'Gold Text Kaido (Leader Collection)'),
    ('ST02-001-premium-card-collection', 'Gold Text Eustass Kid (BANDAI Fest 24-25)', 'Gold Text Eustass Kid (Leader Collection)')
)
update public.cards cards
set
  market_name = corrected.new_name,
  updated_at = now()
from corrected, public.games games
where games.id = cards.game_id
  and games.slug = 'one_piece'
  and cards.card_image_id = corrected.card_image_id
  and cards.market_name = corrected.old_name
  and exists (
    select 1
    from public.card_market_name_suggestions suggestions
    where suggestions.card_id = cards.id
      and suggestions.status = 'approved'
      and suggestions.proposed_market_name = corrected.new_name
  );

with event_aliases(card_image_id, alias) as (
  values
    ('ST13-001-premium-card-collection', 'BANDAI Fest Sabo Leader'),
    ('ST13-002-premium-card-collection', 'BANDAI Fest Ace Leader'),
    ('ST13-003-premium-card-collection', 'BANDAI Fest Leader Luffy'),
    ('ST03-001-premium-card-collection', 'BANDAI Fest Crocodile Leader'),
    ('ST04-001-premium-card-collection', 'BANDAI Fest Kaido Leader'),
    ('ST02-001-premium-card-collection', 'BANDAI Fest Kid Leader')
)
delete from public.card_market_aliases aliases
using event_aliases, public.cards cards, public.games games
where cards.card_image_id = event_aliases.card_image_id
  and games.id = cards.game_id
  and games.slug = 'one_piece'
  and aliases.card_id = cards.id
  and aliases.alias = event_aliases.alias;

with evidence_notes(card_image_id, evidence_note) as (
  values
    ('ST13-001-premium-card-collection', 'Marketplace title identifies ST13-001 as Sabo Gold Text from Premium Card Collection -Leader Collection-.'),
    ('ST13-002-premium-card-collection', 'Lists Ace ST13-002 in the six-card Premium Card Collection -Leader Collection- and documents sales at both BANDAI Fest APAC stops and Championship 2024 Finals WAVE3.'),
    ('ST13-003-premium-card-collection', 'Investor reference distinguishes this ST13-003 Gold Text Leader Collection printing from the silver-text version.'),
    ('ST03-001-premium-card-collection', 'Lists Crocodile ST03-001 in the six-card Premium Card Collection -Leader Collection- and documents sales at both BANDAI Fest APAC stops and Championship 2024 Finals WAVE3.'),
    ('ST04-001-premium-card-collection', 'Marketplace sales identify this exact ST04-001 printing as Gold Text Kaido from the Leader Collection.'),
    ('ST02-001-premium-card-collection', 'Lists Eustass Kid ST02-001 in the six-card Premium Card Collection -Leader Collection- and documents sales at both BANDAI Fest APAC stops and Championship 2024 Finals WAVE3.')
)
update public.card_market_name_evidence evidence
set evidence_note = evidence_notes.evidence_note
from evidence_notes
join public.cards cards
  on cards.card_image_id = evidence_notes.card_image_id
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
join public.card_market_name_suggestions suggestions
  on suggestions.card_id = cards.id
where evidence.suggestion_id = suggestions.id;

commit;
