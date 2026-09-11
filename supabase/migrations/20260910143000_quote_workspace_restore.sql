-- Release 3: governed restoration for archived Quote Workspaces.

BEGIN;

ALTER TABLE public.quote_workflow_events
  DROP CONSTRAINT IF EXISTS quote_workflow_events_type_check;
ALTER TABLE public.quote_workflow_events
  ADD CONSTRAINT quote_workflow_events_type_check CHECK (event_type IN (
    'workspace_created','evidence_attached','proposal_created','proposal_accepted','proposal_rejected','proposal_edited',
    'revision_created','revision_submitted_for_review','commercial_approved','commercial_approval_revoked',
    'publication_requested','publication_succeeded','publication_failed','publication_drift_detected',
    'customer_accepted','customer_acceptance_revoked_or_voided','production_readiness_confirmed',
    'operational_release_approved','operationally_released','release_blocked','change_requested','change_approved',
    'work_package_corrected','labor_coding_corrected','project_activated','project_completed','postmortem_started',
    'postmortem_approved','lesson_approved','lesson_withdrawn','workspace_archived','workspace_restored'
  ));

CREATE OR REPLACE FUNCTION public.restore_quote_workspace(
  p_workspace_id uuid,
  p_actor_email text,
  p_expected_row_version bigint,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.quote_workflow_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_row public.ada_quote_workspaces;
  archive_event public.quote_workflow_events;
  existing_event public.quote_workflow_events;
  created_event public.quote_workflow_events;
  normalized_actor text := lower(btrim(p_actor_email));
  authenticated_actor text;
  resolved_actor_role text;
  restored_state text;
  restored_status text;
  capability_authorized boolean;
BEGIN
  authenticated_actor := public.current_quote_actor_email();
  IF authenticated_actor IS NULL OR authenticated_actor <> normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Restore reason and idempotency key are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO workspace_row
  FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT workspace_role INTO resolved_actor_role
  FROM public.quote_workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
    AND email_normalized = normalized_actor
    AND removed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501';
  END IF;

  capability_authorized := resolved_actor_role = 'owner' OR EXISTS (
    SELECT 1
    FROM public.quote_user_capabilities
    WHERE user_id = auth.uid()
      AND email_normalized = normalized_actor
      AND capability = 'archive_workspace'
      AND revoked_at IS NULL
  );
  IF NOT capability_authorized THEN
    RAISE EXCEPTION 'Archive workspace capability required for restore.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event
  FROM public.quote_workflow_events
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id
       OR existing_event.actor_email <> normalized_actor
       OR existing_event.event_type <> 'workspace_restored' THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different workflow action.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  IF workspace_row.lifecycle_status <> 'archived' THEN
    RAISE EXCEPTION 'Only archived Quote Workspaces can be restored.' USING ERRCODE = '55000';
  END IF;
  IF workspace_row.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO archive_event
  FROM public.quote_workflow_events
  WHERE workspace_id = p_workspace_id
    AND event_type = 'workspace_archived'
  ORDER BY occurred_at DESC, event_id DESC
  LIMIT 1;
  IF NOT FOUND OR archive_event.prior_state = 'archived' THEN
    RAISE EXCEPTION 'A valid prior archive event is required for restore.' USING ERRCODE = 'P0001';
  END IF;

  restored_state := archive_event.prior_state;
  restored_status := archive_event.payload_json ->> 'previous_status';
  IF restored_status IS NULL OR restored_status NOT IN ('draft','gathering_inputs','estimating','in_review','accepted','handed_off') THEN
    restored_status := CASE
      WHEN restored_state = 'intake' THEN 'draft'
      WHEN restored_state = 'draft' THEN 'draft'
      WHEN restored_state = 'internal_review' THEN 'in_review'
      WHEN restored_state IN ('commercial_approved','published_verified','customer_accepted') THEN 'accepted'
      ELSE 'handed_off'
    END;
  END IF;

  UPDATE public.ada_quote_workspaces
  SET lifecycle_status = restored_state,
      status = restored_status,
      archived_at = NULL,
      row_version = row_version + 1,
      last_activity_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_workspace_id, NULL, 'workspace_restored', normalized_actor, resolved_actor_role, 'archive_workspace',
    'archived', restored_state, btrim(p_reason), '[]'::jsonb,
    jsonb_build_object(
      'archive_event_id', archive_event.event_id,
      'restored_lifecycle_status', restored_state,
      'restored_status', restored_status
    ),
    btrim(p_idempotency_key)
  ) RETURNING * INTO created_event;

  RETURN created_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_quote_workspace(
  p_workspace_id uuid,
  p_actor_email text,
  p_title text
)
RETURNS public.ada_quote_workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_actor text := lower(btrim(p_actor_email));
  workspace_lifecycle text;
  updated_workspace public.ada_quote_workspaces;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor
     OR NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Workspace rename capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Quote title is required.' USING ERRCODE = '22023';
  END IF;

  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.ada_quote_workspaces
  SET title = btrim(p_title), last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO updated_workspace;
  RETURN updated_workspace;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_quote_workspace(uuid, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_quote_workspace(uuid, text, bigint, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.rename_quote_workspace(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_quote_workspace(uuid, text, text)
  TO authenticated;

COMMIT;
