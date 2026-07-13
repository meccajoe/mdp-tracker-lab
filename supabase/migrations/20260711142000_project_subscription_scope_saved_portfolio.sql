ALTER TABLE project_subscriptions
  DROP CONSTRAINT IF EXISTS project_subscriptions_scope_type_check;

ALTER TABLE project_subscriptions
  ADD CONSTRAINT project_subscriptions_scope_type_check
  CHECK (scope_type IN ('project', 'my_active_projects', 'pm_active_projects', 'all_active_projects', 'saved_portfolio'));
