-- Release 1: append-only workflow evidence and durable integration outbox.

CREATE TABLE IF NOT EXISTS public.quote_workflow_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  actor_capability text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  prior_state text NOT NULL,
  resulting_state text NOT NULL,
  reason text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  CONSTRAINT quote_workflow_events_type_check CHECK (event_type IN (
    'workspace_created','evidence_attached','proposal_created','proposal_accepted','proposal_rejected','proposal_edited',
    'revision_created','revision_submitted_for_review','commercial_approved','commercial_approval_revoked',
    'publication_requested','publication_succeeded','publication_failed','publication_drift_detected',
    'customer_accepted','customer_acceptance_revoked_or_voided','production_readiness_confirmed',
    'operational_release_approved','operationally_released','release_blocked','change_requested','change_approved',
    'work_package_corrected','labor_coding_corrected','project_activated','project_completed','postmortem_started',
    'postmortem_approved','lesson_approved','lesson_withdrawn','workspace_archived'
  )),
  CONSTRAINT quote_workflow_events_actor_check CHECK (nullif(btrim(actor_email), '') IS NOT NULL AND actor_email = lower(btrim(actor_email)) AND nullif(btrim(actor_capability), '') IS NOT NULL),
  CONSTRAINT quote_workflow_events_state_check CHECK (nullif(btrim(prior_state), '') IS NOT NULL AND nullif(btrim(resulting_state), '') IS NOT NULL),
  CONSTRAINT quote_workflow_events_reason_check CHECK (actor_capability <> 'break_glass' OR nullif(btrim(reason), '') IS NOT NULL),
  CONSTRAINT quote_workflow_events_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_quote_workflow_events_workspace_time
  ON public.quote_workflow_events (workspace_id, occurred_at, event_id);
CREATE INDEX IF NOT EXISTS idx_quote_workflow_events_revision_time
  ON public.quote_workflow_events (revision_id, occurred_at, event_id)
  WHERE revision_id IS NOT NULL;

ALTER TABLE public.ada_quote_events ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ada_quote_events_idempotency
  ON public.ada_quote_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.ada_quote_assets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.ada_quote_assets ADD COLUMN IF NOT EXISTS archived_by_email text;
CREATE INDEX IF NOT EXISTS idx_ada_quote_assets_workspace_active
  ON public.ada_quote_assets (workspace_id, created_at)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.jsonb_contains_sensitive_material(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE entry record;
DECLARE scalar_value text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR entry IN SELECT key, json_value FROM jsonb_each(value) AS item(key, json_value)
    LOOP
      IF entry.key ~* '(authorization|token|password|secret|api.?key|connection.?string|credential|cookie)' OR
         public.jsonb_contains_sensitive_material(entry.json_value) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR entry IN SELECT json_value FROM jsonb_array_elements(value) AS item(json_value)
    LOOP
      IF public.jsonb_contains_sensitive_material(entry.json_value) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'string' THEN
    scalar_value := value #>> '{}';
    IF scalar_value <> '[REDACTED]' AND scalar_value ~* '(bearer[[:space:]]+[a-z0-9._-]{8,}|postgres(ql)?://|sk-[a-z0-9_-]{8,}|(password|secret|token|credential)[[:space:]]*[:=])' THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  destination text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  external_identity text,
  payload_json jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  lease_owner text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT integration_outbox_destination_check CHECK (destination IN ('hubspot','qbt','bill','google_sheets')),
  CONSTRAINT integration_outbox_status_check CHECK (status IN ('pending','processing','succeeded','retryable_failed','terminal_failed','cancelled')),
  CONSTRAINT integration_outbox_attempts_check CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
  CONSTRAINT integration_outbox_lease_check CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT integration_outbox_completion_check CHECK ((status = 'succeeded' AND completed_at IS NOT NULL) OR status <> 'succeeded'),
  CONSTRAINT integration_outbox_no_credentials_check CHECK (
    NOT public.jsonb_contains_sensitive_material(payload_json)
    AND NOT public.jsonb_contains_sensitive_material(to_jsonb(coalesce(external_identity, '')))
    AND NOT public.jsonb_contains_sensitive_material(to_jsonb(coalesce(last_error_message, '')))
  ),
  CONSTRAINT integration_outbox_idempotency_key UNIQUE (idempotency_key)
);

