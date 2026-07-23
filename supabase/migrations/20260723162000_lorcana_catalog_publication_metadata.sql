-- Keep catalog publication distinct from price and asset publication.

begin;

update public.games
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'catalog_status', 'live',
    'catalog_publication_status', 'live',
    'publication_status', 'disabled',
    'pricing_status', 'staged_raw_only',
    'asset_status', 'awaiting_commercial_use_clearance',
    'asset_writes_enabled', false
  ),
  updated_at = now()
where slug = 'lorcana'
  and is_public = true;

commit;
