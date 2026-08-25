ALTER TABLE public.project_postmortems
  DROP CONSTRAINT IF EXISTS project_postmortems_status_check;

ALTER TABLE public.project_postmortems
  ADD CONSTRAINT project_postmortems_status_check
  CHECK (status IN ('generating','draft','failed','reviewed','approved'));

ALTER TABLE public.project_postmortems
  ADD COLUMN IF NOT EXISTS error_message text;
