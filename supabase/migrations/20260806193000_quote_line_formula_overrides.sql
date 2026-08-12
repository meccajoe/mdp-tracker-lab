-- Tracker-side inputs for quote lines that lack formula-ready HubSpot data.
-- These are review overrides, not a rewrite of the original HubSpot quote.
CREATE TABLE IF NOT EXISTS public.quote_line_formula_overrides (
  quote_line_item_id uuid PRIMARY KEY REFERENCES public.quote_line_items(id) ON DELETE CASCADE,
  formula_type text NOT NULL CHECK (formula_type IN ('graphics', 'bematrix')),
  square_feet numeric,
  frame_count numeric,
  notes text NOT NULL DEFAULT '',
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((formula_type = 'graphics' AND square_feet IS NOT NULL AND square_feet > 0)
      OR (formula_type = 'bematrix' AND frame_count IS NOT NULL AND frame_count > 0))
);

ALTER TABLE public.quote_line_formula_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages quote formula overrides"
  ON public.quote_line_formula_overrides
  FOR ALL
  USING (false)
  WITH CHECK (false);
