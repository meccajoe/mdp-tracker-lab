ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_crating numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_crating numeric(10,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pct_crating numeric(5,2);

INSERT INTO budget_formula_settings (category, label, default_pct)
VALUES ('crating', 'Crating', 60)
ON CONFLICT (category) DO NOTHING;