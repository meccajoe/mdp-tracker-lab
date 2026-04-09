-- QBO project-level P&L snapshot for reconciliation
CREATE TABLE IF NOT EXISTS qbo_project_pnl (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  qbo_income numeric(12,2) DEFAULT 0,
  qbo_expenses numeric(12,2) DEFAULT 0,
  qbo_net_income numeric(12,2) DEFAULT 0,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE qbo_project_pnl ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_qbo_project_pnl"
    ON qbo_project_pnl FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
