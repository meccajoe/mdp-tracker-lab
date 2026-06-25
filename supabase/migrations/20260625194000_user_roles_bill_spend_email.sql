ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS bill_spend_email text;

UPDATE user_roles
SET bill_spend_email = lower(email)
WHERE bill_spend_email IS NULL
  AND email IS NOT NULL;
