-- Ada project/chat organization. Projects are lightweight containers; chats remain independent quote workspaces.

CREATE TABLE IF NOT EXISTS public.ada_quote_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  client_name text,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ada_quote_projects_recent
  ON public.ada_quote_projects (updated_at DESC);

ALTER TABLE public.ada_quote_projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ada_quote_workspaces
  ADD COLUMN IF NOT EXISTS ada_project_id uuid REFERENCES public.ada_quote_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ada_quote_workspaces_project_recent
  ON public.ada_quote_workspaces (ada_project_id, last_activity_at DESC);

DROP TRIGGER IF EXISTS ada_quote_projects_updated_at ON public.ada_quote_projects;
CREATE TRIGGER ada_quote_projects_updated_at
  BEFORE UPDATE ON public.ada_quote_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
