-- Add budget_rental column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_rental numeric(12,2);

-- Refresh the project_summary view to include the new column
-- (view already selects projects.* so no change needed, but refresh to be safe)
