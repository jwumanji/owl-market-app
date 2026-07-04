-- Migration v24: Add card identity to centering measurements.
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

ALTER TABLE public.centering_measurements
  ADD COLUMN IF NOT EXISTS card_identity text NULL;

NOTIFY pgrst, 'reload schema';
