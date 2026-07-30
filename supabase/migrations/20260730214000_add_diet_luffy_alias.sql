begin;

with target_card as (
  select cards.id
  from public.cards cards
  join public.games games on games.id = cards.game_id
  where games.slug = 'one_piece'
    and cards.card_image_id = 'P-ST21-014'
)
update public.card_market_name_suggestions suggestions
set
  proposed_aliases = array[
    'Treasure Campaign Luffy',
    '3rd Anniversary Luffy',
    'ST21 Anniversary Luffy',
    'ST21 Treasure Luffy',
    'Diet Luffy',
    'Diet Serial Luffy'
  ],
  research_note = 'The formal name preserves the 3rd Anniversary Treasure Campaign identity; collector discussions and marketplace listings consistently call this exact ST21-014 printing Diet Luffy or Diet Serial Luffy.',
  updated_at = now()
from target_card
where suggestions.card_id = target_card.id
  and suggestions.status = 'pending'
  and suggestions.proposed_market_name = '3rd Anniversary Treasure Luffy';

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
  'marketplace',
  'PriceCharting and eBay',
  'https://www.pricecharting.com/game/one-piece-promo/monkeydluffy-3rd-anniversary-st21-014',
  'Monkey.D.Luffy 3rd Anniversary ST21-014 prices',
  'Sold marketplace listings use Diet Luffy and Diet Serial for this exact ST21-014 printing.'
from public.card_market_name_suggestions suggestions
join public.cards cards on cards.id = suggestions.card_id
join public.games games on games.id = cards.game_id and games.slug = 'one_piece'
where cards.card_image_id = 'P-ST21-014'
  and suggestions.proposed_market_name = '3rd Anniversary Treasure Luffy'
on conflict (suggestion_id, source_url) do nothing;

commit;
