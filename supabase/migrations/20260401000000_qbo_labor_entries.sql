-- QBO Labor Sync: new table for QuickBooks time activity data
CREATE TABLE IF NOT EXISTS qbo_labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  date date NOT NULL,
  reg_hours numeric(8,2) NOT NULL DEFAULT 0,
  ot_hours numeric(8,2) NOT NULL DEFAULT 0,
  hourly_rate numeric(8,2) NOT NULL DEFAULT 30,
  qbo_entry_id text UNIQUE NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qbo_labor_project ON qbo_labor_entries(project_id);
CREATE INDEX idx_qbo_labor_date ON qbo_labor_entries(date);

ALTER TABLE qbo_labor_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_qbo_labor_entries"
    ON qbo_labor_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update project_summary view to include QBO labor hours + cost
DROP VIEW IF EXISTS project_summary;
CREATE VIEW project_summary AS
SELECT
  p.id,
  p.name,
  p.client,
  p.pm,
  p.job_number,
  p.status,
  p.close_date,
  p.contract_amount,
  p.notes,
  p.hubspot_deal_id,
  p.hubspot_deal_url,
  p.qbo_project_id,
  p.qbo_project_url,
  p.budget_hrs,
  p.budget_design,
  p.budget_pm,
  p.budget_shipping,
  p.budget_id_labor,
  p.budget_travel,
  p.budget_props,
  p.budget_equipment,
  p.budget_flooring,
  p.budget_materials,
  p.project_type,
  p.created_at,
  p.updated_at,
  p.quote_labor,
  p.quote_materials,
  p.quote_design,
  p.quote_pm,
  p.quote_shipping,
  p.quote_id_labor,
  p.quote_travel,
  p.quote_props,
  p.quote_equipment,
  p.quote_flooring,
  p.pct_labor,
  p.pct_materials,
  p.pct_design,
  p.pct_pm,
  p.pct_shipping,
  p.pct_id_labor,
  p.pct_travel,
  p.pct_props,
  p.pct_equipment,
  p.pct_flooring,
  COALESCE(ql.total_reg_hours, 0) + COALESCE(l.total_hours, 0) AS total_hrs_used,
  COALESCE(e.total_spent, 0) AS total_spent,
  COALESCE(e.pending_amount, 0) AS pending_amount,
  COALESCE(p.budget_hrs * 30, 0) AS budget_labor_dollars,
  CASE WHEN p.budget_hrs > 0
    THEN ROUND((COALESCE(ql.total_reg_hours, 0) + COALESCE(ql.total_ot_hours, 0) + COALESCE(l.total_hours, 0)) / p.budget_hrs * 100, 1)
    ELSE 0
  END AS pct_hrs_used,
  (
    COALESCE(p.budget_design, 0) +
    COALESCE(p.budget_pm, 0) +
    COALESCE(p.budget_shipping, 0) +
    COALESCE(p.budget_id_labor, 0) +
    COALESCE(p.budget_travel, 0) +
    COALESCE(p.budget_props, 0) +
    COALESCE(p.budget_equipment, 0) +
    COALESCE(p.budget_flooring, 0) +
    COALESCE(p.budget_materials, 0) +
    COALESCE(p.budget_hrs * 30, 0)
  ) AS total_budget,
  CASE WHEN (
    COALESCE(p.budget_design, 0) +
    COALESCE(p.budget_pm, 0) +
    COALESCE(p.budget_shipping, 0) +
    COALESCE(p.budget_id_labor, 0) +
    COALESCE(p.budget_travel, 0) +
    COALESCE(p.budget_props, 0) +
    COALESCE(p.budget_equipment, 0) +
    COALESCE(p.budget_flooring, 0) +
    COALESCE(p.budget_materials, 0) +
    COALESCE(p.budget_hrs * 30, 0)
  ) > 0
    THEN ROUND(
      COALESCE(e.total_spent, 0) / (
        COALESCE(p.budget_design, 0) +
        COALESCE(p.budget_pm, 0) +
        COALESCE(p.budget_shipping, 0) +
        COALESCE(p.budget_id_labor, 0) +
        COALESCE(p.budget_travel, 0) +
        COALESCE(p.budget_props, 0) +
        COALESCE(p.budget_equipment, 0) +
        COALESCE(p.budget_flooring, 0) +
        COALESCE(p.budget_materials, 0) +
        COALESCE(p.budget_hrs * 30, 0)
      ) * 100, 1
    )
    ELSE 0
  END AS pct_budget_used,
  -- QBO labor aggregates for projects list
  COALESCE(ql.total_reg_hours, 0) + COALESCE(ql.total_ot_hours, 0) AS qbo_total_hours,
  COALESCE(ql.total_labor_cost, 0) AS qbo_labor_cost,
  ql.last_synced_at AS qbo_last_synced
FROM projects p
LEFT JOIN (
  SELECT project_id, SUM(hours) AS total_hours
  FROM labor_entries
  GROUP BY project_id
) l ON l.project_id = p.id
LEFT JOIN (
  SELECT
    project_id,
    SUM(reg_hours) AS total_reg_hours,
    SUM(ot_hours) AS total_ot_hours,
    SUM((reg_hours + ot_hours) * hourly_rate) AS total_labor_cost,
    MAX(synced_at) AS last_synced_at
  FROM qbo_labor_entries
  GROUP BY project_id
) ql ON ql.project_id = p.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_spent, SUM(CASE WHEN amount_pending THEN amount ELSE 0 END) AS pending_amount
  FROM expenses
  GROUP BY project_id
) e ON e.project_id = p.id;
