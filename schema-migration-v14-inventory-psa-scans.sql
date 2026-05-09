-- Migration v14: PSA graded inventory imports and scan images.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS certification_number text,
  ADD COLUMN IF NOT EXISTS custom_image_front_url text,
  ADD COLUMN IF NOT EXISTS custom_image_back_url text;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_graded_rating_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_graded_rating_check
  CHECK (
    graded_rating IS NULL OR
    graded_rating IN (
      'TAG 10',
      'PSA 10',
      'PSA 9',
      'PSA 8.5',
      'PSA 8',
      'PSA 7.5',
      'PSA 7',
      'PSA 6.5',
      'PSA 6',
      'PSA 5.5',
      'PSA 5',
      'PSA 4.5',
      'PSA 4',
      'PSA 3.5',
      'PSA 3',
      'PSA 2.5',
      'PSA 2',
      'PSA 1.5',
      'PSA 1',
      'PSA Authentic',
      'BGS 10',
      'BGS 9.5'
    )
  );

CREATE INDEX IF NOT EXISTS idx_inventory_items_certification_number
  ON inventory_items(certification_number)
  WHERE certification_number IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-scans',
  'inventory-scans',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "inventory scans are publicly readable" ON storage.objects;
CREATE POLICY "inventory scans are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'inventory-scans');

DROP POLICY IF EXISTS "service_role can manage inventory scans" ON storage.objects;
CREATE POLICY "service_role can manage inventory scans"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'inventory-scans')
WITH CHECK (bucket_id = 'inventory-scans');

