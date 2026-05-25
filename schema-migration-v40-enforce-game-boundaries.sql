-- Migration v40: enforce game boundaries across catalog and admin child tables.
--
-- Run after v39. This turns the game_id dual-read rollout into database-level
-- protection so rows cannot point at cards, sets, submissions, or inventory
-- items from a different game.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE slug = 'one_piece') THEN
    RAISE EXCEPTION 'games.slug = one_piece is required before running v40';
  END IF;
END $$;

ALTER TABLE public.inventory_bundles
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_bundle_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_status_history
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_order_items
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.sets
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.cards AS cards
SET game_id = sets.game_id
FROM public.sets AS sets
WHERE cards.set_id = sets.id
  AND cards.game_id IS NULL
  AND sets.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.cards
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.price_stats AS price_stats
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE price_stats.card_id = cards.id
  AND price_stats.game_id IS NULL
  AND cards.game_id IS NOT NULL;

UPDATE public.price_history AS price_history
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE price_history.card_id = cards.id
  AND price_history.game_id IS NULL
  AND cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.custom_cards
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.inventory_items AS inventory_items
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE inventory_items.card_id = cards.id
  AND inventory_items.game_id IS NULL
  AND cards.game_id IS NOT NULL;

UPDATE public.inventory_items AS inventory_items
SET game_id = custom_cards.game_id
FROM public.custom_cards AS custom_cards
WHERE inventory_items.custom_card_id = custom_cards.id
  AND inventory_items.game_id IS NULL
  AND custom_cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.inventory_items
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.card_match_aliases AS aliases
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE aliases.card_id = cards.id
  AND aliases.game_id IS NULL
  AND cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.card_match_aliases
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.characters
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.sealed_products AS sealed_products
SET game_id = sets.game_id
FROM public.sets AS sets
WHERE sealed_products.set_id = sets.id
  AND sealed_products.game_id IS NULL
  AND sets.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.sealed_products
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.portfolio_items AS portfolio_items
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE portfolio_items.card_id = cards.id
  AND portfolio_items.game_id IS NULL
  AND cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.portfolio_items
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.ebay_sales AS ebay_sales
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE ebay_sales.card_id = cards.id
  AND ebay_sales.game_id IS NULL
  AND cards.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.ebay_sales
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

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

WITH bundle_scope AS (
  SELECT bundle_items.bundle_id, min(inventory_items.game_id::text)::uuid AS game_id
  FROM public.inventory_bundle_items AS bundle_items
  JOIN public.inventory_items AS inventory_items ON inventory_items.id = bundle_items.inventory_item_id
  WHERE inventory_items.game_id IS NOT NULL
  GROUP BY bundle_items.bundle_id
)
UPDATE public.inventory_bundles AS bundles
SET game_id = bundle_scope.game_id
FROM bundle_scope
WHERE bundles.id = bundle_scope.bundle_id
  AND bundles.game_id IS NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.inventory_bundles
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.inventory_bundle_items AS bundle_items
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE bundle_items.inventory_item_id = inventory_items.id
  AND bundle_items.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

UPDATE public.inventory_bundle_items AS bundle_items
SET game_id = bundles.game_id
FROM public.inventory_bundles AS bundles
WHERE bundle_items.bundle_id = bundles.id
  AND bundle_items.game_id IS NULL
  AND bundles.game_id IS NOT NULL;

UPDATE public.inventory_status_history AS history
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE history.inventory_item_id = inventory_items.id
  AND history.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.inventory_status_history
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

WITH order_scope AS (
  SELECT order_id, min(game_id::text)::uuid AS game_id
  FROM public.customer_order_items
  WHERE game_id IS NOT NULL
  GROUP BY order_id
)
UPDATE public.customer_orders AS orders
SET game_id = order_scope.game_id
FROM order_scope
WHERE orders.id = order_scope.order_id
  AND orders.game_id IS NULL;

WITH order_scope AS (
  SELECT order_items.order_id, min(inventory_items.game_id::text)::uuid AS game_id
  FROM public.customer_order_items AS order_items
  JOIN public.inventory_items AS inventory_items ON inventory_items.id = order_items.inventory_item_id
  WHERE inventory_items.game_id IS NOT NULL
  GROUP BY order_items.order_id
)
UPDATE public.customer_orders AS orders
SET game_id = order_scope.game_id
FROM order_scope
WHERE orders.id = order_scope.order_id
  AND orders.game_id IS NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.customer_orders
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.customer_order_items AS order_items
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE order_items.inventory_item_id = inventory_items.id
  AND order_items.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

