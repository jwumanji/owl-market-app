-- v34 · centering_measurements: persist BGS + TAG centering ceilings alongside psa_ceiling.
--
-- Nullable columns with a NULL-tolerant CHECK, so the add is a fast catalog-only change and every
-- existing row passes (they stay NULL). Old rows are recomputable from worst_axis_max_pct + face,
-- and a separate, approved backfill (WHERE bgs_ceiling IS NULL) will populate them later — held for
-- now since nothing reads these columns yet (the UI recomputes for display).
--
-- Enum values mirror BgsGrade / TagGrade in src/lib/centering-math.ts (the single source of truth).

ALTER TABLE public.centering_measurements
  ADD COLUMN IF NOT EXISTS bgs_ceiling text,
  ADD COLUMN IF NOT EXISTS tag_ceiling text;

ALTER TABLE public.centering_measurements
  DROP CONSTRAINT IF EXISTS centering_measurements_bgs_ceiling_check;
ALTER TABLE public.centering_measurements
  ADD CONSTRAINT centering_measurements_bgs_ceiling_check
  CHECK (
    bgs_ceiling IS NULL OR bgs_ceiling IN (
      'BGS_10',
      'BGS_9_5',
      'BGS_9',
      'BGS_8_5',
      'BGS_8',
      'BGS_7_5',
      'BGS_7',
      'BGS_6_5',
      'BGS_6_OR_LESS'
    )
  );

ALTER TABLE public.centering_measurements
  DROP CONSTRAINT IF EXISTS centering_measurements_tag_ceiling_check;
ALTER TABLE public.centering_measurements
  ADD CONSTRAINT centering_measurements_tag_ceiling_check
  CHECK (
    tag_ceiling IS NULL OR tag_ceiling IN (
      'TAG_10_PRISTINE',
      'TAG_10_GEM_MINT',
      'TAG_9',
      'TAG_8',
      'TAG_7',
      'TAG_6',
      'TAG_5',
      'TAG_4_OR_LESS',
      'TAG_7_OR_LESS',
      'TAG_6_OR_LESS'
    )
  );

-- DOWN (manual rollback — fully reversible; dropped values are recomputable from worst_axis_max_pct):
-- ALTER TABLE public.centering_measurements
--   DROP CONSTRAINT IF EXISTS centering_measurements_bgs_ceiling_check,
--   DROP CONSTRAINT IF EXISTS centering_measurements_tag_ceiling_check,
--   DROP COLUMN IF EXISTS bgs_ceiling,
--   DROP COLUMN IF EXISTS tag_ceiling;
