CREATE TABLE IF NOT EXISTS public.formula_rebaseline_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id),
  formula_version text NOT NULL DEFAULT 'sku-formulas-v1',
  before_budget_hrs numeric NOT NULL,
  before_budget_materials numeric NOT NULL,
  after_budget_hrs numeric NOT NULL,
  after_budget_materials numeric NOT NULL,
  formula_snapshot jsonb NOT NULL,
  applied_by text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  rollback_payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formula_rebaseline_audits_project ON public.formula_rebaseline_audits(project_id, applied_at DESC);
ALTER TABLE public.formula_rebaseline_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages formula rebaseline audits" ON public.formula_rebaseline_audits FOR ALL USING (false) WITH CHECK (false);
