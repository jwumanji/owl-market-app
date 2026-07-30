begin;

with replacements(card_image_id, old_name, market_name, aliases, research_note) as (
  values
    ('EB03-053_p2', 'Portrait SP Nami', 'EB03 SP Nami', array['Portrait SP Nami', 'Nami Portrait SP', 'Heroines SP Nami'], 'The set-specific primary name is unambiguous; Portrait SP remains a collector search alias.'),
    ('EB03-026_p2', 'Portrait SP Boa', 'EB03 SP Boa', array['Portrait SP Boa', 'Boa Portrait SP', 'Boa Hancock Portrait SP', 'Heroines SP Boa'], 'The set-specific primary name is unambiguous; Portrait SP remains a collector search alias.'),
    ('EB03-055_p2', 'Portrait SP Robin', 'EB03 SP Nico Robin', array['Portrait SP Robin', 'Robin Portrait SP', 'Nico Robin Portrait SP', 'Heroines SP Robin'], 'The set-specific primary name uses the full character name; Portrait SP remains a collector search alias.')
), updated_suggestions as (
  update public.card_market_name_suggestions suggestions
  set
    proposed_market_name = replacements.market_name,
    proposed_aliases = replacements.aliases,
    confidence = 'high',
    research_note = replacements.research_note,
    updated_at = now()
  from public.cards cards
  join replacements on replacements.card_image_id = cards.card_image_id
  where suggestions.card_id = cards.id
    and suggestions.proposed_market_name = replacements.old_name
  returning suggestions.id, suggestions.card_id, suggestions.game_id, suggestions.status,
    suggestions.proposed_market_name, suggestions.proposed_aliases
), updated_cards as (
  update public.cards cards
  set
    market_name = updated_suggestions.proposed_market_name,
    market_name_updated_at = now()
  from updated_suggestions
  where updated_suggestions.status = 'approved'
    and cards.id = updated_suggestions.card_id
    and cards.game_id = updated_suggestions.game_id
  returning updated_suggestions.id
), removed_aliases as (
  delete from public.card_market_aliases aliases
  using updated_suggestions
  where updated_suggestions.status = 'approved'
    and aliases.source_suggestion_id = updated_suggestions.id
  returning aliases.id
)
insert into public.card_market_aliases (
  game_id,
  card_id,
  alias,
  source_suggestion_id,
  approved_at,
  updated_at
)
select
  updated_suggestions.game_id,
  updated_suggestions.card_id,
  alias_value,
  updated_suggestions.id,
  now(),
  now()
from updated_suggestions
cross join lateral unnest(updated_suggestions.proposed_aliases) alias_value
where updated_suggestions.status = 'approved'
on conflict on constraint card_market_aliases_card_alias_key
do update set
  alias = excluded.alias,
  source_suggestion_id = excluded.source_suggestion_id,
  approved_at = excluded.approved_at,
  updated_at = excluded.updated_at;

commit;
