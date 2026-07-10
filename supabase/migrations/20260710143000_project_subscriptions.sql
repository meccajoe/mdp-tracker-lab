CREATE TABLE IF NOT EXISTS project_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_email text NOT NULL,
  channel text NOT NULL DEFAULT 'mdp_tracker',
  target_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  subscription_type text NOT NULL CHECK (subscription_type IN ('metric_threshold_alert', 'scheduled_digest')),
  metric_key text,
  condition_operator text,
  threshold_value numeric(12,2),
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_cron text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  cooldown_minutes integer NOT NULL DEFAULT 60,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  summary_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_subscription_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES project_subscriptions(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL,
  reason text,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS project_subscription_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_run_id uuid NOT NULL REFERENCES project_subscription_runs(id) ON DELETE CASCADE,
  channel text NOT NULL,
  target text,
  delivery_status text NOT NULL,
  external_message_id text,
  delivered_at timestamptz,
  error_text text
);

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_project_id ON project_subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_subscriptions_status ON project_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_project_subscription_runs_subscription_id ON project_subscription_runs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_project_subscription_deliveries_run_id ON project_subscription_deliveries(subscription_run_id);

ALTER TABLE project_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_subscription_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_subscription_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_subscriptions"
    ON project_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_subscription_runs"
    ON project_subscription_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can do everything on project_subscription_deliveries"
    ON project_subscription_deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
