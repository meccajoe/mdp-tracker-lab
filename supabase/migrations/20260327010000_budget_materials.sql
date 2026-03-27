-- Add budget_materials column and configurable L&M pct fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_materials numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_labor numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_materials numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_labor numeric(5,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_materials numeric(5,2);

-- Add labor and materials to global settings (if not already there)
INSERT INTO budget_formula_settings (category, label, default_pct) VALUES
  ('labor', 'Labor', 25),
  ('materials', 'Materials', 25)
ON CONFLICT (category) DO NOTHING;
