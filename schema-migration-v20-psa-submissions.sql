-- Migration v20: PSA submission tracking separate from inventory
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS psa_submissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  source_filename         text,
  submitted_at            date NOT NULL DEFAULT CURRENT_DATE,
  total_rows              integer NOT NULL DEFAULT 0,
  imported_count          integer NOT NULL DEFAULT 0,
  matched_count           integer NOT NULL DEFAULT 0,
  pending_match_count     integer NOT NULL DEFAULT 0,
  skipped_duplicate_count integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS psa_submission_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id        uuid NOT NULL REFERENCES psa_submissions(id) ON DELETE CASCADE,
  inventory_item_id    uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  row_number           integer NOT NULL,
  certification_number text,
  graded_rating        text,
  card_name            text,
  card_number          text,
  set_code             text,
  matched              boolean NOT NULL DEFAULT false,
  skipped_duplicate    boolean NOT NULL DEFAULT false,
  image_status         text,
  result_status        text NOT NULL DEFAULT 'imported',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psa_submissions_submitted_at
  ON psa_submissions(submitted_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_psa_submission_items_submission_id
  ON psa_submission_items(submission_id, row_number);

CREATE INDEX IF NOT EXISTS idx_psa_submission_items_certification
  ON psa_submission_items(certification_number);

ALTER TABLE psa_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE psa_submission_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE psa_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE psa_submission_items TO service_role;

DROP POLICY IF EXISTS "service_role can manage psa_submissions" ON psa_submissions;
CREATE POLICY "service_role can manage psa_submissions"
ON psa_submissions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role can manage psa_submission_items" ON psa_submission_items;
CREATE POLICY "service_role can manage psa_submission_items"
ON psa_submission_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
