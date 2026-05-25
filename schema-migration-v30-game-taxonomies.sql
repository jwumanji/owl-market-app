-- Migration v30: Game-scoped set, rarity, and variant taxonomies.
-- Run after v29. This is the taxonomy/backfill step for OWL-20.
--
-- This migration is intentionally additive:
-- - creates per-game taxonomy tables
-- - seeds One Piece taxonomy values
-- - adds nullable FK columns to cards/sets
-- - backfills FK columns from legacy string fields
--
-- Do not drop legacy cards.rarity, cards.variant_label, or sets.series in
-- this phase. UI/API code still dual-reads those fields until later cutover.

CREATE TABLE IF NOT EXISTS public.game_rarities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_rarities_code_not_blank_check
    CHECK (length(trim(code)) > 0),
  CONSTRAINT game_rarities_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT game_rarities_unique_game_code
    UNIQUE (game_id, code)
);

CREATE TABLE IF NOT EXISTS public.game_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_variants_code_not_blank_check
    CHECK (length(trim(code)) > 0),
  CONSTRAINT game_variants_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT game_variants_unique_game_code
    UNIQUE (game_id, code)
);

CREATE TABLE IF NOT EXISTS public.game_set_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_set_types_code_not_blank_check
    CHECK (length(trim(code)) > 0),
  CONSTRAINT game_set_types_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT game_set_types_unique_game_code
    UNIQUE (game_id, code)
);

COMMENT ON TABLE public.game_rarities IS
  'Per-game rarity taxonomy. Codes are scoped by game_id.';

COMMENT ON TABLE public.game_variants IS
  'Per-game variant/treatment taxonomy. Codes are scoped by game_id.';

COMMENT ON TABLE public.game_set_types IS
  'Per-game set/product-line taxonomy. Codes are scoped by game_id.';

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS rarity_id uuid REFERENCES public.game_rarities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.game_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS set_type_id uuid REFERENCES public.game_set_types(id) ON DELETE RESTRICT;

-- Seed canonical One Piece rarities. `cards.rarity` remains unchanged in this
-- phase; `rarity_id` maps legacy strings to canonical rows for dual-read.
WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('GMR', 'Golden Manga Rare', 10, '{"legacy_codes":[]}'::jsonb),
    ('MR', 'Manga Rare', 20, '{"legacy_codes":[]}'::jsonb),
    ('SAR', 'Super Alternate Art', 30, '{"legacy_codes":[]}'::jsonb),
    ('SP', 'Special Rare', 40, '{"legacy_codes":[]}'::jsonb),
    ('AA', 'Alternate Art', 50, '{"legacy_codes":[]}'::jsonb),
    ('TR', 'Treasure Rare', 60, '{"legacy_codes":[]}'::jsonb),
    ('SEC', 'Secret Rare', 70, '{"legacy_codes":[]}'::jsonb),
    ('SR', 'Super Rare', 80, '{"legacy_codes":[]}'::jsonb),
    ('L', 'Leader', 90, '{"legacy_codes":[]}'::jsonb),
    ('R', 'Rare', 100, '{"legacy_codes":[]}'::jsonb),
    ('UC', 'Uncommon', 110, '{"legacy_codes":["Uncommon"]}'::jsonb),
    ('C', 'Common', 120, '{"legacy_codes":[]}'::jsonb),
    ('PR', 'Promo', 130, '{"aggregate_code":"PROMO","legacy_codes":[]}'::jsonb),
    ('DON', 'DON!!', 140, '{"legacy_codes":["DON!!"]}'::jsonb)
)
INSERT INTO public.game_rarities (game_id, code, name, sort_order, metadata)
SELECT one_piece.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM one_piece
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  metadata = public.game_rarities.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Seed known One Piece variant labels used by current sync/classifier code.
WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('PARALLEL', 'Parallel', 10, '{"source":"seed"}'::jsonb),
    ('REPRINT', 'Reprint', 20, '{"source":"seed"}'::jsonb),
    ('SP', 'SP', 30, '{"source":"seed"}'::jsonb),
    ('JOLLY_ROGER_FOIL', 'Jolly Roger Foil', 40, '{"source":"seed"}'::jsonb),
    ('ALT_ART', 'Alt Art', 50, '{"source":"seed"}'::jsonb),
    ('ALTERNATE_ART', 'Alternate Art', 60, '{"source":"seed"}'::jsonb),
    ('MANGA', 'Manga', 70, '{"source":"seed"}'::jsonb),
    ('ANNIVERSARY', 'Anniversary', 80, '{"source":"seed"}'::jsonb),
    ('WANTED_POSTER', 'Wanted Poster', 90, '{"source":"seed"}'::jsonb),
    ('TR', 'TR', 100, '{"source":"seed"}'::jsonb),
    ('SUPER_ALTERNATE_ART', 'Super Alternate Art', 110, '{"source":"seed"}'::jsonb),
    ('RED_SUPER_ALTERNATE_ART', 'Red Super Alternate Art', 120, '{"source":"seed"}'::jsonb),
    ('PRE_RELEASE', 'Pre-Release', 130, '{"source":"seed"}'::jsonb),
    ('SP_GOLD', 'SP Gold', 140, '{"source":"seed"}'::jsonb),
    ('GOLD_STAMPED_SIGNATURE', 'Gold-Stamped Signature', 150, '{"source":"seed"}'::jsonb),
    ('SP_SILVER', 'SP Silver', 160, '{"source":"seed"}'::jsonb)
)
INSERT INTO public.game_variants (game_id, code, name, sort_order, metadata)
SELECT one_piece.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM one_piece
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = LEAST(public.game_variants.sort_order, EXCLUDED.sort_order),
  metadata = public.game_variants.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Dynamically seed any existing legacy variant labels not covered above. This
