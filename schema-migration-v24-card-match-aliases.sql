-- Migration v24: Learned card match aliases
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS card_match_aliases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name               text NOT NULL,
  normalized_name        text NOT NULL,
  raw_card_number        text,
  normalized_card_number text NOT NULL DEFAULT '',
  raw_set_hint           text,
  normalized_set_hint    text NOT NULL DEFAULT '',
  source_type            text NOT NULL DEFAULT 'other',
  card_id                uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  times_used             integer NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  last_used_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_match_aliases_source_type_check
    CHECK (source_type IN ('psa_import', 'manual_inventory', 'other')),
  CONSTRAINT card_match_aliases_normalized_name_check
    CHECK (length(normalized_name) >= 2),
  CONSTRAINT card_match_aliases_times_used_check
    CHECK (times_used >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_match_aliases_unique_source
  ON card_match_aliases(source_type, normalized_name, normalized_card_number, normalized_set_hint);

CREATE INDEX IF NOT EXISTS idx_card_match_aliases_card_id
  ON card_match_aliases(card_id);

CREATE INDEX IF NOT EXISTS idx_card_match_aliases_normalized_name
  ON card_match_aliases(normalized_name);

CREATE INDEX IF NOT EXISTS idx_card_match_aliases_source_type
  ON card_match_aliases(source_type);

ALTER TABLE card_match_aliases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE card_match_aliases TO service_role;

DROP POLICY IF EXISTS "service_role can manage card_match_aliases" ON card_match_aliases;
CREATE POLICY "service_role can manage card_match_aliases"
ON card_match_aliases
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
