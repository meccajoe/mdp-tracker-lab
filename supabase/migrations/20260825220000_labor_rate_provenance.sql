ALTER TABLE public.qbo_labor_entries
  ALTER COLUMN hourly_rate DROP DEFAULT,
  ALTER COLUMN hourly_rate DROP NOT NULL;

ALTER TABLE public.qbo_labor_entries
  ADD COLUMN IF NOT EXISTS rate_source text,
  ADD COLUMN IF NOT EXISTS rate_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_qbo_labor_entries_rate_coverage
  ON public.qbo_labor_entries(project_id, rate_source)
  WHERE qbo_entry_id LIKE 'ts_%';
