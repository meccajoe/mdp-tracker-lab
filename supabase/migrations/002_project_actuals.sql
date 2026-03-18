CREATE TABLE IF NOT EXISTS project_actuals (
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  manual_amount numeric(10,2),
  notes text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, category)
);
ALTER TABLE project_actuals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_project_actuals" ON project_actuals FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
