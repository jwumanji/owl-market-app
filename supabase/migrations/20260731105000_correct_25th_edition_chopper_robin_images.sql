begin;

-- Bandai's product gallery orders Nico Robin before Tony Tony.Chopper.
-- The preceding collection-wide repair accidentally inferred the opposite
-- order, so correct these two exact printings from the card numbers printed
-- on the official images.
with official_images(card_image_id, image_url) as (
  values
    ('P-ST01-008', 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_06.png?v2'),
    ('ST01-006-alt-art-promo', 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_07.png?v2')
)
update public.cards cards
set
  image_url = official_images.image_url,
  image_url_small = official_images.image_url,
  image_url_preview = official_images.image_url,
  image_source_url = official_images.image_url,
  image_storage_path = null,
  image_mirror_status = 'external',
  image_mirror_error = null,
  image_mirrored_at = null,
  updated_at = now()
from official_images, public.games games
where games.id = cards.game_id
  and games.slug = 'one_piece'
  and cards.card_image_id = official_images.card_image_id;

with official_images(card_image_id, image_url) as (
  values
    ('P-ST01-008', 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_06.png?v2'),
    ('ST01-006-alt-art-promo', 'https://en.onepiece-cardgame.com/images/products/other/cardcollection25th/card_07.png?v2')
)
update public.card_printings printings
set
  image_url = official_images.image_url,
  metadata = coalesce(printings.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'image_source', 'official_bandai',
      'image_repair', '25th_edition_chopper_robin_exact_artwork'
    ),
  updated_at = now()
from public.cards cards
join public.games games
  on games.id = cards.game_id
 and games.slug = 'one_piece'
join official_images
  on official_images.card_image_id = cards.card_image_id
where printings.legacy_card_id = cards.id;

commit;
