-- Ada is opt-in and every user owns an isolated workspace library.
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS ada_access boolean NOT NULL DEFAULT false;
UPDATE public.user_roles SET ada_access = true WHERE lower(email) IN ('joe@meccadesign.com', 'mecca.joe@gmail.com');

CREATE INDEX IF NOT EXISTS idx_ada_quote_workspaces_owner_recent
  ON public.ada_quote_workspaces (created_by_email, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_ada_quote_projects_owner_recent
  ON public.ada_quote_projects (created_by_email, updated_at DESC);
