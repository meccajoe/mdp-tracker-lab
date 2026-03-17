-- MDP Project Cost Tracker - Initial Schema
-- Phase 1: Core tables for projects, expenses, labor, and COGS categories

-- COGS Categories (reference table)
CREATE TABLE cogs_categories (
  code text PRIMARY KEY,
  name text NOT NULL,
  definition text
);

-- Projects
CREATE TABLE projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  client text NOT NULL,
  pm text NOT NULL,
  close_date date,
  contract_amount numeric(12,2),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'On Hold')),
  notes text,
  budget_hrs numeric(8,2),
  budget_design numeric(10,2),
  budget_pm numeric(10,2),
  budget_shipping numeric(10,2),
  budget_id_labor numeric(10,2),
  budget_travel numeric(10,2),
  budget_props numeric(10,2),
  budget_equipment numeric(10,2),
  budget_flooring numeric(10,2),
  project_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE expenses (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date date NOT NULL,
  category text NOT NULL,
  cogs_code text REFERENCES cogs_categories(code),
  vendor text,
  amount numeric(10,2) NOT NULL,
  amount_pending boolean NOT NULL DEFAULT false,
  purchaser text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Labor entries
CREATE TABLE labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date date NOT NULL,
  person text NOT NULL,
  hours numeric(6,2) NOT NULL,
  labor_type text CHECK (labor_type IN ('Production Labor', 'I&D Labor', 'Design Labor')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_pm ON projects(pm);
CREATE INDEX idx_expenses_project_id ON expenses(project_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_labor_entries_project_id ON labor_entries(project_id);
CREATE INDEX idx_labor_entries_person ON labor_entries(person);

-- Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-generate expense IDs (EXP-001, EXP-002, etc.)
CREATE SEQUENCE expense_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_expense_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id = 'EXP-' || LPAD(nextval('expense_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expense_auto_id
  BEFORE INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION generate_expense_id();

-- Project summary view for dashboard queries
CREATE VIEW project_summary AS
SELECT
  p.id,
  p.name,
  p.client,
  p.pm,
  p.status,
  p.close_date,
  p.contract_amount,
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

-- RLS policies (permissive for Phase 1 - all authenticated users see everything)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cogs_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on projects"
  ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on expenses"
  ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on labor_entries"
  ON labor_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read cogs_categories"
  ON cogs_categories FOR SELECT TO authenticated USING (true);
