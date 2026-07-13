ALTER TABLE project_portfolio_projects
  ADD COLUMN IF NOT EXISTS monitor_json jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE project_portfolio_projects
SET monitor_json = jsonb_build_object('monitor_keys', '[]'::jsonb)
WHERE monitor_json = '{}'::jsonb OR monitor_json IS NULL;
