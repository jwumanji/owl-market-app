-- Migration v21: Persist Owl Lens centering measurements per inventory item
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run

CREATE TABLE IF NOT EXISTS public.centering_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL
    REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,

  -- Centering ratios. Each side pair must sum to 100.
  left_pct numeric(5,2) NOT NULL CHECK (left_pct BETWEEN 0 AND 100),
  right_pct numeric(5,2) NOT NULL CHECK (right_pct BETWEEN 0 AND 100),
  top_pct numeric(5,2) NOT NULL CHECK (top_pct BETWEEN 0 AND 100),
  bottom_pct numeric(5,2) NOT NULL CHECK (bottom_pct BETWEEN 0 AND 100),

  worst_axis text NOT NULL CHECK (worst_axis IN ('leftRight', 'topBottom')),
  worst_axis_max_pct numeric(5,2) NOT NULL CHECK (worst_axis_max_pct BETWEEN 50 AND 100),
  psa_ceiling text NOT NULL CHECK (psa_ceiling IN ('PSA_10', 'PSA_9', 'PSA_8', 'PSA_7', 'BELOW_PSA_7')),

  -- Pipeline metadata.
  pipeline_mode text NOT NULL CHECK (pipeline_mode IN ('mock', 'opencv')),
  pipeline_version text NOT NULL,
  processing_ms integer NOT NULL CHECK (processing_ms >= 0),

  -- Image metadata only. Do not store image bytes or base64 payloads here.
  image_content_type text NOT NULL,
  image_width_px integer NOT NULL CHECK (image_width_px > 0),
  image_height_px integer NOT NULL CHECK (image_height_px > 0),

  -- Overlay coordinates as JSON for replay/render.
  overlay jsonb NOT NULL,

  manual_adjustment boolean NOT NULL DEFAULT false,

  CONSTRAINT centering_measurements_horizontal_sum_check
    CHECK (left_pct + right_pct = 100),
  CONSTRAINT centering_measurements_vertical_sum_check
    CHECK (top_pct + bottom_pct = 100)
);

CREATE INDEX IF NOT EXISTS idx_cm_item_created
  ON public.centering_measurements (inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_psa_ceiling
  ON public.centering_measurements (psa_ceiling, inventory_item_id);

-- Current grade ceiling per item. Powers PSA-10-candidates filtering.
CREATE OR REPLACE VIEW public.inventory_centering_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (inventory_item_id)
  id,
  inventory_item_id,
  created_at,
  request_id,
  left_pct,
  right_pct,
  top_pct,
  bottom_pct,
  worst_axis,
  worst_axis_max_pct,
  psa_ceiling,
  pipeline_mode,
  pipeline_version,
  processing_ms,
  image_content_type,
  image_width_px,
  image_height_px,
  overlay,
  manual_adjustment
FROM public.centering_measurements
ORDER BY inventory_item_id, created_at DESC, id DESC;

ALTER TABLE public.centering_measurements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.centering_measurements TO service_role;
GRANT SELECT ON TABLE public.inventory_centering_latest TO service_role;

DROP POLICY IF EXISTS "service_role can manage centering_measurements"
ON public.centering_measurements;

CREATE POLICY "service_role can manage centering_measurements"
ON public.centering_measurements
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
