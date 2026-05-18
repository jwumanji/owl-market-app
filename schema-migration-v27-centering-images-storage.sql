-- Migration v27: Private centering image storage.
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run
--
-- Object path convention:
--   {user_id}/{card_session_id}/{face}.{ext}
-- Example:
--   00000000-0000-0000-0000-000000000000/11111111-1111-1111-1111-111111111111/front.jpg

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'centering-images',
  'centering-images',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "centering images owners can read" ON storage.objects;
CREATE POLICY "centering images owners can read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'centering-images'
  AND auth.uid()::text = split_part(name, '/', 1)
);

DROP POLICY IF EXISTS "centering images owners can insert" ON storage.objects;
CREATE POLICY "centering images owners can insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'centering-images'
  AND auth.uid()::text = split_part(name, '/', 1)
  AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 3) ~* '^(front|back)\.(jpg|jpeg|png|webp)$'
  AND split_part(name, '/', 4) = ''
);

DROP POLICY IF EXISTS "centering images owners can update" ON storage.objects;
CREATE POLICY "centering images owners can update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'centering-images'
  AND auth.uid()::text = split_part(name, '/', 1)
)
WITH CHECK (
  bucket_id = 'centering-images'
  AND auth.uid()::text = split_part(name, '/', 1)
  AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 3) ~* '^(front|back)\.(jpg|jpeg|png|webp)$'
  AND split_part(name, '/', 4) = ''
);

DROP POLICY IF EXISTS "centering images owners can delete" ON storage.objects;
CREATE POLICY "centering images owners can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'centering-images'
  AND auth.uid()::text = split_part(name, '/', 1)
);

DROP POLICY IF EXISTS "service_role can manage centering images" ON storage.objects;
CREATE POLICY "service_role can manage centering images"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'centering-images')
WITH CHECK (bucket_id = 'centering-images');

NOTIFY pgrst, 'reload schema';
