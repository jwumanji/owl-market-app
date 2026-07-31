begin;

update public.cards cards
set
  image_url = 'https://tcgplayer-cdn.tcgplayer.com/product/503023_in_1000x1000.jpg',
  image_url_small = 'https://tcgplayer-cdn.tcgplayer.com/product/503023_in_1000x1000.jpg',
  image_url_preview = 'https://tcgplayer-cdn.tcgplayer.com/product/503023_in_1000x1000.jpg',
  image_source_url = 'https://tcgplayer-cdn.tcgplayer.com/product/503023_in_1000x1000.jpg',
  image_storage_path = null,
  image_mirror_status = 'pending',
  image_mirror_error = null,
  updated_at = now()
from public.games games
where cards.game_id = games.id
  and games.slug = 'one_piece'
  and cards.card_image_id = 'P-001-store-championship'
  and cards.name = 'Monkey.D.Luffy (Store Championship Trophy Card)';

commit;
