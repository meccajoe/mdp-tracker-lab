-- WIP reporting foundation for Venturity / accounting exports
-- Adds project-level WIP metadata, frozen snapshot tables, and refreshes project_summary
-- so derived estimated cost uses the full current budget model.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_nickname text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_class text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sales_tax_included text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_cost_override numeric(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_updated_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_updated_by text;

CREATE TABLE IF NOT EXISTS wip_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text,
  status text NOT NULL CHECK (status IN ('draft', 'final')),
  notes text,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wip_report_snapshot_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES wip_report_snapshots(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  customer text NOT NULL,
  project_number text,
  project_name text NOT NULL,
  wip_class text,
  job_nickname text,
  contract_date date,
  contract_amount numeric(12,2),
  estimated_cost numeric(12,2),
  estimated_cost_source text NOT NULL CHECK (estimated_cost_source IN ('derived', 'manual_override')),
  sales_tax_included text,
  completion_date date,
  project_status text,
  pm_initials text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wip_report_snapshots_snapshot_date ON wip_report_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_wip_report_snapshots_status ON wip_report_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_wip_report_snapshot_rows_snapshot_id ON wip_report_snapshot_rows(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_wip_report_snapshot_rows_project_id ON wip_report_snapshot_rows(project_id);

DROP TRIGGER IF EXISTS wip_report_snapshots_updated_at ON wip_report_snapshots;
CREATE TRIGGER wip_report_snapshots_updated_at
  BEFORE UPDATE ON wip_report_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

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
  p.due_date,
  p.contract_amount,
  p.job_nickname,
  p.wip_class,
  p.sales_tax_included,
  p.estimated_cost_override,
  p.wip_notes,
  p.wip_updated_at,
  p.wip_updated_by,
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
  p.budget_rental,
  p.budget_crating,
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
  p.quote_rental,
  p.quote_crating,
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
  p.pct_rental,
  p.pct_crating,
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
    COALESCE(p.budget_rental, 0) +
    COALESCE(p.budget_crating, 0) +
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
    COALESCE(p.budget_rental, 0) +
    COALESCE(p.budget_crating, 0) +
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
        COALESCE(p.budget_rental, 0) +
        COALESCE(p.budget_crating, 0) +
        COALESCE(p.budget_flooring, 0) +
        COALESCE(p.budget_materials, 0) +
        COALESCE(p.budget_hrs * 30, 0)
      ) * 100, 1
    )
    ELSE 0
  END AS pct_budget_used,
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

ALTER TABLE wip_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE wip_report_snapshot_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything on wip_report_snapshots" ON wip_report_snapshots;
CREATE POLICY "Authenticated users can do everything on wip_report_snapshots"
  ON wip_report_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can do everything on wip_report_snapshot_rows" ON wip_report_snapshot_rows;
CREATE POLICY "Authenticated users can do everything on wip_report_snapshot_rows"
  ON wip_report_snapshot_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);
