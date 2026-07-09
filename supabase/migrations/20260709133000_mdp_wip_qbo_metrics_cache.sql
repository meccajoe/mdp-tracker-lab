-- Cache resolved QBO WIP metrics per project and as-of date so historical WIP views do not need to hit QBO every time.
CREATE TABLE IF NOT EXISTS qbo_project_wip_metrics (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  total_billed_to_date numeric(12,2),
  total_cost_to_date numeric(12,2),
  current_year_total_billings numeric(12,2),
  current_year_total_retainage numeric(12,2),
  current_year_costs numeric(12,2),
  billing_source text NOT NULL,
  cost_source text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, as_of_date)
);

ALTER TABLE qbo_project_wip_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_qbo_project_wip_metrics"
    ON qbo_project_wip_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
