\set ON_ERROR_STOP on
-- Release 4 outbox immutability regression. The generic row must keep the
-- original seven-field guard while publication-only evidence remains scoped.
\ir release1-foundation-harness.sql
\ir ../../supabase/migrations/20260914173000_quote_publication_outbox.sql
\ir ../../supabase/migrations/20260914173000_quote_publication_outbox.sql
\ir ../../supabase/migrations/20260915120000_quote_publication_outbox_hardening.sql
\ir ../../supabase/migrations/20260915120000_quote_publication_outbox_hardening.sql

INSERT INTO public.integration_outbox (
  aggregate_type, aggregate_id, destination, operation, idempotency_key,
  payload_json, payload_hash
) VALUES (
  'generic_job', 'generic-aggregate', 'qbt', 'sync_job',
  'release4-generic-immutability', '{}'::jsonb, repeat('a', 64)
);

-- RED: a non-HubSpot publication-shaped command must not inherit the
-- HubSpot-only terminal evidence rule. Before the destination-scoped fix,
-- this pending row with ordinary evidence fails with check_violation.
INSERT INTO public.integration_outbox (
  aggregate_type, aggregate_id, destination, operation, idempotency_key,
  external_identity, external_readback_json, external_readback_hash,
  reconciliation_status, reconciled_at, payload_json, payload_hash
) VALUES (
  'quote_workspace', 'publication-qbt-aggregate', 'qbt', 'publish_quote',
  'release4-qbt-publication-evidence', 'qbt-external-1', '{"version":1}'::jsonb,
  repeat('b', 64), 'pending', NULL, '{}'::jsonb, repeat('a', 64)
);

UPDATE public.integration_outbox
SET external_identity = 'qbt-external-2',
    external_readback_json = '{"version":2}'::jsonb,
    external_readback_hash = repeat('c', 64),
    reconciliation_status = 'drifted',
    reconciled_at = now(),
    status = 'terminal_failed'
WHERE idempotency_key = 'release4-qbt-publication-evidence';

DO $$
BEGIN
  IF (SELECT external_identity FROM public.integration_outbox WHERE idempotency_key = 'release4-qbt-publication-evidence') <> 'qbt-external-2'
     OR (SELECT external_readback_json FROM public.integration_outbox WHERE idempotency_key = 'release4-qbt-publication-evidence') <> '{"version":2}'::jsonb THEN
    RAISE EXCEPTION 'non-HubSpot publication evidence was not generic and mutable';
  END IF;
END $$;

-- Publication-related columns are ordinary mutable worker state for a
-- non-publication command. This must remain valid under the general checks.
UPDATE public.integration_outbox
SET external_identity = 'external-1',
    external_readback_json = '{"version":1}'::jsonb,
    external_readback_hash = repeat('b', 64),
    reconciliation_status = 'verified',
    reconciled_at = now(),
    status = 'processing',
    last_error_code = 'TRANSIENT',
    last_error_message = 'temporary failure'
WHERE idempotency_key = 'release4-generic-immutability';

-- A later worker pass may replace evidence and move the generic command to a
-- different terminal/error state. The publication-only write-once rule must
-- not reject this second update.
UPDATE public.integration_outbox
SET external_identity = 'external-2',
    external_readback_json = '{"version":2}'::jsonb,
    external_readback_hash = repeat('c', 64),
    reconciliation_status = 'drifted',
    reconciled_at = now(),
    status = 'terminal_failed',
    completed_at = now(),
    last_error_code = 'FINAL_FAILURE',
    last_error_message = 'final failure'
WHERE idempotency_key = 'release4-generic-immutability';

DO $$
BEGIN
  IF (SELECT external_identity FROM public.integration_outbox WHERE idempotency_key = 'release4-generic-immutability') <> 'external-2'
     OR (SELECT external_readback_json FROM public.integration_outbox WHERE idempotency_key = 'release4-generic-immutability') <> '{"version":2}'::jsonb
     OR (SELECT external_readback_hash FROM public.integration_outbox WHERE idempotency_key = 'release4-generic-immutability') <> repeat('c', 64)
     OR (SELECT reconciliation_status FROM public.integration_outbox WHERE idempotency_key = 'release4-generic-immutability') <> 'drifted'
     OR (SELECT status FROM public.integration_outbox WHERE idempotency_key = 'release4-generic-immutability') <> 'terminal_failed' THEN
    RAISE EXCEPTION 'generic outbox publication-related fields did not remain worker-mutable';
  END IF;
END $$;

-- The original identity/payload fields remain immutable for generic rows.
DO $$
BEGIN
  BEGIN
    UPDATE public.integration_outbox
    SET payload_json = '{"changed":true}'::jsonb
    WHERE idempotency_key = 'release4-generic-immutability';
    RAISE EXCEPTION 'generic payload mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;

INSERT INTO public.integration_outbox (
  aggregate_type, aggregate_id, destination, operation, idempotency_key,
  payload_json, payload_hash
) VALUES (
  'quote_workspace', 'publication-aggregate', 'hubspot', 'publish_quote',
  'release4-publication-immutability', '{}'::jsonb, repeat('d', 64)
);
UPDATE public.integration_outbox
SET external_identity = 'publication-external-1',
    external_readback_json = '{"id":"publication-external-1"}'::jsonb,
    external_readback_hash = repeat('e', 64),
    reconciliation_status = 'verified',
    reconciled_at = now(),
    status = 'succeeded',
    completed_at = now()
WHERE idempotency_key = 'release4-publication-immutability';
DO $$
BEGIN
  BEGIN
    UPDATE public.integration_outbox
    SET external_identity = 'publication-external-2'
    WHERE idempotency_key = 'release4-publication-immutability';
    RAISE EXCEPTION 'publication external identity mutation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;

SELECT 'release4_outbox_immutability_harness_ok' AS marker;
