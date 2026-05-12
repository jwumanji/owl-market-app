-- v15: Persistent cursor for scheduled sync/backfill jobs.
-- Run this before enabling /api/sync/justtcg-history in production.

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
