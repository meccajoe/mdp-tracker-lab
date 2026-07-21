-- Pin a specific associated HubSpot quote only for documented split-scope exceptions.
-- Normal projects retain the existing highest-version quote selection behavior.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS hubspot_quote_id TEXT;

COMMENT ON COLUMN public.projects.hubspot_quote_id IS
  'Optional associated HubSpot quote override for split-scope or exception projects.';
