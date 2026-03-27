-- Budget Formula System
-- Adds quote columns, per-project pct overrides, global settings table, and Pending status

-- Quote amounts (what Emily enters from the proposal)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_design numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_pm numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_shipping numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_id_labor numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_travel numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_props numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_equipment numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_flooring numeric(10,2);

-- Per-project percentage overrides (null = use global default)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_design numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_pm numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_shipping numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_id_labor numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_travel numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_props numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_equipment numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_flooring numeric(5,2);

-- Global default percentages table
CREATE TABLE IF NOT EXISTS budget_formula_settings (
  category text PRIMARY KEY,
  label text NOT NULL,
  default_pct numeric(5,2) NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO budget_formula_settings (category, label, default_pct) VALUES
  ('design',    'Design',              50),
  ('pm',        'Project Management',  75),
  ('shipping',  'Shipping',            70),
  ('id_labor',  'I&D Labor',           60),
  ('travel',    'Travel',              75),
  ('props',     'Props/Decor',         50),
  ('equipment', 'Equipment',           60),
  ('flooring',  'Flooring',            65)
ON CONFLICT (category) DO NOTHING;

ALTER TABLE budget_formula_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_budget_formula_settings"
    ON budget_formula_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add Pending status
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('Active', 'Completed', 'On Hold', 'Pending'));
