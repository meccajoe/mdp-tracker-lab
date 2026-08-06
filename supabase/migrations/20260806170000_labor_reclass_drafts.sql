CREATE TABLE IF NOT EXISTS public.labor_reclass_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_project_id text REFERENCES public.projects(id) ON DELETE SET NULL,
  target_project_id text NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  memo text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_review', 'approved', 'rejected', 'posted')),
  created_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  qbo_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.labor_reclass_draft_entries (
  draft_id uuid NOT NULL REFERENCES public.labor_reclass_drafts(id) ON DELETE CASCADE,
  qbo_entry_id text NOT NULL REFERENCES public.qbo_labor_entries(qbo_entry_id) ON DELETE RESTRICT,
  PRIMARY KEY (draft_id, qbo_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_labor_reclass_drafts_period ON public.labor_reclass_drafts(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_labor_reclass_draft_entries_entry ON public.labor_reclass_draft_entries(qbo_entry_id);
