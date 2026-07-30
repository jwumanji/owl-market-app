begin;

with target_card as (
  select cards.id
  from public.cards cards
  join public.games games on games.id = cards.game_id
  where games.slug = 'one_piece'
    and cards.card_image_id = 'P-OP14-112'
)
update public.card_market_name_suggestions suggestions
set
  proposed_market_name = 'Championship Boa (Top 64 Winner)',
  proposed_aliases = array[
    'Top 64 Boa',
    'Top 64 Winner Boa',
    'Boa Top 64 Prize',
    'Regional Top 64 Boa',
    'OP14-112 Top 64 Boa',
    'Championship Boa',
    'CS Boa'
  ],
  research_note = 'TCGplayer confirms that Top 64 finishers earn this exact OP14-112 Boa Hancock alternate-art prize.',
  updated_at = now()
from target_card
where suggestions.card_id = target_card.id
  and suggestions.status = 'pending'
  and suggestions.proposed_market_name = 'Championship Boa';

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
  'tcgplayer_editorial',
  'TCGplayer',
  'https://www.tcgplayer.com/content/article/The-One-Piece-Card-Game-s-Organized-Play-System-Explained/9de155b5-7e73-400b-8e59-06ead018079d/',
  'The One Piece Card Game organized play system, explained',
  'Explicitly states that Top 64 earns the OP14-112 Boa Hancock alternate-art card.'
from public.card_market_name_suggestions suggestions
join public.cards cards on cards.id = suggestions.card_id
join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
where cards.card_image_id = 'P-OP14-112'
  and suggestions.proposed_market_name = 'Championship Boa (Top 64 Winner)'
on conflict (suggestion_id, source_url) do nothing;

commit;
