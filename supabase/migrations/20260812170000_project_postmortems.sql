CREATE TABLE IF NOT EXISTS public.project_postmortems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved')),
  source_snapshot jsonb NOT NULL,
  narrative jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.project_postmortem_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postmortem_id uuid NOT NULL REFERENCES public.project_postmortems(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  lesson text NOT NULL,
  recommendation text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_for_ada boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_project_postmortems_project ON public.project_postmortems(project_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_postmortem_lessons_ada ON public.project_postmortem_lessons(project_id) WHERE approved_for_ada;
ALTER TABLE public.project_postmortems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_postmortem_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages postmortems" ON public.project_postmortems FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "service role manages postmortem lessons" ON public.project_postmortem_lessons FOR ALL USING (false) WITH CHECK (false);
