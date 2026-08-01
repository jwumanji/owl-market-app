begin;

with products(card_image_id, tcg_product_id) as (
  values
    (
      'ST01-006-alt-art-promo',
      'one-piece-card-game-one-piece-promotion-cards-tony-tony-chopper-st01-006-alternate-art-promo'
    ),
    (
      'ST01-010-alt-art-promo',
      'one-piece-card-game-one-piece-promotion-cards-franky-st01-010-alternate-art-promo'
    )
)
update public.cards cards
set
  tcg_product_id = products.tcg_product_id,
  updated_at = now()
from products, public.games games
where games.id = cards.game_id
  and games.slug = 'one_piece'
  and cards.card_image_id = products.card_image_id;

insert into public.card_external_ids (
  game_id,
  card_id,
  provider,
  external_id,
  external_type,
  metadata
)
select
  cards.game_id,
  cards.id,
  'justtcg',
  cards.tcg_product_id,
  'product_id',
  jsonb_build_object('source', 'cards.tcg_product_id')
from public.cards cards
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where cards.card_image_id in (
  'ST01-006-alt-art-promo',
  'ST01-010-alt-art-promo'
)
on conflict (card_id, provider, external_type) do update
set
  external_id = excluded.external_id,
  metadata = excluded.metadata,
  updated_at = now();

commit;
