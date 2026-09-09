-- Keep chat-created proposals immediately disposable at their governed row version.
-- The proposal_created workflow event already updates workspace activity and row_version;
-- the matching compatibility event must not apply the same aggregate projection twice.

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
  is_atomic_proposal_chat_event boolean := false;
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

  IF p_event_type = 'chat_turn_completed' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ada_chat_turns AS turn
      JOIN public.ada_quote_messages AS user_message ON user_message.id = turn.user_message_id
      JOIN public.quote_proposals AS proposal
        ON proposal.workspace_id = turn.workspace_id
       AND proposal.creation_idempotency_key = 'ada-chat-turn:' || turn.id::text
      JOIN public.ada_quote_messages AS assistant_message
        ON assistant_message.workspace_id = turn.workspace_id
       AND assistant_message.id::text = p_payload_json ->> 'assistant_message_id'
      WHERE turn.workspace_id = p_workspace_id
        AND proposal.workspace_id = p_workspace_id
        AND user_message.workspace_id = p_workspace_id
        AND assistant_message.workspace_id = p_workspace_id
        AND turn.status = 'pending'
        AND lower(turn.actor_email) = normalized_actor
        AND lower(proposal.created_by_email) = normalized_actor
        AND lower(assistant_message.created_by_email) = normalized_actor
        AND assistant_message.role = 'assistant'
        AND turn.id::text = p_payload_json ->> 'turn_id'
        AND user_message.id::text = p_payload_json ->> 'user_message_id'
        AND proposal.id::text = p_payload_json ->> 'proposal_id'
        AND assistant_message.structured_payload_json -> 'proposal' ->> 'id' = proposal.id::text
    ) INTO is_atomic_proposal_chat_event;
  END IF;

  INSERT INTO public.ada_quote_events (
    workspace_id, concept_id, event_type, payload_json, actor_email, idempotency_key
  ) VALUES (
    p_workspace_id, p_concept_id, p_event_type, coalesce(p_payload_json, '{}'::jsonb), normalized_actor, p_idempotency_key
  ) RETURNING * INTO created_event;

  IF NOT is_atomic_proposal_chat_event THEN
    UPDATE public.ada_quote_workspaces
    SET status = CASE
          WHEN lifecycle_status IN ('intake', 'draft', 'internal_review') THEN coalesce(p_workspace_status, status)
          ELSE status
        END,
        last_activity_at = now()
    WHERE id = p_workspace_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  END IF;

  RETURN created_event;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ada_compatibility_event(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ada_compatibility_event(uuid, uuid, text, text, text, text, jsonb, text) TO authenticated;
