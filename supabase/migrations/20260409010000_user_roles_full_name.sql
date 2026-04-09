-- Add full_name to user_roles; keep pm_initials as legacy key for project.pm field
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS full_name text;

-- Seed full names for existing users from known PM list
UPDATE user_roles SET full_name = CASE pm_initials
  WHEN 'VW' THEN 'Vanessa Warfield'
  WHEN 'GM' THEN 'Greg Mayberry'
  WHEN 'MS' THEN 'Molly Strader'
  WHEN 'AS' THEN 'Aaron Schindehette'
  WHEN 'NG' THEN 'Nick Gonzales'
  WHEN 'PM' THEN 'Paul Mecca'
  WHEN 'KM' THEN 'Kristina Morland'
  WHEN 'KS' THEN 'Kristin Schilling'
  WHEN 'CC' THEN 'Carlos Chaidez'
  WHEN 'MM' THEN 'Maria Mecca'
  ELSE NULL
END
WHERE pm_initials IS NOT NULL AND full_name IS NULL;
