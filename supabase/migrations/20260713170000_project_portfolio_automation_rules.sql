ALTER TABLE project_portfolios
  ADD COLUMN IF NOT EXISTS automation_json jsonb NOT NULL DEFAULT '{"rule_type":"manual"}'::jsonb;

UPDATE project_portfolios
SET automation_json = '{"rule_type":"manual"}'::jsonb
WHERE automation_json IS NULL OR automation_json = '{}'::jsonb;
