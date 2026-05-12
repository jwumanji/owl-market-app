-- v16: Price history hardening.
-- Run this before enabling regular JustTCG history backfill jobs.
--
-- This migration is non-destructive. It adds insertion/source metadata and
-- recreates sync_state if v15 has not been applied in Supabase yet.

CREATE TABLE IF NOT EXISTS sync_state (
  key         text PRIMARY KEY,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at   timestamptz,
  lock_owner  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at
  ON sync_state(updated_at DESC);

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE price_history
  ALTER COLUMN source SET DEFAULT 'app_sync';

CREATE INDEX IF NOT EXISTS idx_price_history_card_recorded_at
  ON price_history(card_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_history_source_created_at
  ON price_history(source, created_at DESC);

-- After cleanup has removed duplicate card/day rows, run this manually to
-- enforce one history point per card per UTC day. Keep it separate because it
-- will fail while legacy duplicates still exist.
--
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_price_history_card_utc_day
--   ON price_history (card_id, ((recorded_at AT TIME ZONE 'UTC')::date));
