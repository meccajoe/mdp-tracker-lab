ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS synced_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_external_id ON expenses(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS billcom_sync_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_sync_at timestamptz,
  last_bill_updated_time text,
  jobs_cache jsonb DEFAULT '{}',
  vendors_cache jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO billcom_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;
