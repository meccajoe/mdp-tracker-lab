-- Ada conversation and concept foundation.
-- Concepts are alternate quote approaches inside one independently switchable Ada workspace.

CREATE TABLE IF NOT EXISTS public.ada_quote_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  mode text NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'fast_pass')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ada_quote_concepts_workspace_label
  ON public.ada_quote_concepts (workspace_id, lower(label));

CREATE INDEX IF NOT EXISTS idx_ada_quote_concepts_workspace_created
  ON public.ada_quote_concepts (workspace_id, created_at);

CREATE TABLE IF NOT EXISTS public.ada_quote_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.ada_quote_concepts(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  structured_payload_json jsonb,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ada_quote_messages_concept_created
  ON public.ada_quote_messages (concept_id, created_at);

CREATE TABLE IF NOT EXISTS public.ada_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.ada_quote_concepts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload_json jsonb,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ada_quote_events_workspace_created
  ON public.ada_quote_events (workspace_id, created_at DESC);

ALTER TABLE public.ada_quote_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ada_quote_concepts_updated_at ON public.ada_quote_concepts;
CREATE TRIGGER ada_quote_concepts_updated_at
  BEFORE UPDATE ON public.ada_quote_concepts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
