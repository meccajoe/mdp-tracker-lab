CREATE TABLE IF NOT EXISTS project_operational_state (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  operational_status text NOT NULL DEFAULT 'on_track',
  next_action text,
  blocker_summary text,
  pending_human_input text,
  context_notes text,
  target_date date,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  owner_label text,
  due_date date,
  needs_human_input boolean NOT NULL DEFAULT false,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_date date NOT NULL DEFAULT current_date,
  event_type text NOT NULL DEFAULT 'update',
  summary text NOT NULL,
  details text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id_status ON project_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_project_activity_events_project_date ON project_activity_events(project_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_project_activity_events_event_date ON project_activity_events(event_date DESC);

ALTER TABLE project_operational_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_operational_state"
    ON project_operational_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_tasks"
    ON project_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_activity_events"
    ON project_activity_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
