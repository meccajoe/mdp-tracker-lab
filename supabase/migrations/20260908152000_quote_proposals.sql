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

-- Chat persistence is owned by the turn row.  These RPCs deliberately keep
-- the message, proposal, compatibility event, and completion state in one transaction.
ALTER TABLE public.ada_chat_turns ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.quote_proposals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.claim_ada_chat_turn(
  p_workspace_id uuid, p_actor_email text, p_client_request_id uuid, p_request_content text
) RETURNS TABLE(turn_id uuid, turn_status text, claimed boolean, response_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing_turn public.ada_chat_turns; workspace_row public.ada_quote_workspaces; normalized_actor text := lower(btrim(p_actor_email)); turn_found boolean;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO workspace_row FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO existing_turn FROM public.ada_chat_turns WHERE workspace_id = p_workspace_id AND actor_email = normalized_actor AND client_request_id = p_client_request_id FOR UPDATE;
  turn_found := FOUND;
  IF turn_found AND existing_turn.request_content IS DISTINCT FROM p_request_content THEN RAISE EXCEPTION 'This request id belongs to different message content.' USING ERRCODE = '22023'; END IF;
  IF turn_found AND existing_turn.status = 'completed' THEN RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json; RETURN; END IF;
  IF turn_found AND existing_turn.status = 'pending' AND existing_turn.claimed_at > now() - interval '15 minutes' THEN RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json; RETURN; END IF;
  IF nullif(btrim(p_request_content), '') IS NULL OR char_length(p_request_content) > 20000 OR octet_length(p_request_content) > 80000 THEN RAISE EXCEPTION 'Ada chat request exceeds the technical size limit.' USING ERRCODE = '22023'; END IF;
  IF workspace_row.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000'; END IF;
  IF NOT turn_found THEN
    INSERT INTO public.ada_chat_turns(workspace_id, client_request_id, actor_email, request_content) VALUES (p_workspace_id, p_client_request_id, normalized_actor, p_request_content) RETURNING * INTO existing_turn;
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json; RETURN;
  END IF;
  UPDATE public.ada_chat_turns SET status = 'pending', claimed_at = now(), error_message = NULL, response_json = NULL, completed_at = NULL WHERE id = existing_turn.id RETURNING * INTO existing_turn;
  RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_ada_proposal_chat_user_message(
  p_workspace_id uuid, p_turn_id uuid, p_concept_id uuid, p_actor_email text, p_request_content text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.ada_chat_turns;
  m public.ada_quote_messages;
  actor text := lower(btrim(p_actor_email));
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_request_content), '') IS NULL OR char_length(p_request_content) > 20000 OR octet_length(p_request_content) > 80000 THEN
    RAISE EXCEPTION 'Ada chat request exceeds the technical size limit.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.ada_chat_turns WHERE id = p_turn_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR t.actor_email IS DISTINCT FROM actor OR t.request_content IS DISTINCT FROM p_request_content THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;
  IF t.user_message_id IS NOT NULL THEN
    SELECT * INTO m FROM public.ada_quote_messages WHERE id = t.user_message_id;
    IF FOUND THEN RETURN jsonb_build_object('userMessage', to_jsonb(m)); END IF;
    RAISE EXCEPTION 'Ada chat user message linkage is invalid.' USING ERRCODE = 'P0001';
  END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Ada chat turn is not pending.' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.ada_quote_messages(workspace_id, concept_id, role, content, created_by_email)
  VALUES (p_workspace_id, p_concept_id, 'user', p_request_content, actor)
  RETURNING * INTO m;
  UPDATE public.ada_chat_turns SET user_message_id = m.id WHERE id = t.id;
  RETURN jsonb_build_object('userMessage', to_jsonb(m));
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_ada_chat_turn(
  p_workspace_id uuid, p_turn_id uuid, p_actor_email text, p_error_message text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor text := lower(btrim(p_actor_email));
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ada_chat_turns SET status = 'failed', error_message = 'Ada could not complete this chat turn.', completed_at = NULL
  WHERE id = p_turn_id AND workspace_id = p_workspace_id AND actor_email = actor AND status <> 'completed';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ada_proposal_chat_turn(
  p_workspace_id uuid, p_turn_id uuid, p_concept_id uuid, p_actor_email text,
  p_expected_row_version bigint, p_source_revision_id uuid,
  p_proposed_revision_json jsonb, p_proposed_assumptions_json jsonb, p_proposed_evidence_json jsonb,
  p_creation_idempotency_key text, p_assistant_content text, p_assistant_payload_json jsonb,
  p_proposal_delta_json jsonb, p_workspace_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.ada_chat_turns;
  m public.ada_quote_messages;
  p public.quote_proposals;
  event public.ada_quote_events;
  actor text := lower(btrim(p_actor_email));
  proposal_json jsonb := NULL;
  response jsonb;
  payload jsonb;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.ada_chat_turns WHERE id = p_turn_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat turn not found.' USING ERRCODE = 'P0002'; END IF;
  IF t.actor_email IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF t.user_message_id IS NULL THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.ada_quote_messages WHERE id = t.user_message_id;
  IF NOT FOUND OR m.workspace_id IS DISTINCT FROM p_workspace_id OR m.concept_id IS DISTINCT FROM p_concept_id
     OR m.role IS DISTINCT FROM 'user' OR lower(btrim(m.created_by_email)) IS DISTINCT FROM actor
     OR m.content IS DISTINCT FROM t.request_content THEN
    RAISE EXCEPTION 'Ada chat user message provenance is invalid.' USING ERRCODE = '42501';
  END IF;
  IF t.status = 'completed' THEN
    IF t.response_json IS NULL THEN RAISE EXCEPTION 'Completed Ada chat turn has no response.' USING ERRCODE = 'P0001'; END IF;
    RETURN t.response_json;
  END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Ada chat turn is not pending.' USING ERRCODE = '55000'; END IF;
  IF p_assistant_content IS NULL OR nullif(btrim(p_assistant_content), '') IS NULL
     OR char_length(p_assistant_content) > 100000 OR octet_length(p_assistant_content) > 400000
     OR jsonb_typeof(p_assistant_payload_json) IS DISTINCT FROM 'object'
     OR (p_proposal_delta_json IS NOT NULL AND jsonb_typeof(p_proposal_delta_json) IS DISTINCT FROM 'object')
     OR octet_length(jsonb_build_object('assistantPayload', p_assistant_payload_json, 'proposalDelta', coalesce(p_proposal_delta_json, 'null'::jsonb))::text) > 1048576 THEN
    RAISE EXCEPTION 'Ada assistant response exceeds the technical size limit.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;
  IF p_assistant_content IS NULL OR jsonb_typeof(coalesce(p_assistant_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Ada assistant response is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_revision_json IS NOT NULL THEN
    p := public.create_quote_proposal(p_workspace_id, actor, p_expected_row_version, p_source_revision_id,
      p_proposed_revision_json, coalesce(p_proposed_assumptions_json, '[]'::jsonb), coalesce(p_proposed_evidence_json, '[]'::jsonb), p_creation_idempotency_key);
    proposal_json := jsonb_build_object(
      'id', p.id, 'workspaceId', p.workspace_id, 'sourceRevisionId', p.source_revision_id,
      'expectedRowVersion', p.expected_row_version, 'status', p.status,
      'proposedRevision', p.proposed_revision_json, 'proposedAssumptions', p.proposed_assumptions_json,
      'proposedEvidence', p.proposed_evidence_json, 'proposedManifestHash', p.proposed_manifest_hash,
      'createdByEmail', p.created_by_email, 'createdAt', p.created_at,
      'disposedByEmail', p.disposed_by_email, 'disposedAt', p.disposed_at, 'reason', p.reason,
      'editedRevision', p.edited_revision_json, 'editedAssumptions', p.edited_assumptions_json,
      'editedEvidence', p.edited_evidence_json, 'dispositionManifestHash', p.disposition_manifest_hash,
      'acceptedRevisionId', p.accepted_revision_id, 'creationIdempotencyKey', p.creation_idempotency_key,
      'dispositionIdempotencyKey', p.disposition_idempotency_key
    );
  END IF;
  payload := p_assistant_payload_json || jsonb_build_object('proposal', proposal_json, 'proposalDelta', p_proposal_delta_json, 'revision', NULL, 'revisionDelta', NULL);
  INSERT INTO public.ada_quote_messages(workspace_id, concept_id, role, content, structured_payload_json, created_by_email)
  VALUES (p_workspace_id, p_concept_id, 'assistant', p_assistant_content, payload, actor)
  RETURNING * INTO m;
  SELECT * INTO event FROM public.record_ada_compatibility_event(
    p_workspace_id, p_concept_id, 'chat_turn_completed', actor, 'edit_draft', p_workspace_status,
    jsonb_build_object('turn_id', t.id, 'user_message_id', t.user_message_id, 'assistant_message_id', m.id,
      'proposal_id', p.id, 'source_revision_id', p_source_revision_id, 'proposal_manifest_hash', p.proposed_manifest_hash),
    'chat-turn-completed:' || p_workspace_id::text || ':' || t.id::text
  );
  response := jsonb_build_object('userMessage', (SELECT to_jsonb(x) FROM public.ada_quote_messages x WHERE x.id = t.user_message_id),
    'assistantMessage', to_jsonb(m), 'proposal', proposal_json, 'proposalDelta', p_proposal_delta_json, 'revision', NULL, 'revisionDelta', NULL);
  UPDATE public.ada_chat_turns SET status = 'completed', assistant_message_id = m.id, proposal_id = p.id,
    response_json = response, error_message = NULL, completed_at = now() WHERE id = t.id;
  RETURN response;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_ada_proposal_chat_user_message(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fail_ada_chat_turn(uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.complete_ada_proposal_chat_turn(uuid, uuid, uuid, text, bigint, uuid, jsonb, jsonb, jsonb, text, text, jsonb, jsonb, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_ada_proposal_chat_user_message(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_ada_chat_turn(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ada_proposal_chat_turn(uuid, uuid, uuid, text, bigint, uuid, jsonb, jsonb, jsonb, text, text, jsonb, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.quote_proposal_validate_snapshot(p_revision jsonb, p_assumptions jsonb, p_evidence jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE item jsonb; evidence_ref jsonb; assumption jsonb;
BEGIN
  IF public.jsonb_contains_sensitive_material(jsonb_build_object('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence)) THEN
    RAISE EXCEPTION 'Proposal snapshots cannot contain credential-shaped material.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_revision) IS DISTINCT FROM 'object' OR jsonb_typeof(p_revision -> 'lineItems') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_revision -> 'lineItems') = 0 THEN
    RAISE EXCEPTION 'Proposal revision must contain a non-empty lineItems array.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_assumptions) IS DISTINCT FROM 'array' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Proposal assumptions and evidence must be arrays.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_revision -> 'lineItems') > 500 OR jsonb_array_length(p_assumptions) > 200 OR jsonb_array_length(p_evidence) > 500
     OR octet_length(jsonb_build_object('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence)::text) > 1048576 THEN
    RAISE EXCEPTION 'Proposal snapshot exceeds the technical size bound.' USING ERRCODE = '22023';
  END IF;
  FOR assumption IN SELECT value FROM jsonb_array_elements(p_assumptions) LOOP
    IF jsonb_typeof(assumption) <> 'string' THEN RAISE EXCEPTION 'Proposal assumptions must contain only strings.' USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_revision -> 'lineItems') LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item -> 'itemName') IS DISTINCT FROM 'string' OR nullif(btrim(item ->> 'itemName'), '') IS NULL
       OR jsonb_typeof(item -> 'buildItem') IS DISTINCT FROM 'string' OR nullif(btrim(item ->> 'buildItem'), '') IS NULL
       OR coalesce(item ->> 'lineType', '') NOT IN ('material', 'labor')
       OR jsonb_typeof(item -> 'internalCost') IS DISTINCT FROM 'number' OR (CASE WHEN jsonb_typeof(item -> 'internalCost') = 'number' THEN (item ->> 'internalCost')::numeric ELSE 0 END) < 0
       OR jsonb_typeof(item -> 'clientPrice') IS DISTINCT FROM 'number' OR (CASE WHEN jsonb_typeof(item -> 'clientPrice') = 'number' THEN (item ->> 'clientPrice')::numeric ELSE 0 END) < 0
       OR coalesce(item ->> 'confidence', '') NOT IN ('high', 'medium', 'low')
       OR jsonb_typeof(item -> 'evidenceRefs') IS DISTINCT FROM 'array'
       OR (item ? 'pricingBasis' AND (jsonb_typeof(item -> 'pricingBasis') IS DISTINCT FROM 'string' OR coalesce(item ->> 'pricingBasis', '') NOT IN ('user_input', 'tracker_evidence', 'expert_estimate', 'blended')))
       OR (item ? 'assumption' AND jsonb_typeof(item -> 'assumption') IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION 'Proposal lineItems contain an invalid line schema.' USING ERRCODE = '22023';
    END IF;
    FOR evidence_ref IN SELECT value FROM jsonb_array_elements(item -> 'evidenceRefs') LOOP
      IF jsonb_typeof(evidence_ref) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Proposal evidenceRefs must contain only strings.' USING ERRCODE = '22023'; END IF;
    END LOOP;
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
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals; actor text := lower(btrim(p_actor_email)); member_role text; normalized_reason text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO p FROM public.quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote proposal not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_disposition_idempotency_key), '') IS NULL OR char_length(btrim(p_disposition_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Disposition idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  normalized_reason := nullif(btrim(p_reason), '');
  IF normalized_reason IS NULL OR char_length(normalized_reason) > 2000 THEN RAISE EXCEPTION 'Rejection reason is required and bounded.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND disposition_idempotency_key = btrim(p_disposition_idempotency_key);
  IF FOUND THEN
    IF existing.id = p_proposal_id AND existing.disposed_by_email = actor AND existing.status = 'rejected' AND existing.reason = normalized_reason THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Disposition idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Quote proposal is already terminal.' USING ERRCODE = '55000'; END IF;
  IF w.row_version <> p_expected_row_version OR p.expected_row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR nullif(btrim(p_disposition_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason and idempotency key are required.' USING ERRCODE = '22023'; END IF;
  UPDATE public.quote_proposals SET status='rejected', disposed_by_email=actor, disposed_at=now(), reason=normalized_reason, disposition_idempotency_key=btrim(p_disposition_idempotency_key) WHERE id=p.id RETURNING * INTO p;
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
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 2000 THEN RAISE EXCEPTION 'Acceptance reason is bounded.' USING ERRCODE = '22023'; END IF;
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
