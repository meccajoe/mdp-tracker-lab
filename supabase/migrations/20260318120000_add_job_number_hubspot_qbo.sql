ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_number TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hubspot_deal_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qbo_project_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qbo_project_url TEXT;

CREATE OR REPLACE VIEW project_summary AS
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
  p.project_type,
  p.created_at,
  p.updated_at,
  COALESCE(l.total_hours, 0) AS total_hrs_used,
  COALESCE(e.total_spent, 0) AS total_spent,
  COALESCE(e.pending_amount, 0) AS pending_amount,
  COALESCE(p.budget_hrs * 30, 0) AS budget_labor_dollars,
  CASE WHEN p.budget_hrs > 0
    THEN ROUND(COALESCE(l.total_hours, 0) / p.budget_hrs * 100, 1)
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
        COALESCE(p.budget_hrs * 30, 0)
      ) * 100, 1
    )
    ELSE 0
  END AS pct_budget_used
FROM projects p
LEFT JOIN (
  SELECT project_id, SUM(hours) AS total_hours
  FROM labor_entries
  GROUP BY project_id
) l ON l.project_id = p.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_spent, SUM(CASE WHEN amount_pending THEN amount ELSE 0 END) AS pending_amount
  FROM expenses
  GROUP BY project_id
) e ON e.project_id = p.id;
