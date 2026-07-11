ALTER TABLE project_subscriptions
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_subscriptions
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'project'
    CHECK (scope_type IN ('project', 'my_active_projects', 'pm_active_projects', 'all_active_projects'));

ALTER TABLE project_subscriptions
  ADD COLUMN IF NOT EXISTS scope_json jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE project_subscriptions
SET scope_json = jsonb_build_object('project_id', project_id)
WHERE scope_type = 'project'
  AND project_id IS NOT NULL
  AND (scope_json = '{}'::jsonb OR scope_json IS NULL);

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_scope_type ON project_subscriptions(scope_type);
CREATE INDEX IF NOT EXISTS idx_project_subscriptions_scope_json_gin ON project_subscriptions USING gin(scope_json);