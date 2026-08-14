CREATE TABLE IF NOT EXISTS public.labor_worker_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('employee', 'contractor')),
  roster_snapshot_date date NOT NULL,
  source text NOT NULL DEFAULT 'maribel_payroll_roster',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, roster_snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_labor_worker_classifications_snapshot
  ON public.labor_worker_classifications(roster_snapshot_date, normalized_name);
