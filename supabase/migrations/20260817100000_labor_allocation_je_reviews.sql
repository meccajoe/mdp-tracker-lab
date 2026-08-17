CREATE TABLE IF NOT EXISTS public.labor_allocation_je_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  roster_snapshot_date date NOT NULL,
  source_snapshot jsonb NOT NULL,
  allocation_rows jsonb NOT NULL,
  journal_entry_lines jsonb NOT NULL,
  exception_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb,
  debit_total numeric(12,2) NOT NULL,
  credit_total numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_review', 'approved_for_manual_entry', 'rejected', 'posted')),
  reviewer_email text,
  reviewer_notes text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  qbo_transaction_id text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_total = credit_total)
);
CREATE INDEX IF NOT EXISTS idx_labor_allocation_je_reviews_period ON public.labor_allocation_je_reviews(period_start, period_end);
