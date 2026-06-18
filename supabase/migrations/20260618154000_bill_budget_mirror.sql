ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_uuid text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_seeded_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_seed_source text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_last_sync_status text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_last_sync_error text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_job_name_snapshot text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_total_snapshot numeric(12,2);
