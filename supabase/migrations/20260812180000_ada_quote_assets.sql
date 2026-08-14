-- Ada evidence foundation: private uploaded drawings, images, and PDFs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('ada-quote-assets', 'ada-quote-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE TABLE IF NOT EXISTS public.ada_quote_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.ada_quote_concepts(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  analysis_status text NOT NULL DEFAULT 'uploaded' CHECK (analysis_status IN ('uploading', 'uploaded', 'analyzing', 'ready', 'failed')),
  analysis_json jsonb,
  analysis_error text,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ada_quote_assets_workspace_created
  ON public.ada_quote_assets (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ada_quote_assets_concept_created
  ON public.ada_quote_assets (concept_id, created_at);

ALTER TABLE public.ada_quote_assets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ada_quote_assets_updated_at ON public.ada_quote_assets;
CREATE TRIGGER ada_quote_assets_updated_at
  BEFORE UPDATE ON public.ada_quote_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
