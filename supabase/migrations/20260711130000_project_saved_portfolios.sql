CREATE TABLE IF NOT EXISTS project_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_email text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by_email, slug)
);

CREATE TABLE IF NOT EXISTS project_portfolio_projects (
  portfolio_id uuid NOT NULL REFERENCES project_portfolios(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_portfolios_created_by_email ON project_portfolios(created_by_email);
CREATE INDEX IF NOT EXISTS idx_project_portfolio_projects_project_id ON project_portfolio_projects(project_id);

ALTER TABLE project_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_portfolio_projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_portfolios"
    ON project_portfolios FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_portfolio_projects"
    ON project_portfolio_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
