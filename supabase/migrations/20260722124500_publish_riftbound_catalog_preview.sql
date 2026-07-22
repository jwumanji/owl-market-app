-- Publish the Riftbound catalog as a data-only preview. Third-party card
-- imagery stays deferred until the separate asset approval gate is cleared.

begin;

update public.games
set
  is_active = true,
  is_public = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'launch_status', 'public_catalog_preview',
    'public_launch_scope', 'catalog_metadata_only',
    'public_launch_gate', 'catalog_only_no_unapproved_assets',
    'asset_status', 'deferred_pending_approval',
    'pricing_status', 'deferred'
  ),
  updated_at = now()
where slug = 'riftbound';

commit;