UPDATE public.customer_order_items AS order_items
SET game_id = orders.game_id
FROM public.customer_orders AS orders
WHERE order_items.order_id = orders.id
  AND order_items.game_id IS NULL
  AND orders.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.psa_submissions
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.psa_submission_items AS items
SET game_id = submissions.game_id
FROM public.psa_submissions AS submissions
WHERE items.submission_id = submissions.id
  AND items.game_id IS NULL
  AND submissions.game_id IS NOT NULL;

UPDATE public.psa_submission_items AS items
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE items.inventory_item_id = inventory_items.id
  AND items.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

UPDATE public.centering_measurements AS measurements
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE measurements.inventory_item_id = inventory_items.id
  AND measurements.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

WITH one_piece AS (
  SELECT id AS game_id FROM public.games WHERE slug = 'one_piece'
)
UPDATE public.centering_measurements
SET game_id = (SELECT game_id FROM one_piece)
WHERE game_id IS NULL;

UPDATE public.card_external_ids AS external_ids
SET game_id = cards.game_id
FROM public.cards AS cards
WHERE external_ids.card_id = cards.id
  AND external_ids.game_id IS NULL
  AND cards.game_id IS NOT NULL;

UPDATE public.set_external_ids AS external_ids
SET game_id = sets.game_id
FROM public.sets AS sets
WHERE external_ids.set_id = sets.id
  AND external_ids.game_id IS NULL
  AND sets.game_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sets WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'sets.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cards WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'cards.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.price_stats WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'price_stats.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.price_history WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'price_history.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_items.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_bundles WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_bundles.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_bundle_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_bundle_items.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_status_history WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_status_history.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_orders WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'customer_orders.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_order_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'customer_order_items.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.custom_cards WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'custom_cards.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.card_match_aliases WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'card_match_aliases.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.characters WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'characters.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sealed_products WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'sealed_products.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portfolio_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'portfolio_items.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ebay_sales WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'ebay_sales.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.psa_submissions WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'psa_submissions.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.psa_submission_items WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'psa_submission_items.game_id has null rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.centering_measurements WHERE game_id IS NULL) THEN
    RAISE EXCEPTION 'centering_measurements.game_id has null rows';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cards AS cards
    JOIN public.sets AS sets ON sets.id = cards.set_id
    WHERE cards.set_id IS NOT NULL
      AND cards.game_id <> sets.game_id
  ) THEN
    RAISE EXCEPTION 'cards.set_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.price_stats AS price_stats
    JOIN public.cards AS cards ON cards.id = price_stats.card_id
    WHERE price_stats.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'price_stats.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.price_history AS price_history
    JOIN public.cards AS cards ON cards.id = price_history.card_id
    WHERE price_history.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'price_history.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_items AS inventory_items
    JOIN public.cards AS cards ON cards.id = inventory_items.card_id
    WHERE inventory_items.card_id IS NOT NULL
      AND inventory_items.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'inventory_items.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_items AS inventory_items
    JOIN public.custom_cards AS custom_cards ON custom_cards.id = inventory_items.custom_card_id
    WHERE inventory_items.custom_card_id IS NOT NULL
      AND inventory_items.game_id <> custom_cards.game_id
  ) THEN
    RAISE EXCEPTION 'inventory_items.custom_card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_status_history AS history
    JOIN public.inventory_items AS inventory_items ON inventory_items.id = history.inventory_item_id
    WHERE history.game_id <> inventory_items.game_id
  ) THEN
    RAISE EXCEPTION 'inventory_status_history.inventory_item_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.card_match_aliases AS aliases
    JOIN public.cards AS cards ON cards.id = aliases.card_id
    WHERE aliases.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'card_match_aliases.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sealed_products AS sealed_products
    JOIN public.sets AS sets ON sets.id = sealed_products.set_id
    WHERE sealed_products.set_id IS NOT NULL
      AND sealed_products.game_id <> sets.game_id
  ) THEN
    RAISE EXCEPTION 'sealed_products.set_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.portfolio_items AS portfolio_items
    JOIN public.cards AS cards ON cards.id = portfolio_items.card_id
    WHERE portfolio_items.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'portfolio_items.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ebay_sales AS ebay_sales
    JOIN public.cards AS cards ON cards.id = ebay_sales.card_id
    WHERE ebay_sales.card_id IS NOT NULL
      AND ebay_sales.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'ebay_sales.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.psa_submission_items AS items
    JOIN public.psa_submissions AS submissions ON submissions.id = items.submission_id
    WHERE items.game_id <> submissions.game_id
  ) THEN
    RAISE EXCEPTION 'psa_submission_items.submission_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.psa_submission_items AS items
    JOIN public.inventory_items AS inventory_items ON inventory_items.id = items.inventory_item_id
    WHERE items.inventory_item_id IS NOT NULL
      AND items.game_id <> inventory_items.game_id
  ) THEN
    RAISE EXCEPTION 'psa_submission_items.inventory_item_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.centering_measurements AS measurements
    JOIN public.inventory_items AS inventory_items ON inventory_items.id = measurements.inventory_item_id
    WHERE measurements.inventory_item_id IS NOT NULL
      AND measurements.game_id <> inventory_items.game_id
  ) THEN
    RAISE EXCEPTION 'centering_measurements.inventory_item_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_bundle_items AS items
    JOIN public.inventory_items AS inventory_items ON inventory_items.id = items.inventory_item_id
    WHERE items.game_id <> inventory_items.game_id
  ) THEN
    RAISE EXCEPTION 'inventory_bundle_items.inventory_item_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_order_items AS items
    JOIN public.inventory_items AS inventory_items ON inventory_items.id = items.inventory_item_id
    WHERE items.game_id <> inventory_items.game_id
  ) THEN
    RAISE EXCEPTION 'customer_order_items.inventory_item_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.card_external_ids AS external_ids
    JOIN public.cards AS cards ON cards.id = external_ids.card_id
    WHERE external_ids.game_id <> cards.game_id
  ) THEN
    RAISE EXCEPTION 'card_external_ids.card_id has cross-game rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.set_external_ids AS external_ids
    JOIN public.sets AS sets ON sets.id = external_ids.set_id
    WHERE external_ids.game_id <> sets.game_id
  ) THEN
    RAISE EXCEPTION 'set_external_ids.set_id has cross-game rows';
  END IF;
