-- Migration v26: Add stored image URL and quad overlay geometry.
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

ALTER TABLE public.centering_measurements
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS overlay_geometry jsonb;

UPDATE public.centering_measurements
SET overlay_geometry = '{}'::jsonb
WHERE overlay_geometry IS NULL;

ALTER TABLE public.centering_measurements
  ALTER COLUMN overlay_geometry SET DEFAULT '{}'::jsonb,
  ALTER COLUMN overlay_geometry SET NOT NULL;

NOTIFY pgrst, 'reload schema';
