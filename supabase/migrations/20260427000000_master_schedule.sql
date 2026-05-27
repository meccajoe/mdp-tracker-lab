-- Master schedule tasks table
-- Stores the running production schedule across all active projects.
-- Updated after each /schedule run. Used by PM Manager Bot for conflict detection.

CREATE TABLE IF NOT EXISTS master_schedule_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number    text NOT NULL,
  project_name  text NOT NULL,
  task          text NOT NULL,
  assigned_to   text NOT NULL,
  stage         text NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  hours         numeric(6,2),
  notes         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mst_job_number  ON master_schedule_tasks(job_number);
CREATE INDEX IF NOT EXISTS idx_mst_status      ON master_schedule_tasks(status);
CREATE INDEX IF NOT EXISTS idx_mst_assigned_to ON master_schedule_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_mst_dates       ON master_schedule_tasks(start_date, end_date);

ALTER TABLE master_schedule_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything on master_schedule_tasks"
  ON master_schedule_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
