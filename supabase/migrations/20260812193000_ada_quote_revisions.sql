-- Immutable Ada quote snapshots. A revision is created for each material quote change.
CREATE TABLE IF NOT EXISTS public.ada_quote_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  quote_json jsonb NOT NULL,
  internal_cost numeric NOT NULL DEFAULT 0,
  sell_price numeric NOT NULL DEFAULT 0,
  margin_pct numeric NOT NULL DEFAULT 0,
  assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_ada_quote_revisions_workspace_number ON public.ada_quote_revisions (workspace_id, revision_number DESC);
ALTER TABLE public.ada_quote_revisions ENABLE ROW LEVEL SECURITY;
