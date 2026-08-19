-- Canonical, atomic quote revision and acceptance operations.
ALTER TABLE public.ada_quote_workspaces
  ADD COLUMN IF NOT EXISTS accepted_revision_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_workspaces_accepted_revision_fk'
  ) THEN
    ALTER TABLE public.ada_quote_workspaces
      ADD CONSTRAINT ada_quote_workspaces_accepted_revision_fk
      FOREIGN KEY (accepted_revision_id) REFERENCES public.ada_quote_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_ada_quote_revision(
  p_workspace_id uuid,
  p_actor_email text,
  p_quote_json jsonb,
  p_internal_cost numeric,
  p_sell_price numeric,
  p_margin_pct numeric,
  p_assumptions_json jsonb DEFAULT '[]'::jsonb,
  p_evidence_json jsonb DEFAULT '[]'::jsonb
)
RETURNS SETOF public.ada_quote_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_revision_number integer;
  created_revision public.ada_quote_revisions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = p_workspace_id AND lower(created_by_email) = lower(p_actor_email)
  ) THEN
    RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO next_revision_number
  FROM public.ada_quote_revisions
  WHERE workspace_id = p_workspace_id;

  INSERT INTO public.ada_quote_revisions (
    workspace_id, revision_number, quote_json, internal_cost, sell_price,
    margin_pct, assumptions_json, evidence_json, created_by_email
  ) VALUES (
    p_workspace_id, next_revision_number, p_quote_json, p_internal_cost, p_sell_price,
    p_margin_pct, p_assumptions_json, p_evidence_json, lower(p_actor_email)
  )
  RETURNING * INTO created_revision;

  UPDATE public.ada_quote_workspaces
  SET status = 'in_review', accepted_revision_id = NULL, accepted_at = NULL, last_activity_at = now()
  WHERE id = p_workspace_id AND lower(created_by_email) = lower(p_actor_email);

  RETURN NEXT created_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_ada_quote_revision(
  p_workspace_id uuid,
  p_revision_id uuid,
  p_actor_email text
)
RETURNS TABLE(accepted_revision_id uuid, accepted_at timestamptz, already_accepted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_revision_id uuid;
  latest_revision_number integer;
  current_accepted_revision_id uuid;
  current_accepted_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  SELECT w.accepted_revision_id, w.accepted_at
  INTO current_accepted_revision_id, current_accepted_at
  FROM public.ada_quote_workspaces w
  WHERE w.id = p_workspace_id AND lower(w.created_by_email) = lower(p_actor_email)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.id, r.revision_number
  INTO latest_revision_id, latest_revision_number
  FROM public.ada_quote_revisions r
  WHERE r.workspace_id = p_workspace_id
  ORDER BY r.revision_number DESC
  LIMIT 1;
  IF latest_revision_id IS NULL OR latest_revision_id <> p_revision_id THEN
    RAISE EXCEPTION 'Only the latest reviewed quote revision can be accepted.' USING ERRCODE = 'P0001';
  END IF;

  IF current_accepted_revision_id = p_revision_id AND current_accepted_at IS NOT NULL THEN
    RETURN QUERY SELECT p_revision_id, current_accepted_at, true;
    RETURN;
  END IF;

  current_accepted_at := now();
  UPDATE public.ada_quote_workspaces
  SET status = 'accepted', accepted_revision_id = p_revision_id, accepted_at = current_accepted_at, last_activity_at = current_accepted_at
  WHERE id = p_workspace_id AND lower(created_by_email) = lower(p_actor_email);

  INSERT INTO public.ada_quote_events (workspace_id, event_type, actor_email, payload_json)
  VALUES (p_workspace_id, 'quote_accepted', lower(p_actor_email), jsonb_build_object(
    'revision_id', p_revision_id,
    'revision_number', latest_revision_number,
    'accepted_at', current_accepted_at
  ));

  RETURN QUERY SELECT p_revision_id, current_accepted_at, false;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ada_quote_revision(uuid, text, jsonb, numeric, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_ada_quote_revision(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ada_quote_revision(uuid, text, jsonb, numeric, numeric, numeric, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_ada_quote_revision(uuid, uuid, text) TO service_role;
