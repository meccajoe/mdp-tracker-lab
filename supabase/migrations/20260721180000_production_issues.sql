-- Production Issue Tracker MVP
-- App writes use the service-role API after authenticated role checks; RLS remains enabled.

CREATE TABLE IF NOT EXISTS public.production_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('defect', 'rework', 'safety', 'site', 'vendor', 'labor', 'other')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  owner_label text,
  cost_impact numeric(12, 2),
  schedule_impact_days integer,
  linked_vendor text,
  reported_date date NOT NULL DEFAULT current_date,
  resolved_date date,
  reported_by text,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_issue_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.production_issues(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(trim(note)) > 0),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_issue_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.production_issues(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_issues_project_id ON public.production_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_production_issues_status ON public.production_issues(status);
CREATE INDEX IF NOT EXISTS idx_production_issues_category ON public.production_issues(category);
CREATE INDEX IF NOT EXISTS idx_production_issues_severity ON public.production_issues(severity);
CREATE INDEX IF NOT EXISTS idx_production_issues_reported_date ON public.production_issues(reported_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_issue_notes_issue_id ON public.production_issue_notes(issue_id);
CREATE INDEX IF NOT EXISTS idx_production_issue_photos_issue_id ON public.production_issue_photos(issue_id);

ALTER TABLE public.production_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issue_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issue_photos ENABLE ROW LEVEL SECURITY;

-- Browser clients use authenticated API routes; service-role access bypasses RLS.
DROP POLICY IF EXISTS "Authenticated users can read production issues" ON public.production_issues;
CREATE POLICY "Authenticated users can read production issues"
  ON public.production_issues FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can read production issue notes" ON public.production_issue_notes;
CREATE POLICY "Authenticated users can read production issue notes"
  ON public.production_issue_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can read production issue photos" ON public.production_issue_photos;
CREATE POLICY "Authenticated users can read production issue photos"
  ON public.production_issue_photos FOR SELECT TO authenticated USING (true);
