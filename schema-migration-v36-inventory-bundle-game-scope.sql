-- Migration v36: Game-scope inventory bundles.
-- Run after v29 and v22. This keeps admin bundle workflows from mixing
-- inventory across TCGs.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.games') IS NULL THEN
    RAISE EXCEPTION 'public.games is required before running v36 inventory bundle game scope';
  END IF;

  IF to_regclass('public.inventory_bundles') IS NULL THEN
    RAISE EXCEPTION 'public.inventory_bundles is required before running v36 inventory bundle game scope';
  END IF;

  IF to_regclass('public.inventory_bundle_items') IS NULL THEN
    RAISE EXCEPTION 'public.inventory_bundle_items is required before running v36 inventory bundle game scope';
  END IF;

  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'public.inventory_items is required before running v36 inventory bundle game scope';
  END IF;
END $$;

ALTER TABLE public.inventory_bundles
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_bundle_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

UPDATE public.inventory_bundle_items AS bundle_items
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE bundle_items.inventory_item_id = inventory_items.id
  AND bundle_items.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

DO $$
DECLARE
  mixed_bundle_count integer;
BEGIN
  SELECT count(*)
  INTO mixed_bundle_count
  FROM (
    SELECT bundle_id
    FROM public.inventory_bundle_items
    WHERE game_id IS NOT NULL
    GROUP BY bundle_id
    HAVING count(DISTINCT game_id) > 1
  ) AS mixed_bundles;

  IF mixed_bundle_count > 0 THEN
    RAISE EXCEPTION 'Cannot backfill inventory_bundles.game_id: % bundles contain items from multiple games', mixed_bundle_count;
  END IF;
END $$;

WITH bundle_scope AS (
  SELECT bundle_id, min(game_id::text)::uuid AS game_id
  FROM public.inventory_bundle_items
  WHERE game_id IS NOT NULL
  GROUP BY bundle_id
)
UPDATE public.inventory_bundles AS bundles
SET game_id = bundle_scope.game_id
FROM bundle_scope
WHERE bundles.id = bundle_scope.bundle_id
  AND bundles.game_id IS NULL;

WITH one_piece AS (
  SELECT id AS game_id
  FROM public.games
  WHERE slug = 'one_piece'
)
UPDATE public.inventory_bundles
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.inventory_bundle_items AS bundle_items
SET game_id = bundles.game_id
FROM public.inventory_bundles AS bundles
WHERE bundle_items.bundle_id = bundles.id
  AND bundle_items.game_id IS NULL
  AND bundles.game_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_bundles WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_bundles.game_id backfill left null rows';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_bundle_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_bundle_items.game_id backfill left null rows';
  END IF;
END $$;

ALTER TABLE public.inventory_bundles
  ALTER COLUMN game_id SET NOT NULL;

ALTER TABLE public.inventory_bundle_items
  ALTER COLUMN game_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory_bundles'::regclass
      AND conname = 'inventory_bundles_id_game_id_key'
  ) THEN
    ALTER TABLE public.inventory_bundles
      ADD CONSTRAINT inventory_bundles_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory_bundle_items'::regclass
      AND conname = 'inventory_bundle_items_bundle_game_fk'
  ) THEN
    ALTER TABLE public.inventory_bundle_items
      ADD CONSTRAINT inventory_bundle_items_bundle_game_fk
      FOREIGN KEY (bundle_id, game_id)
      REFERENCES public.inventory_bundles(id, game_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_game_id
  ON public.inventory_bundles(game_id);

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_game_status
  ON public.inventory_bundles(game_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_game_id
  ON public.inventory_bundle_items(game_id);

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_game_bundle
  ON public.inventory_bundle_items(game_id, bundle_id);

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_game_inventory_item
  ON public.inventory_bundle_items(game_id, inventory_item_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
