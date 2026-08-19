ALTER TABLE public.ada_quote_sheets ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE public.ada_quote_sheets ADD COLUMN IF NOT EXISTS sync_conflicts_json jsonb NOT NULL DEFAULT '[]'::jsonb;
