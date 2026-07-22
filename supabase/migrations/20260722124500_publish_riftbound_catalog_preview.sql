-- Publish the Riftbound catalog preview with approved TCGplayer product
-- imagery. Other third-party asset sources remain deferred.

begin;

update public.games
set
  is_active = true,
  is_public = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'launch_status', 'public_catalog_preview',
    'public_launch_scope', 'catalog_and_tcgplayer_images',
    'public_launch_gate', 'tcgplayer_images_only',
    'asset_status', 'tcgplayer_images_approved',
    'pricing_status', 'deferred'
  ),
  updated_at = now()
where slug = 'riftbound';

commit;
