-- Ada pre-project quote workspace foundation.
-- Ada quotes precede downstream Tracker projects, so tracker_project_id is intentionally nullable.

CREATE TABLE IF NOT EXISTS public.ada_quote_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  client_name text,
  contact_name text,
  hubspot_deal_id text,
  tracker_project_id text REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'gathering_inputs', 'estimating', 'in_review', 'accepted', 'handed_off', 'archived')
  ),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  pinned_at timestamptz,
  archived_at timestamptz,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ada_quote_workspaces_recent
  ON public.ada_quote_workspaces (pinned_at DESC NULLS LAST, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_ada_quote_workspaces_status
  ON public.ada_quote_workspaces (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_ada_quote_workspaces_client_name
  ON public.ada_quote_workspaces (client_name);

ALTER TABLE public.ada_quote_workspaces ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ada_quote_workspaces_updated_at ON public.ada_quote_workspaces;
CREATE TRIGGER ada_quote_workspaces_updated_at
  BEFORE UPDATE ON public.ada_quote_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
