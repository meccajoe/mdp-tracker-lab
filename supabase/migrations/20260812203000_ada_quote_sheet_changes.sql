CREATE TABLE IF NOT EXISTS public.ada_quote_sheet_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.ada_quote_sheets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE CASCADE,
  range_a1 text NOT NULL,
  values_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'rejected', 'failed')),
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ada_quote_sheet_changes_sheet ON public.ada_quote_sheet_changes (sheet_id, created_at DESC);
ALTER TABLE public.ada_quote_sheet_changes ENABLE ROW LEVEL SECURITY;