ALTER TABLE public.integration_outbox DROP CONSTRAINT IF EXISTS integration_outbox_no_credentials_check;
ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_no_credentials_check CHECK (
  NOT public.jsonb_contains_sensitive_material(payload_json)
  AND NOT public.jsonb_contains_sensitive_material(to_jsonb(coalesce(external_identity, '')))
  AND NOT public.jsonb_contains_sensitive_material(to_jsonb(coalesce(last_error_message, '')))
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_claim
  ON public.integration_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending','retryable_failed');
CREATE INDEX IF NOT EXISTS idx_integration_outbox_lease
  ON public.integration_outbox (lease_expires_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.reject_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only.', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS reject_quote_workflow_event_mutation ON public.quote_workflow_events;
CREATE TRIGGER reject_quote_workflow_event_mutation
  BEFORE UPDATE OR DELETE ON public.quote_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

DROP TRIGGER IF EXISTS reject_ada_quote_event_mutation ON public.ada_quote_events;
CREATE TRIGGER reject_ada_quote_event_mutation
  BEFORE UPDATE OR DELETE ON public.ada_quote_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.protect_integration_outbox_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.aggregate_type, NEW.aggregate_id, NEW.destination, NEW.operation, NEW.idempotency_key, NEW.payload_json, NEW.payload_hash)
     IS DISTINCT FROM
     (OLD.aggregate_type, OLD.aggregate_id, OLD.destination, OLD.operation, OLD.idempotency_key, OLD.payload_json, OLD.payload_hash) THEN
    RAISE EXCEPTION 'Integration outbox command identity and payload are immutable.' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_integration_outbox_identity ON public.integration_outbox;
CREATE TRIGGER protect_integration_outbox_identity
  BEFORE UPDATE ON public.integration_outbox
  FOR EACH ROW EXECUTE FUNCTION public.protect_integration_outbox_identity();

CREATE OR REPLACE FUNCTION public.protect_quote_workspace_projection()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.status, NEW.lifecycle_status, NEW.current_revision_id, NEW.commercial_approved_revision_id, NEW.hubspot_published_revision_id, NEW.customer_accepted_revision_id, NEW.operationally_released_revision_id)
     IS DISTINCT FROM
     (OLD.status, OLD.lifecycle_status, OLD.current_revision_id, OLD.commercial_approved_revision_id, OLD.hubspot_published_revision_id, OLD.customer_accepted_revision_id, OLD.operationally_released_revision_id)
     AND (
       to_regprocedure('public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)'::regprocedure))
     )
     AND (
       to_regprocedure('public.record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text)'::regprocedure))
     ) THEN
    RAISE EXCEPTION 'Quote lifecycle projections may change only through the workflow service.' USING ERRCODE = '42501';
  END IF;
  IF NEW.row_version = OLD.row_version THEN NEW.row_version := OLD.row_version + 1; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_quote_workspace_projection ON public.ada_quote_workspaces;
CREATE TRIGGER protect_quote_workspace_projection
  BEFORE UPDATE ON public.ada_quote_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.protect_quote_workspace_projection();