-- keeps current production data fully mappable without collapsing labels.
WITH labels AS (
  SELECT DISTINCT
    c.game_id,
    trim(c.variant_label) AS name,
    trim(both '_' from regexp_replace(upper(trim(c.variant_label)), '[^A-Z0-9]+', '_', 'g')) AS code
  FROM public.cards AS c
  WHERE c.game_id IS NOT NULL
    AND c.variant_label IS NOT NULL
    AND length(trim(c.variant_label)) > 0
),
deduped AS (
  SELECT
    labels.game_id,
    labels.code,
    min(labels.name) AS name,
    to_jsonb(array_agg(labels.name ORDER BY labels.name)) AS legacy_labels
  FROM labels
  WHERE labels.code <> ''
  GROUP BY labels.game_id, labels.code
),
ordered AS (
  SELECT
    deduped.*,
    1000 + row_number() OVER (PARTITION BY deduped.game_id ORDER BY deduped.name) AS sort_order
  FROM deduped
)
INSERT INTO public.game_variants (game_id, code, name, sort_order, metadata)
SELECT
  ordered.game_id,
  ordered.code,
  ordered.name,
  ordered.sort_order,
  jsonb_build_object('source', 'legacy_cards', 'legacy_labels', ordered.legacy_labels)
FROM ordered
ON CONFLICT (game_id, code) DO UPDATE
SET
  metadata = public.game_variants.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Seed One Piece set types. Legacy sets.series is inconsistent (`OP`, `EB`,
-- `PRB` in older rows; `BOOSTER`, `EXTRA_BOOSTER`, etc. in newer rows), so
-- set_type_id normalizes those values while leaving sets.series intact.
WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
),
seed(code, name, sort_order, metadata) AS (
  VALUES
    ('BOOSTER', 'Booster', 10, '{"legacy_series":["OP","BOOSTER"]}'::jsonb),
    ('EXTRA_BOOSTER', 'Extra Booster', 20, '{"legacy_series":["EB","EXTRA_BOOSTER"]}'::jsonb),
    ('PREMIUM_BOOSTER', 'Premium Booster', 30, '{"legacy_series":["PRB","PREMIUM_BOOSTER"]}'::jsonb),
    ('STARTER', 'Starter Deck', 40, '{"legacy_series":["ST","STARTER"]}'::jsonb),
    ('PROMO', 'Promotion Cards', 50, '{"legacy_series":["P","PROMO"]}'::jsonb)
)
INSERT INTO public.game_set_types (game_id, code, name, sort_order, metadata)
SELECT one_piece.game_id, seed.code, seed.name, seed.sort_order, seed.metadata
FROM one_piece
CROSS JOIN seed
ON CONFLICT (game_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  metadata = public.game_set_types.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Backfill card rarity FKs. Explicit normalization decisions:
-- - `Uncommon` maps to `UC`
-- - `DON!!` maps to `DON`
UPDATE public.cards AS cards
SET rarity_id = rarity.id
FROM public.game_rarities AS rarity
WHERE rarity.game_id = cards.game_id
  AND rarity.code = CASE
    WHEN upper(trim(cards.rarity)) = 'UNCOMMON' THEN 'UC'
    WHEN upper(trim(cards.rarity)) = 'DON!!' THEN 'DON'
    ELSE upper(trim(cards.rarity))
  END
  AND cards.rarity IS NOT NULL
  AND cards.game_id IS NOT NULL
  AND cards.rarity_id IS NULL;

-- Backfill card variant FKs from current legacy labels.
UPDATE public.cards AS cards
SET variant_id = variant.id
FROM public.game_variants AS variant
WHERE variant.game_id = cards.game_id
  AND variant.code = trim(both '_' from regexp_replace(upper(trim(cards.variant_label)), '[^A-Z0-9]+', '_', 'g'))
  AND cards.variant_label IS NOT NULL
  AND length(trim(cards.variant_label)) > 0
  AND cards.game_id IS NOT NULL
  AND cards.variant_id IS NULL;

-- Backfill normalized One Piece set type FKs.
UPDATE public.sets AS sets
SET set_type_id = set_type.id
FROM public.game_set_types AS set_type
WHERE set_type.game_id = sets.game_id
  AND set_type.code = CASE
    WHEN upper(coalesce(sets.series, '')) IN ('OP', 'BOOSTER')
      OR upper(coalesce(sets.code, '')) LIKE 'OP%' THEN 'BOOSTER'
    WHEN upper(coalesce(sets.series, '')) IN ('EB', 'EXTRA_BOOSTER')
      OR upper(coalesce(sets.code, '')) LIKE 'EB%' THEN 'EXTRA_BOOSTER'
    WHEN upper(coalesce(sets.series, '')) IN ('PRB', 'PREMIUM_BOOSTER')
      OR upper(coalesce(sets.code, '')) LIKE 'PRB%' THEN 'PREMIUM_BOOSTER'
    WHEN upper(coalesce(sets.series, '')) = 'STARTER'
      OR upper(coalesce(sets.code, '')) LIKE 'ST%' THEN 'STARTER'
    WHEN upper(coalesce(sets.series, '')) = 'PROMO'
      OR upper(coalesce(sets.code, '')) = 'P' THEN 'PROMO'
    ELSE NULL
  END
  AND sets.game_id IS NOT NULL
  AND sets.set_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_game_rarities_game_sort
  ON public.game_rarities(game_id, sort_order, code);

CREATE INDEX IF NOT EXISTS idx_game_variants_game_sort
  ON public.game_variants(game_id, sort_order, code);

CREATE INDEX IF NOT EXISTS idx_game_set_types_game_sort
  ON public.game_set_types(game_id, sort_order, code);

CREATE INDEX IF NOT EXISTS idx_cards_rarity_id
  ON public.cards(rarity_id);

CREATE INDEX IF NOT EXISTS idx_cards_game_rarity
  ON public.cards(game_id, rarity_id);

CREATE INDEX IF NOT EXISTS idx_cards_variant_id
  ON public.cards(variant_id);

CREATE INDEX IF NOT EXISTS idx_cards_game_variant
  ON public.cards(game_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_sets_set_type_id
  ON public.sets(set_type_id);

CREATE INDEX IF NOT EXISTS idx_sets_game_set_type
  ON public.sets(game_id, set_type_id);

GRANT SELECT ON TABLE public.game_rarities TO anon;
GRANT SELECT ON TABLE public.game_rarities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_rarities TO service_role;

GRANT SELECT ON TABLE public.game_variants TO anon;
GRANT SELECT ON TABLE public.game_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_variants TO service_role;

GRANT SELECT ON TABLE public.game_set_types TO anon;
GRANT SELECT ON TABLE public.game_set_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_set_types TO service_role;

NOTIFY pgrst, 'reload schema';
