CREATE TABLE IF NOT EXISTS project_conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_team_id text NOT NULL,
  channel_id text NOT NULL,
  thread_ts text NOT NULL,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_slack_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_conversation_threads_unique
  ON project_conversation_threads(slack_team_id, channel_id, thread_ts);

CREATE INDEX IF NOT EXISTS idx_project_conversation_threads_project_id
  ON project_conversation_threads(project_id);

ALTER TABLE project_conversation_threads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_conversation_threads"
    ON project_conversation_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