CREATE OR REPLACE FUNCTION public.is_quote_transition_allowed(prior text, resulting text, event_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN event_name IN ('evidence_attached','proposal_created','proposal_accepted','proposal_rejected','proposal_edited','change_requested','work_package_corrected','labor_coding_corrected','lesson_approved','lesson_withdrawn') THEN prior = resulting AND prior <> 'archived'
    WHEN event_name = 'revision_created' THEN prior IN ('intake','draft','internal_review') AND resulting = 'draft'
    WHEN event_name = 'revision_submitted_for_review' THEN prior = 'draft' AND resulting = 'internal_review'
    WHEN event_name = 'commercial_approved' THEN prior = 'internal_review' AND resulting = 'commercial_approved'
    WHEN event_name = 'commercial_approval_revoked' THEN prior = 'commercial_approved' AND resulting = 'internal_review'
    WHEN event_name = 'publication_requested' THEN prior = resulting AND prior = 'commercial_approved'
    WHEN event_name = 'publication_succeeded' THEN prior = 'commercial_approved' AND resulting = 'published_verified'
    WHEN event_name IN ('publication_failed','publication_drift_detected') THEN prior = resulting
    WHEN event_name = 'customer_accepted' THEN prior = 'published_verified' AND resulting = 'customer_accepted'
    WHEN event_name = 'customer_acceptance_revoked_or_voided' THEN prior = resulting
    WHEN event_name = 'production_readiness_confirmed' THEN prior = 'customer_accepted' AND resulting = 'production_readiness_confirmed'
    WHEN event_name = 'operational_release_approved' THEN prior = 'production_readiness_confirmed' AND resulting = 'release_approved_pending_provisioning'
    WHEN event_name = 'operationally_released' THEN prior = 'release_approved_pending_provisioning' AND resulting = 'operationally_released'
    WHEN event_name = 'project_activated' THEN prior = 'operationally_released' AND resulting = 'active_project'
    WHEN event_name = 'release_blocked' THEN resulting = 'blocked'
    WHEN event_name = 'change_approved' THEN prior = resulting
    WHEN event_name = 'project_completed' THEN prior = 'active_project' AND resulting = 'completed'
    WHEN event_name = 'postmortem_started' THEN prior = 'completed' AND resulting = 'postmortem_review'
    WHEN event_name = 'postmortem_approved' THEN prior IN ('completed','postmortem_review') AND resulting = 'closed'
    WHEN event_name = 'workspace_created' THEN prior = 'intake' AND resulting = 'intake'
    WHEN event_name = 'workspace_archived' THEN prior <> 'archived' AND resulting = 'archived'
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.required_quote_capability(event_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE event_name
    WHEN 'workspace_created' THEN 'create_workspace'
    WHEN 'evidence_attached' THEN 'attach_evidence'
    WHEN 'proposal_created' THEN 'edit_draft'
    WHEN 'proposal_accepted' THEN 'edit_draft'
    WHEN 'proposal_rejected' THEN 'edit_draft'
    WHEN 'proposal_edited' THEN 'edit_draft'
    WHEN 'revision_created' THEN 'edit_draft'
    WHEN 'revision_submitted_for_review' THEN 'submit_review'
    WHEN 'commercial_approved' THEN 'approve_commercial'
    WHEN 'commercial_approval_revoked' THEN 'approve_commercial'
    WHEN 'publication_requested' THEN 'request_publication'
    WHEN 'publication_succeeded' THEN 'verify_publication'
    WHEN 'publication_failed' THEN 'verify_publication'
    WHEN 'publication_drift_detected' THEN 'verify_publication'
    WHEN 'customer_accepted' THEN 'record_manual_acceptance'
    WHEN 'customer_acceptance_revoked_or_voided' THEN 'record_manual_acceptance'
    WHEN 'production_readiness_confirmed' THEN 'confirm_readiness'
    WHEN 'operational_release_approved' THEN 'approve_release'
    WHEN 'operationally_released' THEN 'execute_release'
    WHEN 'release_blocked' THEN 'block_release'
    WHEN 'change_requested' THEN 'edit_draft'
    WHEN 'change_approved' THEN 'approve_change'
    WHEN 'work_package_corrected' THEN 'approve_change'
    WHEN 'labor_coding_corrected' THEN 'correct_labor_coding'
    WHEN 'project_activated' THEN 'execute_release'
    WHEN 'project_completed' THEN 'execute_release'
    WHEN 'postmortem_started' THEN 'approve_postmortem'
    WHEN 'postmortem_approved' THEN 'approve_postmortem'
    WHEN 'lesson_approved' THEN 'approve_lesson'
    WHEN 'lesson_withdrawn' THEN 'approve_lesson'
    WHEN 'workspace_archived' THEN 'archive_workspace'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.quote_actor_has_workspace_capability(
  p_workspace_id uuid,
  p_actor_email text,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quote_workspace_members member
    WHERE member.workspace_id = p_workspace_id
      AND member.user_id = auth.uid()
      AND member.email_normalized = lower(btrim(p_actor_email))
      AND member.removed_at IS NULL
      AND (
        (member.workspace_role = 'owner' AND p_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review','archive_workspace')) OR
        (member.workspace_role = 'editor' AND p_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review')) OR
        (member.workspace_role = 'reviewer' AND p_capability IN ('attach_evidence','submit_review','approve_change')) OR
        EXISTS (
          SELECT 1 FROM public.quote_user_capabilities capability
          WHERE capability.user_id = auth.uid()
            AND capability.email_normalized = lower(btrim(p_actor_email))
            AND capability.capability = p_capability
            AND capability.revoked_at IS NULL
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.record_ada_compatibility_event(
  p_workspace_id uuid,
  p_concept_id uuid,
  p_event_type text,
  p_actor_email text,
  p_actor_capability text,
  p_workspace_status text,
  p_payload_json jsonb,
  p_idempotency_key text
)
RETURNS public.ada_quote_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_actor text := lower(btrim(p_actor_email));
  required_capability text;
  existing_event public.ada_quote_events;
  created_event public.ada_quote_events;
  workspace_lifecycle text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL OR jsonb_typeof(coalesce(p_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'A compatibility event requires an idempotency key and object payload.' USING ERRCODE = '22023';
  END IF;
  IF public.jsonb_contains_sensitive_material(coalesce(p_payload_json, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Compatibility event payload contains credential-shaped material.' USING ERRCODE = '22023';
  END IF;

  required_capability := CASE p_event_type
    WHEN 'asset_uploaded' THEN 'attach_evidence'
    WHEN 'drawing_initial_quote_created' THEN 'edit_draft'
    WHEN 'chat_turn_completed' THEN 'edit_draft'
    ELSE NULL
  END;
  IF required_capability IS NULL OR p_actor_capability <> required_capability OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, required_capability) THEN
    RAISE EXCEPTION 'Compatibility event capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF (p_event_type = 'asset_uploaded' AND p_workspace_status IS DISTINCT FROM 'gathering_inputs') OR
     (p_event_type = 'drawing_initial_quote_created' AND p_workspace_status IS DISTINCT FROM 'in_review') OR
     (p_event_type = 'chat_turn_completed' AND p_workspace_status IS NOT NULL AND p_workspace_status NOT IN ('gathering_inputs','in_review')) THEN
    RAISE EXCEPTION 'Compatibility event requested an invalid workspace status projection.' USING ERRCODE = '22023';
  END IF;
  IF p_concept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO existing_event FROM public.ada_quote_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id OR lower(existing_event.actor_email) <> normalized_actor THEN
      RAISE EXCEPTION 'Idempotency key belongs to another compatibility actor or workspace.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.ada_quote_events (
    workspace_id, concept_id, event_type, payload_json, actor_email, idempotency_key
  ) VALUES (
    p_workspace_id, p_concept_id, p_event_type, coalesce(p_payload_json, '{}'::jsonb), normalized_actor, p_idempotency_key
  ) RETURNING * INTO created_event;
  UPDATE public.ada_quote_workspaces
  SET status = CASE
        WHEN lifecycle_status IN ('intake', 'draft', 'internal_review') THEN coalesce(p_workspace_status, status)
        ELSE status
      END,
      last_activity_at = now()
  WHERE id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ada_quote_workspace_metadata(
  p_workspace_id uuid,
  p_actor_email text,
  p_title text,
  p_client_name text,
  p_contact_name text,
  p_ada_project_id uuid
)
RETURNS public.ada_quote_workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_workspace public.ada_quote_workspaces;
DECLARE normalized_actor text := lower(btrim(p_actor_email));
DECLARE workspace_lifecycle text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Workspace metadata capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Chat title is required.' USING ERRCODE = '22023';
  END IF;
  IF p_ada_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ada_quote_projects
    WHERE id = p_ada_project_id AND lower(btrim(created_by_email)) = normalized_actor
  ) THEN
    RAISE EXCEPTION 'Ada project assignment is not authorized.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ada_quote_workspaces
  SET title = btrim(p_title), client_name = p_client_name, contact_name = p_contact_name,
      ada_project_id = p_ada_project_id, last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO updated_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN updated_workspace;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_ada_quote_asset_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote evidence is retained; archive it instead.' USING ERRCODE = '55000';
  END IF;
  IF (NEW.archived_at, NEW.archived_by_email) IS DISTINCT FROM (OLD.archived_at, OLD.archived_by_email)
     AND (
       to_regprocedure('public.archive_ada_quote_asset(uuid,uuid,text,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.archive_ada_quote_asset(uuid,uuid,text,text)'::regprocedure))
     ) THEN
    RAISE EXCEPTION 'Quote evidence archive fields may change only through the archive service.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_ada_quote_asset_delete ON public.ada_quote_assets;
CREATE TRIGGER prevent_ada_quote_asset_delete
  BEFORE UPDATE OR DELETE ON public.ada_quote_assets
  FOR EACH ROW EXECUTE FUNCTION public.protect_ada_quote_asset_history();

CREATE OR REPLACE FUNCTION public.archive_ada_quote_asset(
  p_workspace_id uuid,
  p_asset_id uuid,
  p_actor_email text,
  p_idempotency_key text
)
RETURNS public.ada_quote_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE normalized_actor text := lower(btrim(p_actor_email));
DECLARE asset_row public.ada_quote_assets;
DECLARE workspace_lifecycle text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Evidence archive capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Evidence archive requires an idempotency key.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO asset_row FROM public.ada_quote_assets
  WHERE id = p_asset_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada asset not found for this workspace.' USING ERRCODE = 'P0002'; END IF;
  IF asset_row.archived_at IS NOT NULL THEN RETURN asset_row; END IF;
  UPDATE public.ada_quote_assets
  SET archived_at = now(), archived_by_email = normalized_actor
  WHERE id = p_asset_id RETURNING * INTO asset_row;
  INSERT INTO public.ada_quote_events (
    workspace_id, concept_id, event_type, payload_json, actor_email, idempotency_key
  ) VALUES (
    p_workspace_id, asset_row.concept_id, 'asset_archived',
    jsonb_build_object('asset_id', asset_row.id, 'original_name', asset_row.original_name),
    normalized_actor, p_idempotency_key
  );
  UPDATE public.ada_quote_workspaces SET last_activity_at = now() WHERE id = p_workspace_id;
  RETURN asset_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_archived_quote_workspace_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE old_workspace_id uuid;
DECLARE new_workspace_id uuid;
DECLARE old_revision_id uuid;
DECLARE new_revision_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_workspace_id := nullif(to_jsonb(OLD) ->> 'workspace_id', '')::uuid;
    old_revision_id := nullif(to_jsonb(OLD) ->> 'revision_id', '')::uuid;
    IF old_workspace_id IS NULL AND old_revision_id IS NOT NULL THEN
      SELECT workspace_id INTO old_workspace_id
      FROM public.ada_quote_revisions
      WHERE id = old_revision_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_workspace_id := nullif(to_jsonb(NEW) ->> 'workspace_id', '')::uuid;
    new_revision_id := nullif(to_jsonb(NEW) ->> 'revision_id', '')::uuid;
    IF new_workspace_id IS NULL AND new_revision_id IS NOT NULL THEN
      SELECT workspace_id INTO new_workspace_id
      FROM public.ada_quote_revisions
      WHERE id = new_revision_id;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id IN (old_workspace_id, new_workspace_id) AND lifecycle_status = 'archived'
  ) THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ada_chat_turn(
  p_workspace_id uuid,
  p_actor_email text,
  p_client_request_id uuid,
  p_request_content text
)
RETURNS TABLE(turn_id uuid, turn_status text, claimed boolean, response_json jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_turn public.ada_chat_turns;
  workspace_row public.ada_quote_workspaces;
  normalized_actor text := lower(btrim(p_actor_email));
  turn_found boolean;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO workspace_row FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO existing_turn
  FROM public.ada_chat_turns
  WHERE workspace_id = p_workspace_id
    AND actor_email = normalized_actor
    AND client_request_id = p_client_request_id
  FOR UPDATE;
  turn_found := FOUND;

  IF turn_found AND existing_turn.request_content <> p_request_content THEN
    RAISE EXCEPTION 'This request id belongs to different message content.' USING ERRCODE = '22023';
  END IF;
  IF turn_found AND existing_turn.status = 'completed' THEN
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json;
    RETURN;
  END IF;
  IF turn_found AND existing_turn.status = 'pending' AND existing_turn.claimed_at > now() - interval '15 minutes' THEN
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json;
    RETURN;
  END IF;
  IF workspace_row.lifecycle_status = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  IF NOT turn_found THEN
    INSERT INTO public.ada_chat_turns (
      workspace_id, client_request_id, actor_email, request_content
    ) VALUES (
      p_workspace_id, p_client_request_id, normalized_actor, p_request_content
    ) RETURNING * INTO existing_turn;
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
    RETURN;
  END IF;

  UPDATE public.ada_chat_turns
  SET status = 'pending', claimed_at = now(), error_message = NULL,
      response_json = NULL, completed_at = NULL
  WHERE id = existing_turn.id
  RETURNING * INTO existing_turn;
  RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quote_event_evidence(
  p_event_type text,
  p_revision_id uuid,
  p_reason text,
  p_evidence_refs jsonb,
  p_payload_json jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE revision_row public.ada_quote_revisions;
BEGIN
  IF jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' OR
     jsonb_typeof(coalesce(p_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Workflow evidence must use an evidence array and payload object.' USING ERRCODE = '22023';
  END IF;

  IF p_event_type IN (
    'revision_created','revision_submitted_for_review','commercial_approved','commercial_approval_revoked',
    'publication_requested','publication_succeeded','publication_failed','publication_drift_detected',
    'customer_accepted','customer_acceptance_revoked_or_voided','production_readiness_confirmed',
    'operational_release_approved','operationally_released','project_activated'
  ) AND p_revision_id IS NULL THEN
    RAISE EXCEPTION 'This workflow event requires an exact quote revision.' USING ERRCODE = 'P0001';
  END IF;

  IF p_revision_id IS NOT NULL THEN
    SELECT * INTO revision_row FROM public.ada_quote_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
  END IF;

  IF p_event_type IN (
    'commercial_approved','publication_requested','publication_succeeded','customer_accepted',
    'production_readiness_confirmed','operational_release_approved','operationally_released'
  ) AND (
    revision_row.normalization_status <> 'normalized' OR revision_row.manifest_hash IS NULL OR revision_row.locked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A stable normalized manifest is required for this workflow event.' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IN ('commercial_approved','operational_release_approved') AND
     (nullif(btrim(p_reason), '') IS NULL OR jsonb_array_length(p_evidence_refs) = 0) THEN
    RAISE EXCEPTION 'Approval reason and evidence are required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'publication_succeeded' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'readback_verified')::boolean, false) IS NOT TRUE OR
    p_payload_json ->> 'manifest_hash' IS DISTINCT FROM revision_row.manifest_hash
  ) THEN
    RAISE EXCEPTION 'Publication requires matching manifest read-back evidence.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'customer_accepted' AND jsonb_array_length(p_evidence_refs) = 0 THEN
    RAISE EXCEPTION 'Customer acceptance evidence is required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'production_readiness_confirmed' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'checklist_complete')::boolean, false) IS NOT TRUE OR
    coalesce((p_payload_json ->> 'no_blocking_exceptions')::boolean, false) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Completed readiness evidence with no blocking exceptions is required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'operationally_released' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'qbt_verified')::boolean, false) IS NOT TRUE OR
    NOT (
      coalesce((p_payload_json ->> 'bill_verified')::boolean, false) IS TRUE OR
      (coalesce((p_payload_json ->> 'bill_exception')::boolean, false) IS TRUE AND nullif(btrim(p_reason), '') IS NOT NULL)
    )
  ) THEN
    RAISE EXCEPTION 'Verified QBT and BILL evidence or a reasoned BILL exception is required.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_quote_workflow_event(
  p_workspace_id uuid,
  p_revision_id uuid,
  p_event_type text,
  p_actor_email text,
  p_actor_role text,
  p_actor_capability text,
  p_expected_row_version bigint,
  p_resulting_state text,
  p_reason text,
  p_evidence_refs jsonb,
  p_payload_json jsonb,
  p_idempotency_key text
)
RETURNS public.quote_workflow_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_row public.ada_quote_workspaces;
  existing_event public.quote_workflow_events;
  required_capability text;
  created_event public.quote_workflow_events;
  normalized_actor text := lower(btrim(p_actor_email));
  authenticated_actor text;
  resolved_actor_role text;
  revision_workspace_id uuid;
  capability_authorized boolean;
BEGIN
  authenticated_actor := public.current_quote_actor_email();
  IF authenticated_actor IS NULL OR authenticated_actor <> normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workspace_row FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT workspace_role INTO resolved_actor_role
  FROM public.quote_workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
    AND email_normalized = normalized_actor AND removed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_actor_role), '') IS NULL OR p_actor_role <> resolved_actor_role THEN
    RAISE EXCEPTION 'Recorded actor role does not match active workspace membership.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event FROM public.quote_workflow_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id OR existing_event.actor_email <> normalized_actor THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different workflow actor or workspace.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  IF workspace_row.row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;

  IF p_revision_id IS NOT NULL THEN
    SELECT workspace_id INTO revision_workspace_id FROM public.ada_quote_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
    IF revision_workspace_id <> p_workspace_id THEN
      RAISE EXCEPTION 'Quote revision does not belong to this workspace.' USING ERRCODE = '23503';
    END IF;
  END IF;

  required_capability := public.required_quote_capability(p_event_type);
  IF required_capability IS NULL THEN
    RAISE EXCEPTION 'Workflow event has no governed capability mapping.' USING ERRCODE = '42501';
  END IF;
  capability_authorized := p_actor_capability = required_capability AND (
    (resolved_actor_role = 'owner' AND required_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review','archive_workspace')) OR
    (resolved_actor_role = 'editor' AND required_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review')) OR
    (resolved_actor_role = 'reviewer' AND required_capability IN ('attach_evidence','submit_review','approve_change')) OR
    EXISTS (
      SELECT 1 FROM public.quote_user_capabilities
      WHERE user_id = auth.uid() AND email_normalized = normalized_actor
        AND revoked_at IS NULL AND capability = required_capability
    )
  );
  IF p_actor_capability = 'break_glass' AND nullif(btrim(p_reason), '') IS NOT NULL THEN
    capability_authorized := EXISTS (
      SELECT 1 FROM public.quote_user_capabilities
      WHERE user_id = auth.uid() AND email_normalized = normalized_actor
        AND revoked_at IS NULL AND capability = 'break_glass'
    );
  END IF;
  IF NOT coalesce(capability_authorized, false) THEN
    RAISE EXCEPTION 'Recorded quote capability is not authorized for this event.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_quote_transition_allowed(workspace_row.lifecycle_status, p_resulting_state, p_event_type) THEN
    RAISE EXCEPTION 'Invalid quote lifecycle transition.' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IN ('publication_requested','publication_succeeded') AND workspace_row.commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Publication must use the exact commercially approved revision.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'customer_accepted' AND workspace_row.hubspot_published_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Acceptance must use the exact verified published revision.' USING ERRCODE = 'P0001';
  ELSIF p_event_type IN ('production_readiness_confirmed','operational_release_approved','operationally_released') AND workspace_row.customer_accepted_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Release gates must use the exact customer-accepted revision.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.validate_quote_event_evidence(
    p_event_type, p_revision_id, p_reason,
    coalesce(p_evidence_refs, '[]'::jsonb), coalesce(p_payload_json, '{}'::jsonb)
  );

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_workspace_id, p_revision_id, p_event_type, normalized_actor, p_actor_role, p_actor_capability,
    workspace_row.lifecycle_status, p_resulting_state, p_reason, coalesce(p_evidence_refs, '[]'::jsonb),
    coalesce(p_payload_json, '{}'::jsonb), p_idempotency_key
  ) RETURNING * INTO created_event;

  UPDATE public.ada_quote_workspaces
  SET lifecycle_status = p_resulting_state,
      status = CASE WHEN p_event_type = 'workspace_archived' THEN 'archived' ELSE status END,
      archived_at = CASE WHEN p_event_type = 'workspace_archived' THEN now() ELSE archived_at END,
      current_revision_id = CASE
        WHEN p_event_type IN ('revision_created','revision_submitted_for_review','commercial_approved') THEN p_revision_id
        ELSE current_revision_id
      END,
      commercial_approved_revision_id = CASE
        WHEN p_event_type = 'commercial_approved' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked') THEN NULL
        ELSE commercial_approved_revision_id
      END,
      hubspot_published_revision_id = CASE
        WHEN p_event_type = 'publication_succeeded' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected') THEN NULL
        ELSE hubspot_published_revision_id
      END,
      customer_accepted_revision_id = CASE
        WHEN p_event_type = 'customer_accepted' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected','customer_acceptance_revoked_or_voided') THEN NULL
        ELSE customer_accepted_revision_id
      END,
      operationally_released_revision_id = CASE
        WHEN p_event_type = 'operationally_released' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected','customer_acceptance_revoked_or_voided') THEN NULL
        ELSE operationally_released_revision_id
      END,
      row_version = row_version + 1,
      last_activity_at = now()
  WHERE id = p_workspace_id;

  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_integration_outbox(p_lease_owner text, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.integration_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE claimed_id uuid;
BEGIN
  IF nullif(btrim(p_lease_owner), '') IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'A bounded lease owner and duration are required.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO claimed_id
  FROM public.integration_outbox
  WHERE attempt_count < max_attempts
    AND (
      (status IN ('pending','retryable_failed') AND coalesce(next_attempt_at, now()) <= now()) OR
      (status = 'processing' AND lease_expires_at < now())
    )
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF claimed_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    UPDATE public.integration_outbox
    SET status = 'processing', attempt_count = attempt_count + 1, lease_owner = p_lease_owner,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    WHERE id = claimed_id
    RETURNING *;
END;
$$;

ALTER TABLE public.quote_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_workflow_event_member_read ON public.quote_workflow_events;
CREATE POLICY quote_workflow_event_member_read ON public.quote_workflow_events
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_workflow_events FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.integration_outbox FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.append_quote_workflow_event(uuid, uuid, text, text, text, text, bigint, text, text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quote_actor_has_workspace_capability(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_ada_compatibility_event(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_ada_quote_workspace_metadata(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.archive_ada_quote_asset(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_integration_outbox(text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_quote_workflow_event(uuid, uuid, text, text, text, text, bigint, text, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ada_compatibility_event(uuid, uuid, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ada_quote_workspace_metadata(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_ada_quote_asset(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ada_chat_turn(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox(text, integer) TO service_role;
