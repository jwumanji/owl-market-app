begin;

with target as (
  select cards.id
  from public.cards cards
  join public.games games
    on games.id = cards.game_id
   and games.slug = 'one_piece'
  where cards.card_image_id = 'P-001-alt-art-promo'
)
update public.cards cards
set
  image_url = 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_01.png?v2',
  image_url_small = 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_01.png?v2',
  image_url_preview = 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_01.png?v2',
  image_source_url = 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_01.png?v2',
  image_storage_path = null,
  image_mirror_status = 'external',
  image_mirror_error = null,
  image_mirrored_at = null,
  updated_at = now()
from target
where cards.id = target.id;

update public.card_printings printings
set
  image_url = 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_01.png?v2',
  metadata = coalesce(printings.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'image_source', 'official_bandai',
      'image_repair', '25th_edition_luffy_404'
    ),
  updated_at = now()
from public.cards cards
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
where printings.legacy_card_id = cards.id
  and cards.card_image_id = 'P-001-alt-art-promo';

commit;
