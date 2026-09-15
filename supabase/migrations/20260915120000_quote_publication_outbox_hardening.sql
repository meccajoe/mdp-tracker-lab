-- Release 4 Slice 2 correction: complete replay gates, evidence, and service reconciliation.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.integration_outbox'::regclass AND conname = 'integration_outbox_revision_fk') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_revision_fk FOREIGN KEY (revision_id) REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.integration_outbox'::regclass AND conname = 'integration_outbox_reconciliation_status_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_status_check CHECK (reconciliation_status IN ('pending','verified','drifted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.integration_outbox'::regclass AND conname = 'integration_outbox_reconciliation_evidence_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_evidence_check CHECK ((reconciliation_status = 'pending' AND reconciled_at IS NULL) OR (reconciliation_status IN ('verified','drifted') AND reconciled_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.integration_outbox'::regclass AND conname = 'integration_outbox_readback_hash_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_readback_hash_check CHECK (external_readback_hash IS NULL OR external_readback_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.integration_outbox'::regclass
      AND conname = 'integration_outbox_quote_publication_terminal_evidence_check'
  ) THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_quote_publication_terminal_evidence_check
      CHECK (
        NOT (aggregate_type = 'quote_workspace' AND operation = 'publish_quote') OR
        (reconciliation_status = 'pending' AND external_identity IS NULL AND external_readback_json IS NULL AND external_readback_hash IS NULL AND reconciled_at IS NULL) OR
        (reconciliation_status IN ('verified','drifted') AND nullif(btrim(external_identity), '') IS NOT NULL AND jsonb_typeof(external_readback_json) = 'object' AND external_readback_hash ~ '^[0-9a-f]{64}$' AND reconciled_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.quote_publication_reconciliation_event(
  p_outbox public.integration_outbox,
  p_revision public.ada_quote_revisions,
  p_matches boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_key text := 'quote-publication-reconciliation:' || p_outbox.id::text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_workflow_events WHERE idempotency_key = event_key) THEN
    RETURN;
  END IF;

  PERFORM public.validate_quote_event_evidence(
    CASE WHEN p_matches THEN 'publication_succeeded' ELSE 'publication_drift_detected' END,
    p_outbox.revision_id,
    CASE WHEN p_matches THEN 'Verified HubSpot publication read-back.' ELSE 'HubSpot publication read-back identity or hash drift detected.' END,
    jsonb_build_array(jsonb_build_object('type','integration_outbox','outbox_id',p_outbox.id::text)),
    jsonb_build_object(
      'outbox_id', p_outbox.id,
      'readback_verified', p_matches,
      'manifest_hash', p_revision.manifest_hash,
      'external_identity', p_outbox.external_identity
    )
  );

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_outbox.aggregate_id::uuid, p_outbox.revision_id,
    CASE WHEN p_matches THEN 'publication_succeeded' ELSE 'publication_drift_detected' END,
    'service_role@internal', 'service', 'verify_publication',
    'commercial_approved', CASE WHEN p_matches THEN 'published_verified' ELSE 'commercial_approved' END,
    CASE WHEN p_matches THEN 'Verified HubSpot publication read-back.' ELSE 'HubSpot publication read-back identity or hash drift detected.' END,
    jsonb_build_array(jsonb_build_object('type','integration_outbox','outbox_id',p_outbox.id::text)),
    jsonb_build_object('outbox_id',p_outbox.id, 'readback_verified',p_matches, 'manifest_hash',p_revision.manifest_hash, 'external_identity',p_outbox.external_identity),
    event_key
  );

  UPDATE public.ada_quote_workspaces
  SET lifecycle_status = CASE WHEN p_matches THEN 'published_verified' ELSE 'commercial_approved' END,
      hubspot_published_revision_id = CASE WHEN p_matches THEN p_outbox.revision_id ELSE NULL END,
      row_version = row_version + 1,
      last_activity_at = now()
  WHERE id = p_outbox.aggregate_id::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_quote_publication(
  p_workspace_id uuid, p_revision_id uuid, p_actor_email text, p_expected_row_version bigint,
  p_prepared_command jsonb, p_payload_hash text, p_idempotency_key text
)
RETURNS public.integration_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ada_quote_workspaces; r public.ada_quote_revisions; existing public.integration_outbox; result public.integration_outbox;
DECLARE actor text; actor_role text; event_key text;
BEGIN
  IF p_workspace_id IS NULL OR p_revision_id IS NULL OR p_actor_email IS NULL OR p_expected_row_version IS NULL OR
     p_prepared_command IS NULL OR p_payload_hash IS NULL OR p_idempotency_key IS NULL OR
     nullif(btrim(p_actor_email), '') IS NULL OR nullif(btrim(p_idempotency_key), '') IS NULL OR
     p_payload_hash IS DISTINCT FROM lower(p_payload_hash) OR p_payload_hash IS DISTINCT FROM btrim(p_payload_hash) OR
     p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_prepared_command) IS DISTINCT FROM 'object' OR
     public.jsonb_contains_sensitive_material(p_prepared_command) THEN
    RAISE EXCEPTION 'Publication command is invalid.' USING ERRCODE = '22023';
  END IF;
  actor := lower(btrim(p_actor_email));
  IF public.current_quote_actor_email() IS DISTINCT FROM actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'request_publication') THEN
    RAISE EXCEPTION 'Publication request capability is not authorized.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF w.lifecycle_status <> 'commercial_approved' OR nullif(btrim(w.hubspot_deal_id), '') IS NULL OR w.commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Quote Workspace is not eligible for publication.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM public.ada_quote_revisions WHERE id = p_revision_id AND workspace_id = p_workspace_id;
  IF NOT FOUND OR r.normalization_status <> 'normalized' OR r.locked_at IS NULL OR nullif(btrim(r.source_manifest_hash), '') IS NULL THEN
    RAISE EXCEPTION 'Quote revision is not a stable normalized locked revision.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_prepared_command ->> 'destination') IS DISTINCT FROM 'hubspot' OR
     (p_prepared_command ->> 'operation') IS DISTINCT FROM 'publish_quote' OR
     (p_prepared_command ->> 'workspaceId') IS DISTINCT FROM p_workspace_id::text OR
     (p_prepared_command ->> 'revisionId') IS DISTINCT FROM p_revision_id::text OR
     (p_prepared_command ->> 'dealId') IS DISTINCT FROM w.hubspot_deal_id OR
     (p_prepared_command ->> 'currency') IS DISTINCT FROM 'USD' OR
     jsonb_typeof(p_prepared_command -> 'lines') IS DISTINCT FROM 'array' OR
     coalesce(jsonb_array_length(p_prepared_command -> 'lines'), 0) = 0 OR
     (p_prepared_command ->> 'payloadHash') IS DISTINCT FROM p_payload_hash OR
     (p_prepared_command ->> 'idempotencyKey') IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'Prepared publication command identity is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing FROM public.integration_outbox WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.aggregate_type IS DISTINCT FROM 'quote_workspace' OR existing.aggregate_id IS DISTINCT FROM p_workspace_id::text OR
       existing.destination IS DISTINCT FROM 'hubspot' OR existing.operation IS DISTINCT FROM 'publish_quote' OR
       existing.revision_id IS DISTINCT FROM p_revision_id OR existing.payload_hash IS DISTINCT FROM p_payload_hash OR
       existing.payload_json IS DISTINCT FROM p_prepared_command THEN
      RAISE EXCEPTION 'Publication idempotency key conflicts with an existing command.' USING ERRCODE = '23505';
    END IF;
    RETURN existing;
  END IF;

  IF w.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409';
  END IF;
  SELECT workspace_role INTO actor_role FROM public.quote_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND removed_at IS NULL;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501'; END IF;
  event_key := 'quote-publication-request:' || p_workspace_id::text || ':' || p_revision_id::text || ':' || p_idempotency_key;
  INSERT INTO public.integration_outbox (
    aggregate_type, aggregate_id, destination, operation, idempotency_key, revision_id, payload_json, payload_hash, max_attempts
  ) VALUES ('quote_workspace', p_workspace_id::text, 'hubspot', 'publish_quote', p_idempotency_key, p_revision_id, p_prepared_command, p_payload_hash, 8)
  RETURNING * INTO result;
  PERFORM public.append_quote_workflow_event(
    p_workspace_id, p_revision_id, 'publication_requested', actor, actor_role, 'request_publication',
    p_expected_row_version, w.lifecycle_status, 'Quote publication requested', '[]'::jsonb,
    jsonb_build_object('outbox_id', result.id, 'idempotency_key', p_idempotency_key, 'payload_hash', p_payload_hash), event_key
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_quote_publication_readback(
  p_outbox_id uuid, p_lease_owner text, p_external_identity text, p_readback_json jsonb, p_readback_sha256 text
)
RETURNS public.integration_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.integration_outbox; result public.integration_outbox; revision_row public.ada_quote_revisions; matches boolean;
BEGIN
  IF p_outbox_id IS NULL OR p_lease_owner IS NULL OR p_external_identity IS NULL OR p_readback_json IS NULL OR p_readback_sha256 IS NULL OR
     nullif(btrim(p_lease_owner), '') IS NULL OR nullif(btrim(p_external_identity), '') IS NULL OR
     p_readback_sha256 IS DISTINCT FROM lower(p_readback_sha256) OR p_readback_sha256 IS DISTINCT FROM btrim(p_readback_sha256) OR
     p_readback_sha256 !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_readback_json) IS DISTINCT FROM 'object' OR
     public.jsonb_contains_sensitive_material(p_readback_json) THEN
    RAISE EXCEPTION 'Publication read-back is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO row FROM public.integration_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Integration outbox command not found.' USING ERRCODE = 'P0002'; END IF;
  IF row.destination <> 'hubspot' OR row.operation <> 'publish_quote' THEN RAISE EXCEPTION 'Outbox command is not a quote publication.' USING ERRCODE = '22023'; END IF;
  IF row.status IN ('succeeded','terminal_failed') AND row.external_readback_json IS NOT NULL THEN
    IF row.external_identity = p_external_identity AND row.external_readback_json = p_readback_json AND row.external_readback_hash = p_readback_sha256 THEN RETURN row; END IF;
    RAISE EXCEPTION 'Publication read-back evidence conflicts with completed evidence.' USING ERRCODE = '23505';
  END IF;
  IF row.status <> 'processing' OR row.lease_owner IS NULL OR row.lease_owner <> p_lease_owner THEN
    RAISE EXCEPTION 'Publication lease is not held by the supplied worker.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO revision_row FROM public.ada_quote_revisions WHERE id = row.revision_id;
  matches := (row.payload_json ->> 'dealId') IS NOT DISTINCT FROM p_external_identity AND row.payload_hash IS NOT DISTINCT FROM p_readback_sha256;
  UPDATE public.integration_outbox SET
    external_identity = p_external_identity, external_readback_json = p_readback_json, external_readback_hash = p_readback_sha256,
    reconciliation_status = CASE WHEN matches THEN 'verified' ELSE 'drifted' END, reconciled_at = now(),
    status = CASE WHEN matches THEN 'succeeded' ELSE 'terminal_failed' END, lease_owner = NULL, lease_expires_at = NULL,
    completed_at = CASE WHEN matches THEN now() ELSE NULL END, next_attempt_at = NULL,
    last_error_code = CASE WHEN matches THEN NULL WHEN (row.payload_json ->> 'dealId') IS DISTINCT FROM p_external_identity THEN 'PUBLICATION_READBACK_IDENTITY_MISMATCH' ELSE 'PUBLICATION_READBACK_HASH_MISMATCH' END,
    last_error_message = CASE WHEN matches THEN NULL ELSE 'Publication read-back did not match the prepared command identity or payload hash.' END
  WHERE id = p_outbox_id RETURNING * INTO result;
  PERFORM public.quote_publication_reconciliation_event(result, revision_row, matches);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.quote_publication_reconciliation_event(public.integration_outbox, public.ada_quote_revisions, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_quote_publication(uuid, uuid, text, bigint, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_quote_publication_readback(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_quote_publication(uuid, uuid, text, bigint, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_quote_publication_readback(uuid, text, text, jsonb, text) TO service_role;
