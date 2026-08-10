ALTER TABLE public.qbo_labor_entries
  ADD COLUMN IF NOT EXISTS service_item text;

CREATE TABLE IF NOT EXISTS public.labor_allocation_mappings (
  service_item text PRIMARY KEY,
  labor_bucket text NOT NULL CHECK (labor_bucket IN ('Production Labor', 'I&D Labor', 'Contractor Labor')),
  source_gl_account_id text NOT NULL,
  target_gl_account_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qbo_labor_entries_service_item
  ON public.qbo_labor_entries(service_item)
  WHERE service_item IS NOT NULL;
