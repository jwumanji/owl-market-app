begin;

delete from public.card_market_name_suggestions suggestions
using public.cards cards, public.games games
where suggestions.card_id = cards.id
  and cards.game_id = games.id
  and games.slug = 'one_piece'
  and cards.card_image_id = 'OP09-051'
  and suggestions.proposed_market_name = 'Manga Buggy'
  and suggestions.status = 'pending';

commit;
