-- Migration v25: Add face and session grouping to centering measurements.
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

ALTER TABLE public.centering_measurements
  ADD COLUMN IF NOT EXISTS face text,
  ADD COLUMN IF NOT EXISTS card_session_id uuid NULL;

-- Existing rows are legacy single-face measurements.
UPDATE public.centering_measurements
SET face = 'front'
WHERE face IS NULL;

ALTER TABLE public.centering_measurements
  ALTER COLUMN face SET DEFAULT 'front',
  ALTER COLUMN face SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'centering_measurements_face_check'
      AND conrelid = 'public.centering_measurements'::regclass
  ) THEN
    ALTER TABLE public.centering_measurements
      ADD CONSTRAINT centering_measurements_face_check
      CHECK (face IN ('front', 'back'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
