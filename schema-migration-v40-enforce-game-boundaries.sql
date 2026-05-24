-- Migration v40: enforce game boundaries across catalog and admin child tables.
--
-- Run after v39. This turns the game_id dual-read rollout into database-level
-- protection so rows cannot point at cards, sets, submissions, or inventory
-- items from a different game.

BEGIN;

ALTER TABLE public.inventory_status_history
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE RESTRICT;

UPDATE public.inventory_status_history AS history
SET game_id = inventory_items.game_id
FROM public.inventory_items AS inventory_items
WHERE history.inventory_item_id = inventory_items.id
  AND history.game_id IS NULL
  AND inventory_items.game_id IS NOT NULL;

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
