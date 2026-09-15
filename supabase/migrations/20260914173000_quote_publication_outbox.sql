-- Release 4 Slice 2: durable, governed quote publication evidence.

ALTER TABLE public.integration_outbox
  ADD COLUMN IF NOT EXISTS revision_id uuid,
  ADD COLUMN IF NOT EXISTS external_readback_json jsonb,
  ADD COLUMN IF NOT EXISTS external_readback_hash text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_outbox_revision_fk') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_revision_fk
      FOREIGN KEY (revision_id) REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_outbox_reconciliation_status_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_status_check
      CHECK (reconciliation_status IN ('pending','verified','drifted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_outbox_reconciliation_evidence_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_evidence_check
      CHECK ((reconciliation_status = 'pending' AND reconciled_at IS NULL) OR
             (reconciliation_status IN ('verified','drifted') AND reconciled_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_outbox_readback_hash_check') THEN
    ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_readback_hash_check
      CHECK (external_readback_hash IS NULL OR external_readback_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_integration_outbox_publication_revision
  ON public.integration_outbox (revision_id) WHERE revision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_integration_outbox_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.aggregate_type, NEW.aggregate_id, NEW.destination, NEW.operation, NEW.idempotency_key, NEW.payload_json, NEW.payload_hash, NEW.revision_id)
     IS DISTINCT FROM
     (OLD.aggregate_type, OLD.aggregate_id, OLD.destination, OLD.operation, OLD.idempotency_key, OLD.payload_json, OLD.payload_hash, OLD.revision_id) THEN
    RAISE EXCEPTION 'Integration outbox command identity and payload are immutable.' USING ERRCODE = '55000';
  END IF;
  IF OLD.external_identity IS NOT NULL AND NEW.external_identity IS DISTINCT FROM OLD.external_identity THEN
    RAISE EXCEPTION 'Integration outbox external identity is write-once.' USING ERRCODE = '55000';
  END IF;
  IF OLD.external_readback_json IS NOT NULL AND NEW.external_readback_json IS DISTINCT FROM OLD.external_readback_json THEN
    RAISE EXCEPTION 'Integration outbox read-back evidence is write-once.' USING ERRCODE = '55000';
  END IF;
  IF OLD.external_readback_hash IS NOT NULL AND NEW.external_readback_hash IS DISTINCT FROM OLD.external_readback_hash THEN
    RAISE EXCEPTION 'Integration outbox read-back hash is write-once.' USING ERRCODE = '55000';
  END IF;
  IF OLD.reconciliation_status <> 'pending' AND
     (NEW.reconciliation_status, NEW.reconciled_at, NEW.status, NEW.completed_at, NEW.last_error_code, NEW.last_error_message)
     IS DISTINCT FROM
     (OLD.reconciliation_status, OLD.reconciled_at, OLD.status, OLD.completed_at, OLD.last_error_code, OLD.last_error_message) THEN
    RAISE EXCEPTION 'Integration outbox reconciliation is immutable.' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_integration_outbox_identity ON public.integration_outbox;
CREATE TRIGGER protect_integration_outbox_identity
  BEFORE UPDATE ON public.integration_outbox
  FOR EACH ROW EXECUTE FUNCTION public.protect_integration_outbox_identity();

CREATE OR REPLACE FUNCTION public.request_quote_publication(
  p_workspace_id uuid,
  p_revision_id uuid,
  p_actor_email text,
  p_expected_row_version bigint,
  p_prepared_command jsonb,
  p_payload_hash text,
  p_idempotency_key text
)
RETURNS public.integration_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.ada_quote_workspaces; r public.ada_quote_revisions; existing public.integration_outbox; result public.integration_outbox;
DECLARE actor text := lower(btrim(p_actor_email)); actor_role text; event_key text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'request_publication') THEN
    RAISE EXCEPTION 'Publication request capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' OR
     jsonb_typeof(p_prepared_command) <> 'object' OR public.jsonb_contains_sensitive_material(p_prepared_command) THEN
    RAISE EXCEPTION 'Publication command is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO existing FROM public.integration_outbox WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.aggregate_type <> 'quote_workspace' OR existing.aggregate_id <> p_workspace_id::text OR
       existing.destination <> 'hubspot' OR existing.operation <> 'publish_quote' OR
       existing.revision_id IS DISTINCT FROM p_revision_id OR existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'Publication idempotency key conflicts with an existing command.' USING ERRCODE = '23505';
    END IF;
    RETURN existing;
  END IF;
  IF w.row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = '40001'; END IF;
  IF w.lifecycle_status <> 'commercial_approved' OR nullif(btrim(w.hubspot_deal_id), '') IS NULL OR w.commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Quote Workspace is not eligible for publication.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM public.ada_quote_revisions WHERE id = p_revision_id AND workspace_id = p_workspace_id;
  IF NOT FOUND OR r.normalization_status <> 'normalized' OR r.locked_at IS NULL OR nullif(btrim(r.source_manifest_hash), '') IS NULL THEN
    RAISE EXCEPTION 'Quote revision is not a stable normalized locked revision.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_prepared_command ->> 'destination') <> 'hubspot' OR (p_prepared_command ->> 'operation') <> 'publish_quote' OR
     (p_prepared_command ->> 'workspaceId') <> p_workspace_id::text OR (p_prepared_command ->> 'revisionId') <> p_revision_id::text OR
     (p_prepared_command ->> 'dealId') <> w.hubspot_deal_id OR (p_prepared_command ->> 'currency') <> 'USD' OR
     jsonb_typeof(p_prepared_command -> 'lines') <> 'array' OR jsonb_array_length(p_prepared_command -> 'lines') = 0 OR
     (p_prepared_command ->> 'payloadHash') <> p_payload_hash OR (p_prepared_command ->> 'idempotencyKey') <> p_idempotency_key THEN
    RAISE EXCEPTION 'Prepared publication command identity is invalid.' USING ERRCODE = '22023';
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
  p_outbox_id uuid,
  p_lease_owner text,
  p_external_identity text,
  p_readback_json jsonb,
  p_readback_sha256 text
)
RETURNS public.integration_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.integration_outbox; result public.integration_outbox; matches boolean;
BEGIN
  IF nullif(btrim(p_lease_owner), '') IS NULL OR nullif(btrim(p_external_identity), '') IS NULL OR
     p_readback_sha256 !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_readback_json) <> 'object' OR
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
  matches := row.payload_hash = p_readback_sha256;
  UPDATE public.integration_outbox SET
    external_identity = p_external_identity, external_readback_json = p_readback_json,
    external_readback_hash = p_readback_sha256, reconciliation_status = CASE WHEN matches THEN 'verified' ELSE 'drifted' END,
    reconciled_at = now(), status = CASE WHEN matches THEN 'succeeded' ELSE 'terminal_failed' END,
    lease_owner = NULL, lease_expires_at = NULL, completed_at = CASE WHEN matches THEN now() ELSE NULL END,
    next_attempt_at = NULL, last_error_code = CASE WHEN matches THEN NULL ELSE 'PUBLICATION_READBACK_HASH_MISMATCH' END,
    last_error_message = CASE WHEN matches THEN NULL ELSE 'Publication read-back hash did not match the prepared payload.' END
  WHERE id = p_outbox_id RETURNING * INTO result;
  RETURN result;
END;
$$;

ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integration_outbox FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_quote_publication(uuid, uuid, text, bigint, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_quote_publication_readback(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_quote_publication(uuid, uuid, text, bigint, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_quote_publication_readback(uuid, text, text, jsonb, text) TO service_role;
