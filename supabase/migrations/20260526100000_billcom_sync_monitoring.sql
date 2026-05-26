-- Add monitoring fields to billcom_sync_state so the UI can show error/skip badges
ALTER TABLE billcom_sync_state
  ADD COLUMN IF NOT EXISTS last_sync_errors   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_skipped  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_error_msgs text[] DEFAULT '{}';

-- Backfill existing row to have safe defaults (already inserted as 1 in initial migration)
UPDATE billcom_sync_state
SET last_sync_errors = 0,
    last_sync_skipped = 0,
    last_sync_error_msgs = '{}'
WHERE last_sync_errors IS NULL;
