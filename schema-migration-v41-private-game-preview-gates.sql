-- Migration v41: keep second-game catalogs private until launch approval.
--
-- Run after v40. Riftbound is intentionally active for admin ingest and smoke
-- testing, but must not be public until asset/legal approval and launch review
-- are complete.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE slug = 'riftbound') THEN
    RAISE EXCEPTION 'games.slug = riftbound is required before running v41';
  END IF;
END $$;

UPDATE public.games
SET
  is_active = true,
  is_public = false,
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'route_slug', COALESCE(metadata->>'route_slug', 'riftbound'),
      'asset_status', 'legal_review_required',
      'pricing_status', COALESCE(metadata->>'pricing_status', 'deferred'),
      'catalog_provider', COALESCE(metadata->>'catalog_provider', 'riftcodex'),
      'public_launch_gate', 'riot_asset_approval_required'
    ),
  updated_at = now()
WHERE slug = 'riftbound';

NOTIFY pgrst, 'reload schema';

COMMIT;
