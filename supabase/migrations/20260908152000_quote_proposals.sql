-- Release 2: durable governed proposal snapshots and atomic dispositions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.quote_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE RESTRICT,
  source_revision_id uuid,
  expected_row_version bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  proposed_revision_json jsonb NOT NULL,
  proposed_assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_manifest_hash text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disposed_by_email text,
  disposed_at timestamptz,
  reason text,
  edited_revision_json jsonb,
  edited_assumptions_json jsonb,
  edited_evidence_json jsonb,
  disposition_manifest_hash text,
  accepted_revision_id uuid,
  creation_idempotency_key text NOT NULL,
  disposition_idempotency_key text,
  CONSTRAINT quote_proposals_source_workspace_fk FOREIGN KEY (source_revision_id, workspace_id)
    REFERENCES public.ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_proposals_accepted_workspace_fk FOREIGN KEY (accepted_revision_id, workspace_id)
    REFERENCES public.ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_proposals_status_check CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT quote_proposals_expected_row_version_check CHECK (expected_row_version > 0),
  CONSTRAINT quote_proposals_revision_object_check CHECK (jsonb_typeof(proposed_revision_json) = 'object'),
  CONSTRAINT quote_proposals_assumptions_array_check CHECK (jsonb_typeof(proposed_assumptions_json) = 'array'),
  CONSTRAINT quote_proposals_evidence_array_check CHECK (jsonb_typeof(proposed_evidence_json) = 'array'),
  CONSTRAINT quote_proposals_creation_key_check CHECK (char_length(btrim(creation_idempotency_key)) BETWEEN 1 AND 200),
  CONSTRAINT quote_proposals_disposition_key_check CHECK (disposition_idempotency_key IS NULL OR char_length(btrim(disposition_idempotency_key)) BETWEEN 1 AND 200),
  CONSTRAINT quote_proposals_shape_check CHECK (
    (status = 'pending' AND disposed_by_email IS NULL AND disposed_at IS NULL AND accepted_revision_id IS NULL
      AND reason IS NULL AND edited_revision_json IS NULL AND edited_assumptions_json IS NULL
      AND edited_evidence_json IS NULL AND disposition_manifest_hash IS NULL AND disposition_idempotency_key IS NULL)
    OR (status = 'accepted' AND nullif(btrim(disposed_by_email), '') IS NOT NULL AND disposed_at IS NOT NULL
      AND disposition_manifest_hash IS NOT NULL AND accepted_revision_id IS NOT NULL
      AND disposition_idempotency_key IS NOT NULL AND jsonb_typeof(coalesce(edited_revision_json, proposed_revision_json)) = 'object'
      AND jsonb_typeof(coalesce(edited_assumptions_json, proposed_assumptions_json)) = 'array'
      AND jsonb_typeof(coalesce(edited_evidence_json, proposed_evidence_json)) = 'array')
    OR (status = 'rejected' AND nullif(btrim(disposed_by_email), '') IS NOT NULL AND disposed_at IS NOT NULL
      AND accepted_revision_id IS NULL AND edited_revision_json IS NULL AND edited_assumptions_json IS NULL
      AND edited_evidence_json IS NULL AND disposition_manifest_hash IS NULL AND disposition_idempotency_key IS NOT NULL
      AND nullif(btrim(reason), '') IS NOT NULL)
  ),
  CONSTRAINT quote_proposals_email_normalized_check CHECK (
    created_by_email = lower(btrim(created_by_email)) AND nullif(btrim(created_by_email), '') IS NOT NULL
    AND (disposed_by_email IS NULL OR disposed_by_email = lower(btrim(disposed_by_email)))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_proposals_creation_key_uq ON public.quote_proposals(workspace_id, creation_idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS quote_proposals_disposition_key_uq ON public.quote_proposals(workspace_id, disposition_idempotency_key) WHERE disposition_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quote_proposals_accepted_revision_uq ON public.quote_proposals(accepted_revision_id) WHERE accepted_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quote_proposals_workspace_status_idx ON public.quote_proposals(workspace_id, status, created_at);

CREATE OR REPLACE FUNCTION public.protect_quote_proposal_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote proposals cannot be deleted.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Terminal quote proposals are immutable.' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','disposed_by_email','disposed_at','reason','edited_revision_json','edited_assumptions_json','edited_evidence_json','disposition_manifest_hash','accepted_revision_id','disposition_idempotency_key'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','disposed_by_email','disposed_at','reason','edited_revision_json','edited_assumptions_json','edited_evidence_json','disposition_manifest_hash','accepted_revision_id','disposition_idempotency_key']) THEN
    RAISE EXCEPTION 'Proposal identity and source snapshot are immutable.' USING ERRCODE = '55000';
  END IF;
  IF NEW.status NOT IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'Only pending proposals may be disposed.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_quote_proposal_immutability ON public.quote_proposals;
CREATE TRIGGER protect_quote_proposal_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_proposals
  FOR EACH ROW EXECUTE FUNCTION public.protect_quote_proposal_immutability();
DROP TRIGGER IF EXISTS protect_archived_quote_proposals ON public.quote_proposals;
CREATE TRIGGER protect_archived_quote_proposals
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_proposals
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();

ALTER TABLE public.quote_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_proposal_member_read ON public.quote_proposals;
CREATE POLICY quote_proposal_member_read ON public.quote_proposals
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_proposals FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.quote_proposals FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.quote_proposals TO authenticated;

CREATE OR REPLACE FUNCTION public.quote_proposal_validate_snapshot(p_revision jsonb, p_assumptions jsonb, p_evidence jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF public.jsonb_contains_sensitive_material(jsonb_build_object('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence)) THEN
    RAISE EXCEPTION 'Proposal snapshots cannot contain credential-shaped material.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_revision) <> 'object' OR jsonb_typeof(p_revision -> 'lineItems') <> 'array'
     OR jsonb_array_length(p_revision -> 'lineItems') = 0 THEN
    RAISE EXCEPTION 'Proposal revision must contain a non-empty lineItems array.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_assumptions) <> 'array' OR jsonb_typeof(p_evidence) <> 'array' THEN
    RAISE EXCEPTION 'Proposal assumptions and evidence must be arrays.' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_revision -> 'lineItems') LOOP
    IF jsonb_typeof(item) <> 'object' OR nullif(btrim(item ->> 'itemName'), '') IS NULL
       OR nullif(btrim(item ->> 'buildItem'), '') IS NULL OR nullif(btrim(item ->> 'lineType'), '') IS NULL
       OR coalesce(item ->> 'clientPrice', '') !~ '^[0-9]+([.][0-9]+)?$'
       OR coalesce(item ->> 'internalCost', '') !~ '^[0-9]+([.][0-9]+)?$' THEN
      RAISE EXCEPTION 'Proposal lineItems contain an invalid line or numeric value.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quote_proposal_workflow_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proposal_id uuid;
  p public.quote_proposals;
  event_count integer;
  expected_event_version bigint;
  payload_expected_version bigint;
  payload_resulting_version bigint;
BEGIN
  IF NEW.event_type NOT IN ('proposal_created','proposal_edited','proposal_accepted','proposal_rejected','revision_created') THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type = 'revision_created' AND NEW.payload_json ->> 'proposal_id' IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    proposal_id := (NEW.payload_json ->> 'proposal_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Proposal workflow event requires a valid proposal_id UUID.' USING ERRCODE = '23514';
  END;
  SELECT * INTO p FROM public.quote_proposals WHERE id = proposal_id FOR KEY SHARE;
  IF NOT FOUND OR p.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Proposal workflow event does not match a proposal in the event workspace.' USING ERRCODE = '23514';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM (CASE NEW.event_type
    WHEN 'proposal_created' THEN 'proposal-created:' || proposal_id::text
    WHEN 'proposal_edited' THEN 'proposal-edited:' || proposal_id::text
    WHEN 'proposal_accepted' THEN 'proposal-accepted:' || proposal_id::text
    WHEN 'proposal_rejected' THEN 'proposal-rejected:' || proposal_id::text
    WHEN 'revision_created' THEN 'proposal-revision-created:' || proposal_id::text
  END) THEN
    RAISE EXCEPTION 'Proposal workflow event idempotency key is not deterministic.' USING ERRCODE = '23514';
  END IF;
  expected_event_version := CASE NEW.event_type
    WHEN 'proposal_created' THEN p.expected_row_version - 1
    WHEN 'proposal_rejected' THEN p.expected_row_version
    WHEN 'proposal_edited' THEN p.expected_row_version
    WHEN 'proposal_accepted' THEN p.expected_row_version + CASE
      WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 1 ELSE 0
    END
    WHEN 'revision_created' THEN p.expected_row_version + CASE
      WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 2 ELSE 1
    END
  END;
  IF (SELECT count(*) FROM public.quote_workflow_events
      WHERE workspace_id = NEW.workspace_id AND event_type = NEW.event_type
        AND payload_json ->> 'proposal_id' = proposal_id::text) <> 1 THEN
    RAISE EXCEPTION 'Proposal workflow event is duplicated for this proposal.' USING ERRCODE = '23514';
  END IF;
  BEGIN
    payload_expected_version := (NEW.payload_json ->> 'expected_row_version')::bigint;
    payload_resulting_version := (NEW.payload_json ->> 'resulting_workspace_row_version')::bigint;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Proposal workflow event row-version provenance is invalid.' USING ERRCODE = '23514';
  END;
  IF payload_expected_version IS NULL OR payload_resulting_version IS NULL
     OR payload_resulting_version IS DISTINCT FROM payload_expected_version + 1
     OR payload_expected_version IS DISTINCT FROM expected_event_version THEN
    RAISE EXCEPTION 'Proposal workflow event row-version provenance is inconsistent.' USING ERRCODE = '23514';
  END IF;
  IF NEW.actor_email IS DISTINCT FROM (CASE WHEN NEW.event_type = 'proposal_created' THEN p.created_by_email ELSE p.disposed_by_email END) THEN
    RAISE EXCEPTION 'Proposal workflow event actor does not match proposal provenance.' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_type = 'proposal_created' THEN
    IF NEW.payload_json ->> 'created_from' <> 'ada_proposal'
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text
       OR NEW.payload_json ->> 'proposal_id' IS DISTINCT FROM p.id::text
       OR NEW.revision_id IS DISTINCT FROM p.source_revision_id THEN
      RAISE EXCEPTION 'Proposal creation event provenance does not match the immutable proposal.' USING ERRCODE = '23514';
    END IF;
    IF payload_expected_version IS DISTINCT FROM p.expected_row_version - 1
       OR payload_resulting_version IS DISTINCT FROM p.expected_row_version THEN
      RAISE EXCEPTION 'Proposal creation event row-version provenance is inconsistent.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.event_type = 'proposal_rejected' THEN
    IF p.status <> 'rejected' OR p.accepted_revision_id IS NOT NULL
       OR NEW.revision_id IS DISTINCT FROM p.source_revision_id
       OR NEW.reason IS DISTINCT FROM p.reason
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text THEN
      RAISE EXCEPTION 'Rejected proposal event does not match the final proposal disposition.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF p.status <> 'accepted' OR p.accepted_revision_id IS NULL
       OR NEW.reason IS DISTINCT FROM p.reason
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'accepted_hash' IS DISTINCT FROM p.disposition_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text THEN
      RAISE EXCEPTION 'Accepted proposal event does not match the final proposal disposition.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'proposal_edited' AND (
      p.edited_revision_json IS NULL OR p.edited_assumptions_json IS NULL OR p.edited_evidence_json IS NULL
      OR NEW.payload_json ->> 'edited' IS DISTINCT FROM 'true'
    ) THEN
      RAISE EXCEPTION 'Edited proposal event requires a complete edited snapshot and edited=true.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'proposal_accepted' AND NEW.payload_json ->> 'edited' IS DISTINCT FROM (
      CASE WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 'true' ELSE 'false' END
    ) THEN
      RAISE EXCEPTION 'Accepted proposal event edited provenance does not match the stored snapshot.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type <> 'revision_created' AND NEW.revision_id IS DISTINCT FROM p.source_revision_id THEN
      RAISE EXCEPTION 'Proposal disposition event revision does not match the proposal source.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'revision_created' THEN
      IF NEW.revision_id IS DISTINCT FROM p.accepted_revision_id
         OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text
         OR NEW.payload_json ->> 'normalized_manifest_hash' IS DISTINCT FROM (SELECT manifest_hash FROM public.ada_quote_revisions WHERE id = p.accepted_revision_id)
         OR NEW.payload_json ->> 'edited' IS DISTINCT FROM (
           CASE WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 'true' ELSE 'false' END
         )
         OR (SELECT workspace_id FROM public.ada_quote_revisions WHERE id = p.accepted_revision_id) IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION 'Proposal revision event does not match the accepted revision.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_quote_proposal_workflow_event ON public.quote_workflow_events;
CREATE CONSTRAINT TRIGGER validate_quote_proposal_workflow_event
  AFTER INSERT ON public.quote_workflow_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_quote_proposal_workflow_event();
REVOKE ALL ON FUNCTION public.validate_quote_proposal_workflow_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_quote_proposal(
  p_workspace_id uuid, p_actor_email text, p_expected_row_version bigint, p_source_revision_id uuid,
  p_proposed_revision_json jsonb, p_proposed_assumptions_json jsonb, p_proposed_evidence_json jsonb,
  p_creation_idempotency_key text
) RETURNS public.quote_proposals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals;
DECLARE actor text := lower(btrim(p_actor_email)); member_role text; proposed_hash text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_creation_idempotency_key), '') IS NULL OR char_length(btrim(p_creation_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Creation idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor
      AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  PERFORM public.quote_proposal_validate_snapshot(p_proposed_revision_json, p_proposed_assumptions_json, p_proposed_evidence_json);
  proposed_hash := public.quote_manifest_sha256(jsonb_build_object('revision', p_proposed_revision_json, 'assumptions', p_proposed_assumptions_json, 'evidence', p_proposed_evidence_json));
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND creation_idempotency_key = btrim(p_creation_idempotency_key);
  IF FOUND THEN
    IF existing.created_by_email = actor AND existing.source_revision_id IS NOT DISTINCT FROM p_source_revision_id AND existing.proposed_manifest_hash = proposed_hash THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Creation idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF w.lifecycle_status NOT IN ('intake','draft','internal_review') THEN RAISE EXCEPTION 'Proposal creation is not allowed from the current lifecycle state.' USING ERRCODE = 'P0001'; END IF;
  IF w.row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;
  IF p_source_revision_id IS DISTINCT FROM w.current_revision_id THEN RAISE EXCEPTION 'Proposal source must exactly match the current revision.' USING ERRCODE = '23503'; END IF;
  IF p_source_revision_id IS NOT NULL AND (w.current_revision_id IS NULL OR w.current_revision_id IS DISTINCT FROM p_source_revision_id) THEN RAISE EXCEPTION 'Proposal source must be the current revision.' USING ERRCODE = '23503'; END IF;
  IF p_source_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ada_quote_revisions WHERE id = p_source_revision_id AND workspace_id = p_workspace_id) THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.quote_proposals(workspace_id, source_revision_id, expected_row_version, proposed_revision_json, proposed_assumptions_json, proposed_evidence_json, proposed_manifest_hash, created_by_email, creation_idempotency_key)
  VALUES (p_workspace_id, p_source_revision_id, p_expected_row_version + 1, p_proposed_revision_json, p_proposed_assumptions_json, p_proposed_evidence_json, proposed_hash, actor, btrim(p_creation_idempotency_key)) RETURNING * INTO p;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p_source_revision_id, 'proposal_created', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, 'Quote proposal created', p_proposed_evidence_json, jsonb_build_object('proposal_id', p.id, 'source_revision_id', p_source_revision_id, 'expected_row_version', p_expected_row_version, 'proposal_manifest_hash', proposed_hash, 'created_from', 'ada_proposal', 'resulting_workspace_row_version', p_expected_row_version + 1, 'workspace_row_version', p_expected_row_version + 1), 'proposal-created:' || p.id::text);
  SELECT * INTO p FROM public.quote_proposals WHERE id = p.id;
  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_quote_proposal(
  p_workspace_id uuid, p_proposal_id uuid, p_actor_email text, p_expected_row_version bigint,
  p_reason text, p_disposition_idempotency_key text
) RETURNS public.quote_proposals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals; actor text := lower(btrim(p_actor_email)); member_role text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO p FROM public.quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote proposal not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_disposition_idempotency_key), '') IS NULL OR char_length(btrim(p_disposition_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Disposition idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND disposition_idempotency_key = btrim(p_disposition_idempotency_key);
  IF FOUND THEN
    IF existing.id = p_proposal_id AND existing.disposed_by_email = actor AND existing.status = 'rejected' AND existing.reason = btrim(p_reason) THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Disposition idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Quote proposal is already terminal.' USING ERRCODE = '55000'; END IF;
  IF w.row_version <> p_expected_row_version OR p.expected_row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR nullif(btrim(p_disposition_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason and idempotency key are required.' USING ERRCODE = '22023'; END IF;
  UPDATE public.quote_proposals SET status='rejected', disposed_by_email=actor, disposed_at=now(), reason=btrim(p_reason), disposition_idempotency_key=btrim(p_disposition_idempotency_key) WHERE id=p.id RETURNING * INTO p;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_rejected', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, p.reason, p.proposed_evidence_json, jsonb_build_object('proposal_id', p.id, 'source_revision_id', p.source_revision_id, 'proposal_manifest_hash', p.proposed_manifest_hash, 'expected_row_version', p_expected_row_version, 'resulting_workspace_row_version', p_expected_row_version + 1, 'workspace_row_version', p_expected_row_version + 1), 'proposal-rejected:' || p.id::text);
  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_quote_proposal(
  p_workspace_id uuid, p_proposal_id uuid, p_actor_email text, p_expected_row_version bigint,
  p_edited_revision_json jsonb DEFAULT NULL, p_edited_assumptions_json jsonb DEFAULT NULL,
  p_edited_evidence_json jsonb DEFAULT NULL, p_reason text DEFAULT NULL,
  p_disposition_idempotency_key text DEFAULT NULL
) RETURNS public.quote_proposals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals; actor text := lower(btrim(p_actor_email)); member_role text;
DECLARE revision_json jsonb; assumptions_json jsonb; evidence_json jsonb; edited boolean; accepted_hash text; revision_id uuid; revision_number integer; cost numeric; sell numeric; margin numeric; norm_status text; source_hash text; norm_hash text; norm_locked_at timestamptz; normalized_reason text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO p FROM public.quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote proposal not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_disposition_idempotency_key), '') IS NULL OR char_length(btrim(p_disposition_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Disposition idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  normalized_reason := nullif(btrim(p_reason), '');
  edited := p_edited_revision_json IS NOT NULL OR p_edited_assumptions_json IS NOT NULL OR p_edited_evidence_json IS NOT NULL;
  IF edited AND (p_edited_revision_json IS NULL OR p_edited_assumptions_json IS NULL OR p_edited_evidence_json IS NULL) THEN RAISE EXCEPTION 'Edited acceptance requires a complete revision, assumptions, and evidence snapshot.' USING ERRCODE = '22023'; END IF;
  revision_json := coalesce(p_edited_revision_json, p.proposed_revision_json); assumptions_json := coalesce(p_edited_assumptions_json, p.proposed_assumptions_json); evidence_json := coalesce(p_edited_evidence_json, p.proposed_evidence_json);
  PERFORM public.quote_proposal_validate_snapshot(revision_json, assumptions_json, evidence_json);
  accepted_hash := public.quote_manifest_sha256(jsonb_build_object('revision', revision_json, 'assumptions', assumptions_json, 'evidence', evidence_json));
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND disposition_idempotency_key = btrim(p_disposition_idempotency_key);
  IF FOUND THEN
    IF existing.id = p_proposal_id AND existing.disposed_by_email = actor AND existing.status = 'accepted' AND existing.reason IS NOT DISTINCT FROM normalized_reason AND (existing.edited_revision_json IS NOT NULL) = edited AND existing.disposition_manifest_hash = accepted_hash THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Disposition idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Quote proposal is already terminal.' USING ERRCODE = '55000'; END IF;
  IF w.row_version <> p_expected_row_version OR p.expected_row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  SELECT coalesce(max(r.revision_number), 0) + 1 INTO revision_number FROM public.ada_quote_revisions r WHERE r.workspace_id = p_workspace_id;
  SELECT sum((value ->> 'internalCost')::numeric), sum((value ->> 'clientPrice')::numeric) INTO cost, sell FROM jsonb_array_elements(revision_json -> 'lineItems');
  margin := CASE WHEN sell = 0 THEN 0 ELSE round(((sell - cost) / sell) * 100, 6) END;
  IF edited THEN
    PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_edited', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'accepted_hash',accepted_hash,'edited',true,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-edited:' || p.id::text);
    SELECT row_version INTO p_expected_row_version FROM public.ada_quote_workspaces WHERE id=p_workspace_id;
  END IF;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_accepted', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'edited',edited,'accepted_hash',accepted_hash,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-accepted:' || p.id::text);
  SELECT row_version INTO p_expected_row_version FROM public.ada_quote_workspaces WHERE id=p_workspace_id;
  revision_id := gen_random_uuid();
  INSERT INTO public.ada_quote_revisions(id, workspace_id, revision_number, parent_revision_id, revision_kind, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_by_email, created_from, source_manifest_hash)
  VALUES (revision_id, p_workspace_id, revision_number, p.source_revision_id, CASE WHEN p.source_revision_id IS NULL THEN 'baseline' ELSE 'revision' END, revision_json, cost, sell, margin, assumptions_json, evidence_json, actor, 'ada_proposal', NULL);
  PERFORM public.normalize_legacy_quote_revision(revision_id);
  SELECT normalization_status, source_manifest_hash, manifest_hash, locked_at INTO norm_status, source_hash, norm_hash, norm_locked_at FROM public.ada_quote_revisions WHERE id=revision_id;
  IF norm_status <> 'normalized' OR source_hash IS DISTINCT FROM public.quote_manifest_sha256(revision_json) OR norm_hash IS NULL OR norm_locked_at IS NULL THEN RAISE EXCEPTION 'Accepted proposal revision did not normalize and lock.' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.append_quote_workflow_event(p_workspace_id, revision_id, 'revision_created', actor, member_role, 'edit_draft', p_expected_row_version, 'draft', normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'accepted_hash',accepted_hash,'normalized_manifest_hash',norm_hash,'edited',edited,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-revision-created:' || p.id::text);
  UPDATE public.quote_proposals SET status='accepted', disposed_by_email=actor, disposed_at=now(), reason=normalized_reason, edited_revision_json=CASE WHEN edited THEN revision_json ELSE NULL END, edited_assumptions_json=CASE WHEN edited THEN assumptions_json ELSE NULL END, edited_evidence_json=CASE WHEN edited THEN evidence_json ELSE NULL END, disposition_manifest_hash=accepted_hash, accepted_revision_id=revision_id, disposition_idempotency_key=btrim(p_disposition_idempotency_key) WHERE id=p.id RETURNING * INTO p;
  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.quote_proposal_validate_snapshot(jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_quote_proposal(uuid,uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_quote_proposal_workflow_event() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_quote_proposal(uuid,uuid,text,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text) TO authenticated;