END $$;

ALTER TABLE public.sets ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.cards ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.price_stats ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.price_history ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.inventory_bundles ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.inventory_bundle_items ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.inventory_status_history ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.customer_orders ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.customer_order_items ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.custom_cards ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.card_match_aliases ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.characters ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.sealed_products ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.portfolio_items ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.ebay_sales ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.psa_submissions ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.psa_submission_items ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE public.centering_measurements ALTER COLUMN game_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sets'::regclass
      AND conname = 'sets_id_game_id_key'
  ) THEN
    ALTER TABLE public.sets
      ADD CONSTRAINT sets_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cards'::regclass
      AND conname = 'cards_id_game_id_key'
  ) THEN
    ALTER TABLE public.cards
      ADD CONSTRAINT cards_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inventory_items'::regclass
      AND conname = 'inventory_items_id_game_id_key'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.custom_cards'::regclass
      AND conname = 'custom_cards_id_game_id_key'
  ) THEN
    ALTER TABLE public.custom_cards
      ADD CONSTRAINT custom_cards_id_game_id_key UNIQUE (id, game_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.psa_submissions'::regclass
      AND conname = 'psa_submissions_id_game_id_key'
  ) THEN
    ALTER TABLE public.psa_submissions
      ADD CONSTRAINT psa_submissions_id_game_id_key UNIQUE (id, game_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cards'::regclass AND conname = 'cards_set_game_fk') THEN
    ALTER TABLE public.cards
      ADD CONSTRAINT cards_set_game_fk
      FOREIGN KEY (set_id, game_id)
      REFERENCES public.sets(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.price_stats'::regclass AND conname = 'price_stats_card_game_fk') THEN
    ALTER TABLE public.price_stats
      ADD CONSTRAINT price_stats_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.price_history'::regclass AND conname = 'price_history_card_game_fk') THEN
    ALTER TABLE public.price_history
      ADD CONSTRAINT price_history_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.inventory_items'::regclass AND conname = 'inventory_items_card_game_fk') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.inventory_items'::regclass AND conname = 'inventory_items_custom_card_game_fk') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_custom_card_game_fk
      FOREIGN KEY (custom_card_id, game_id)
      REFERENCES public.custom_cards(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.inventory_status_history'::regclass AND conname = 'inventory_status_history_item_game_fk') THEN
    ALTER TABLE public.inventory_status_history
      ADD CONSTRAINT inventory_status_history_item_game_fk
      FOREIGN KEY (inventory_item_id, game_id)
      REFERENCES public.inventory_items(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.card_match_aliases'::regclass AND conname = 'card_match_aliases_card_game_fk') THEN
    ALTER TABLE public.card_match_aliases
      ADD CONSTRAINT card_match_aliases_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sealed_products'::regclass AND conname = 'sealed_products_set_game_fk') THEN
    ALTER TABLE public.sealed_products
      ADD CONSTRAINT sealed_products_set_game_fk
      FOREIGN KEY (set_id, game_id)
      REFERENCES public.sets(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.portfolio_items'::regclass AND conname = 'portfolio_items_card_game_fk') THEN
    ALTER TABLE public.portfolio_items
      ADD CONSTRAINT portfolio_items_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ebay_sales'::regclass AND conname = 'ebay_sales_card_game_fk') THEN
    ALTER TABLE public.ebay_sales
      ADD CONSTRAINT ebay_sales_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.psa_submission_items'::regclass AND conname = 'psa_submission_items_submission_game_fk') THEN
    ALTER TABLE public.psa_submission_items
      ADD CONSTRAINT psa_submission_items_submission_game_fk
      FOREIGN KEY (submission_id, game_id)
      REFERENCES public.psa_submissions(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.psa_submission_items'::regclass AND conname = 'psa_submission_items_inventory_item_game_fk') THEN
    ALTER TABLE public.psa_submission_items
      ADD CONSTRAINT psa_submission_items_inventory_item_game_fk
      FOREIGN KEY (inventory_item_id, game_id)
      REFERENCES public.inventory_items(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.centering_measurements'::regclass AND conname = 'centering_measurements_inventory_item_game_fk') THEN
    ALTER TABLE public.centering_measurements
      ADD CONSTRAINT centering_measurements_inventory_item_game_fk
      FOREIGN KEY (inventory_item_id, game_id)
      REFERENCES public.inventory_items(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.inventory_bundle_items'::regclass AND conname = 'inventory_bundle_items_inventory_item_game_fk') THEN
    ALTER TABLE public.inventory_bundle_items
      ADD CONSTRAINT inventory_bundle_items_inventory_item_game_fk
      FOREIGN KEY (inventory_item_id, game_id)
      REFERENCES public.inventory_items(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.customer_order_items'::regclass AND conname = 'customer_order_items_inventory_item_game_fk') THEN
    ALTER TABLE public.customer_order_items
      ADD CONSTRAINT customer_order_items_inventory_item_game_fk
      FOREIGN KEY (inventory_item_id, game_id)
      REFERENCES public.inventory_items(id, game_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.card_external_ids'::regclass AND conname = 'card_external_ids_card_game_fk') THEN
    ALTER TABLE public.card_external_ids
      ADD CONSTRAINT card_external_ids_card_game_fk
      FOREIGN KEY (card_id, game_id)
      REFERENCES public.cards(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.set_external_ids'::regclass AND conname = 'set_external_ids_set_game_fk') THEN
    ALTER TABLE public.set_external_ids
      ADD CONSTRAINT set_external_ids_set_game_fk
      FOREIGN KEY (set_id, game_id)
      REFERENCES public.sets(id, game_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.cards VALIDATE CONSTRAINT cards_set_game_fk;
ALTER TABLE public.price_stats VALIDATE CONSTRAINT price_stats_card_game_fk;
ALTER TABLE public.price_history VALIDATE CONSTRAINT price_history_card_game_fk;
ALTER TABLE public.inventory_items VALIDATE CONSTRAINT inventory_items_card_game_fk;
ALTER TABLE public.inventory_items VALIDATE CONSTRAINT inventory_items_custom_card_game_fk;
ALTER TABLE public.inventory_status_history VALIDATE CONSTRAINT inventory_status_history_item_game_fk;
ALTER TABLE public.card_match_aliases VALIDATE CONSTRAINT card_match_aliases_card_game_fk;
ALTER TABLE public.sealed_products VALIDATE CONSTRAINT sealed_products_set_game_fk;
ALTER TABLE public.portfolio_items VALIDATE CONSTRAINT portfolio_items_card_game_fk;
ALTER TABLE public.ebay_sales VALIDATE CONSTRAINT ebay_sales_card_game_fk;
ALTER TABLE public.psa_submission_items VALIDATE CONSTRAINT psa_submission_items_submission_game_fk;
ALTER TABLE public.psa_submission_items VALIDATE CONSTRAINT psa_submission_items_inventory_item_game_fk;
ALTER TABLE public.centering_measurements VALIDATE CONSTRAINT centering_measurements_inventory_item_game_fk;
ALTER TABLE public.inventory_bundle_items VALIDATE CONSTRAINT inventory_bundle_items_inventory_item_game_fk;
ALTER TABLE public.customer_order_items VALIDATE CONSTRAINT customer_order_items_inventory_item_game_fk;
ALTER TABLE public.card_external_ids VALIDATE CONSTRAINT card_external_ids_card_game_fk;
ALTER TABLE public.set_external_ids VALIDATE CONSTRAINT set_external_ids_set_game_fk;

CREATE INDEX IF NOT EXISTS idx_inventory_status_history_game_item_changed
  ON public.inventory_status_history(game_id, inventory_item_id, changed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_status_history TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
