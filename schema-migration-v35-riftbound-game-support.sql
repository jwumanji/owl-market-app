-- Migration v35: Riftbound game support for the multi-TCG schema.
-- Run after v29-v33. This is numbered after the hidden Pokemon seed track.
--
-- This seeds the Riftbound game/taxonomy rows and creates the raw provider
-- payload table used by catalog sync adapters. The catalog sync itself stays
-- script-driven so it can dry-run and audit before writing card rows.

BEGIN;

INSERT INTO public.games (slug, name, is_active, is_public, metadata)
VALUES (
  'riftbound',
  'Riftbound',
  true,
  false,
  jsonb_build_object(
    'route_slug', 'riftbound',
    'source', 'riftcodex',
    'catalog_provider', 'riftcodex',
    'pricing_status', 'deferred',
    'asset_status', 'legal_review_required'
  )
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = true,
  metadata = coalesce(public.games.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

WITH riftbound AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'riftbound'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('COMMON', 'Common', 10, '{"source":"riftcodex"}'::jsonb),
    ('UNCOMMON', 'Uncommon', 20, '{"source":"riftcodex"}'::jsonb),
    ('RARE', 'Rare', 30, '{"source":"riftcodex"}'::jsonb),
    ('EPIC', 'Epic', 40, '{"source":"riftcodex"}'::jsonb),
    ('SHOWCASE', 'Showcase', 50, '{"source":"riftcodex"}'::jsonb),
    ('PROMO', 'Promo', 60, '{"source":"riftcodex"}'::jsonb)
)
INSERT INTO public.game_rarities (game_id, code, name, sort_order, metadata)
SELECT riftbound.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM riftbound
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  metadata = coalesce(public.game_rarities.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

WITH riftbound AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'riftbound'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('BASE', 'Base', 10, '{"source":"riftcodex"}'::jsonb),
    ('ALTERNATE_ART', 'Alternate Art', 20, '{"source":"riftcodex"}'::jsonb),
    ('OVERNUMBERED', 'Overnumbered', 30, '{"source":"riftcodex"}'::jsonb),
    ('SIGNATURE', 'Signature', 40, '{"source":"riftcodex"}'::jsonb),
    ('METAL', 'Metal', 50, '{"source":"riftcodex"}'::jsonb)
)
INSERT INTO public.game_variants (game_id, code, name, sort_order, metadata)
SELECT riftbound.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM riftbound
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  metadata = coalesce(public.game_variants.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

WITH riftbound AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'riftbound'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('MAIN_SET', 'Main Set', 10, '{"source":"riftcodex","set_codes":["OGN","SFD","UNL"]}'::jsonb),
    ('PROVING_GROUNDS', 'Proving Grounds', 20, '{"source":"riftcodex","set_codes":["OGS"]}'::jsonb),
    ('ORGANIZED_PLAY_PROMO', 'Organized Play Promo', 30, '{"source":"riftcodex","set_codes":["OPP"]}'::jsonb),
    ('PROMO', 'Promo', 40, '{"source":"riftcodex","set_codes":["PR"]}'::jsonb),
    ('JUDGE_PROMO', 'Judge Promo', 50, '{"source":"riftcodex","set_codes":["JDG"]}'::jsonb)
)
INSERT INTO public.game_set_types (game_id, code, name, sort_order, metadata)
SELECT riftbound.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM riftbound
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  metadata = coalesce(public.game_set_types.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.tcg_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  record_type text NOT NULL,
  external_id text NOT NULL,
  parent_external_id text,
  source_updated_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tcg_source_records_provider_check
    CHECK (provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tcg_source_records_record_type_check
    CHECK (record_type ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  CONSTRAINT tcg_source_records_external_id_not_blank_check
    CHECK (length(trim(external_id)) > 0),
  CONSTRAINT tcg_source_records_payload_hash_check
    CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.tcg_source_records
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS record_type text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS parent_external_id text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tcg_source_records'
      AND column_name = 'game_slug'
  ) THEN
    UPDATE public.tcg_source_records AS records
    SET game_id = games.id
    FROM public.games AS games
    WHERE records.game_id IS NULL
      AND records.game_slug = games.slug;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tcg_source_records_unique_game_provider_record'
      AND conrelid = 'public.tcg_source_records'::regclass
  ) THEN
    ALTER TABLE public.tcg_source_records
      ADD CONSTRAINT tcg_source_records_unique_game_provider_record
      UNIQUE (game_id, provider, record_type, external_id);
  END IF;
END $$;

ALTER TABLE public.tcg_source_records
  ALTER COLUMN game_id SET NOT NULL,
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN record_type SET NOT NULL,
  ALTER COLUMN external_id SET NOT NULL,
  ALTER COLUMN payload_hash SET NOT NULL,
  ALTER COLUMN payload SET NOT NULL;

COMMENT ON TABLE public.tcg_source_records IS
  'Raw external TCG source payloads used to replay catalog syncs and debug source-shape drift.';

CREATE INDEX IF NOT EXISTS idx_tcg_source_records_game_provider
  ON public.tcg_source_records(game_id, provider);

CREATE INDEX IF NOT EXISTS idx_tcg_source_records_parent
  ON public.tcg_source_records(game_id, provider, record_type, parent_external_id)
  WHERE parent_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tcg_source_records_fetched_at
  ON public.tcg_source_records(fetched_at DESC);

WITH riftbound AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'riftbound'
)
INSERT INTO public.price_provider_mappings (
  game_id,
  provider,
  source_game_slug,
  source_set_slug,
  product_key_rules,
  pricing_capabilities,
  is_active,
  metadata
)
SELECT
  riftbound.game_id,
  'tcgplayer',
  'riftbound',
  '',
  '{
    "card_product_key": "card_external_ids[provider=tcgplayer,external_type=product_id].external_id",
    "set_key": "set_external_ids[provider=tcgplayer,external_type=set_id].external_id"
  }'::jsonb,
  '{"catalog_ids":true,"market_price":false,"price_history":false}'::jsonb,
  false,
  '{"status":"deferred","reason":"pricing ingestion is gated after catalog ID audit"}'::jsonb
FROM riftbound
ON CONFLICT (game_id, provider, source_game_slug, source_set_slug) DO UPDATE
SET
  product_key_rules = EXCLUDED.product_key_rules,
  pricing_capabilities = EXCLUDED.pricing_capabilities,
  is_active = EXCLUDED.is_active,
  metadata = coalesce(public.price_provider_mappings.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tcg_source_records TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
