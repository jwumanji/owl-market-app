-- Migration v37: Game-scope customer orders.
-- Run after v29 and v18. This prevents shipping/order workflows from
-- attaching inventory from one TCG to an order in another TCG.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.games') IS NULL THEN
    RAISE EXCEPTION 'public.games is required before running v37 customer order game scope';
  END IF;

  IF to_regclass('public.customer_orders') IS NULL THEN
    RAISE EXCEPTION 'public.customer_orders is required before running v37 customer order game scope';
  END IF;

  IF to_regclass('public.customer_order_items') IS NULL THEN
    RAISE EXCEPTION 'public.customer_order_items is required before running v37 customer order game scope';
  END IF;

  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'public.inventory_items is required before running v37 customer order game scope';
  END IF;
END $$;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_order_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

UPDATE public.customer_order_items AS order_items
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE order_items.inventory_item_id = inventory_items.id
  AND order_items.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

DO $$
DECLARE
  mixed_order_count integer;
BEGIN
  SELECT count(*)
  INTO mixed_order_count
  FROM (
    SELECT order_id
    FROM public.customer_order_items
    WHERE game_id IS NOT NULL
    GROUP BY order_id
    HAVING count(DISTINCT game_id) > 1
  ) AS mixed_orders;

  IF mixed_order_count > 0 THEN
    RAISE EXCEPTION 'Cannot backfill customer_orders.game_id: % orders contain items from multiple games', mixed_order_count;
  END IF;
END $$;

WITH order_scope AS (
  SELECT order_id, min(game_id) AS game_id
  FROM public.customer_order_items
  WHERE game_id IS NOT NULL
  GROUP BY order_id
)
UPDATE public.customer_orders AS orders
SET game_id = order_scope.game_id
FROM order_scope
WHERE orders.id = order_scope.order_id
  AND orders.game_id IS NULL;

WITH one_piece AS (
  SELECT id AS game_id
  FROM public.games
  WHERE slug = 'one_piece'
)
UPDATE public.customer_orders
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.customer_order_items AS order_items
SET game_id = orders.game_id
FROM public.customer_orders AS orders
WHERE order_items.order_id = orders.id
  AND order_items.game_id IS NULL
  AND orders.game_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_orders WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'customer_orders.game_id backfill left null rows';
  END IF;

  IF EXISTS (SELECT 1 FROM public.customer_order_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'customer_order_items.game_id backfill left null rows';
  END IF;
END $$;

ALTER TABLE public.customer_orders
  ALTER COLUMN game_id SET NOT NULL;

ALTER TABLE public.customer_order_items
  ALTER COLUMN game_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customer_orders'::regclass
      AND conname = 'customer_orders_id_game_id_key'
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customer_order_items'::regclass
      AND conname = 'customer_order_items_order_game_fk'
  ) THEN
    ALTER TABLE public.customer_order_items
      ADD CONSTRAINT customer_order_items_order_game_fk
      FOREIGN KEY (order_id, game_id)
      REFERENCES public.customer_orders(id, game_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_orders_game_id
  ON public.customer_orders(game_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_game_created_at
  ON public.customer_orders(game_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_game_id
  ON public.customer_order_items(game_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_game_order
  ON public.customer_order_items(game_id, order_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_game_inventory_item
  ON public.customer_order_items(game_id, inventory_item_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
