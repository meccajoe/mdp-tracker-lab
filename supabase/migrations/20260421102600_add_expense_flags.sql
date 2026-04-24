ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_note text,
  ADD COLUMN IF NOT EXISTS flagged_by text,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_expenses_flagged ON expenses(flagged) WHERE flagged = true;
