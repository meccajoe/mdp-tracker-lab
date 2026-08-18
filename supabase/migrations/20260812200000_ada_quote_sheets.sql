CREATE TABLE IF NOT EXISTS public.ada_quote_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  sync_status text NOT NULL DEFAULT 'created' CHECK (sync_status IN ('created', 'synced', 'needs_review', 'failed')),
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id)
);
CREATE INDEX IF NOT EXISTS idx_ada_quote_sheets_workspace ON public.ada_quote_sheets (workspace_id, created_at DESC);
ALTER TABLE public.ada_quote_sheets ENABLE ROW LEVEL SECURITY;
