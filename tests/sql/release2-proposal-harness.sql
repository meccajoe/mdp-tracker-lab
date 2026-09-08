\set ON_ERROR_STOP on
-- Release 2 disposable integration harness. Release 1 establishes the governed schema.
\ir release1-foundation-harness.sql
\ir ../../supabase/migrations/20260908152000_quote_proposals.sql
\ir ../../supabase/migrations/20260908152000_quote_proposals.sql

DO $$
DECLARE
  proposal_count integer;
BEGIN
  SELECT count(*) INTO proposal_count FROM public.quote_proposals;
  IF proposal_count <> 0 THEN RAISE EXCEPTION 'rerun changed empty proposal row count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_quote_proposal') THEN
    RAISE EXCEPTION 'Release 2 create RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reject_quote_proposal') THEN
    RAISE EXCEPTION 'Release 2 reject RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_quote_proposal') THEN
    RAISE EXCEPTION 'Release 2 accept RPC missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_quote_proposal'
      AND pg_get_functiondef(oid) ILIKE '%w.lifecycle_status NOT IN%intake%P0001%'
  ) THEN RAISE EXCEPTION 'Proposal lifecycle gate missing'; END IF;
END $$;

SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SELECT row_version AS proposal_create_version, current_revision_id AS proposal_source_revision, id AS proposal_workspace_id
FROM public.ada_quote_workspaces WHERE title = 'Updated governed fixture' \gset
SELECT set_config('test.proposal_workspace_id', :'proposal_workspace_id', false);
SELECT set_config('test.proposal_create_version', :'proposal_create_version', false);
SELECT count(*) AS initial_event_count FROM public.quote_workflow_events \gset
SELECT set_config('test.initial_event_count', :'initial_event_count', false);
SELECT count(*) AS proposal_before_revision_count FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT current_revision_id AS proposal_before_revision FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT set_config('test.proposal_before_revision_count', :'proposal_before_revision_count', false);
SELECT set_config('test.proposal_before_revision', '', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, 'owner@example.com', current_setting('test.proposal_create_version')::bigint, NULL,
      '{"lineItems":[{"itemName":"Credential probe","buildItem":"Package","clientPrice":1,"internalCost":1,"lineType":"fabrication","api_key":"[REDACTED]"}]}'::jsonb, '[]', '[]', 'release2-sensitive-probe');
    RAISE EXCEPTION 'credential-shaped proposal unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-sensitive-probe') <> 0 OR
     (SELECT count(*) FROM public.quote_workflow_events) <> current_setting('test.initial_event_count')::integer THEN
    RAISE EXCEPTION 'credential-shaped proposal leaked persistence';
  END IF;
END $$;
SELECT (public.create_quote_proposal(
  current_setting('test.proposal_workspace_id')::uuid, 'owner@example.com', current_setting('test.proposal_create_version')::bigint, NULL,
  '{"lineItems":[{"itemName":"Proposal reject line","buildItem":"Proposal package","clientPrice":300,"internalCost":100,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-create-reject'
)).id AS rejected_proposal_id \gset
SELECT (public.create_quote_proposal(
  current_setting('test.proposal_workspace_id')::uuid, 'owner@example.com', current_setting('test.proposal_create_version')::bigint, NULL,
  '{"lineItems":[{"itemName":"Proposal reject line","buildItem":"Proposal package","clientPrice":300,"internalCost":100,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-create-reject'
)).id AS retry_proposal_id \gset
RESET ROLE;
SELECT set_config('test.rejected_proposal_id', :'rejected_proposal_id', false);
SELECT set_config('test.retry_proposal_id', :'retry_proposal_id', false);
-- RED: direct proposal evidence must not be able to mutate the aggregate.
SELECT lifecycle_status AS forged_before_state FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT set_config('test.forged_before_state', :'forged_before_state', false);
SELECT row_version AS forged_before_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT count(*) AS forged_before_event_count FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT set_config('test.forged_before_version', :'forged_before_version', false);
SELECT set_config('test.forged_before_event_count', :'forged_before_event_count', false);
CREATE OR REPLACE FUNCTION public.test_proposal_state(p_workspace_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('events', (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = p_workspace_id), 'version', (SELECT row_version FROM public.ada_quote_workspaces WHERE id = p_workspace_id))
$$;
GRANT EXECUTE ON FUNCTION public.test_proposal_state(uuid) TO authenticated;
SET ROLE authenticated;
DO $$
DECLARE guard_rejected boolean := false; proposal_row public.quote_proposals;
BEGIN
  SELECT * INTO proposal_row FROM public.quote_proposals WHERE id = current_setting('test.rejected_proposal_id')::uuid;
  BEGIN
    PERFORM public.append_quote_workflow_event(current_setting('test.proposal_workspace_id')::uuid, proposal_row.source_revision_id, 'proposal_accepted', 'owner@example.com', 'owner', 'edit_draft', current_setting('test.forged_before_version')::bigint, current_setting('test.forged_before_state'), 'forged', proposal_row.proposed_evidence_json, jsonb_build_object('proposal_id', proposal_row.id, 'edited', false, 'accepted_hash', proposal_row.proposed_manifest_hash, 'workspace_row_version', current_setting('test.forged_before_version')::bigint + 1), 'proposal-accepted-alternate-key');
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    guard_rejected := true;
  END;
  IF guard_rejected THEN
    IF (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'events')::bigint <> current_setting('test.forged_before_event_count')::bigint OR (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'version')::bigint <> current_setting('test.forged_before_version')::bigint THEN
      RAISE EXCEPTION 'deferred guard rejected forgery but changed state';
    END IF;
  ELSE
    IF (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'events')::bigint <= current_setting('test.forged_before_event_count')::bigint OR (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'version')::bigint <= current_setting('test.forged_before_version')::bigint THEN
      RAISE EXCEPTION 'direct proposal_accepted did not produce the expected RED mutation';
    END IF;
    RAISE EXCEPTION 'RED: direct proposal_accepted forgery committed and changed event count/row_version';
  END IF;
END $$;
RESET ROLE;
-- Proposal RPC retries return the fingerprint-bound aggregate before append; the
-- legacy append retry behavior therefore has no proposal-path side effect.
DO $$
BEGIN
  IF current_setting('test.rejected_proposal_id') <> current_setting('test.retry_proposal_id') THEN
    RAISE EXCEPTION 'create retry returned a different proposal id';
  END IF;
  IF (SELECT count(*) FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-reject') <> 1 OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE payload_json ->> 'proposal_id' = current_setting('test.rejected_proposal_id') AND event_type = 'proposal_created') <> 1 THEN
    RAISE EXCEPTION 'repeated create did not remain one row and one proposal_created event';
  END IF;
  IF (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.proposal_before_revision_count')::integer OR
     (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) IS DISTINCT FROM nullif(current_setting('test.proposal_before_revision', true), '')::uuid THEN
    RAISE EXCEPTION 'create changed canonical revision state';
  END IF;
END $$;
SELECT row_version AS reject_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SET ROLE authenticated;
SELECT public.reject_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, :'rejected_proposal_id', 'owner@example.com', :'reject_version', 'not approved', 'release2-reject-1');
RESET ROLE;
SELECT row_version AS rejected_after_version, current_revision_id AS rejected_after_revision FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT count(*) AS rejected_after_event_count FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT count(*) AS rejected_after_revision_count FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SET ROLE authenticated;
SELECT (public.reject_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, :'rejected_proposal_id', 'owner@example.com', :'rejected_after_version', '  not approved  ', 'release2-reject-1')).id AS rejected_retry_id \gset
RESET ROLE;
SELECT set_config('test.rejected_retry_id', :'rejected_retry_id', false);
SELECT set_config('test.rejected_after_version', :'rejected_after_version', false);
SELECT set_config('test.rejected_after_revision', '', true);
SELECT set_config('test.rejected_after_event_count', :'rejected_after_event_count', false);
SELECT set_config('test.rejected_after_revision_count', :'rejected_after_revision_count', false);
DO $$
BEGIN
  IF current_setting('test.rejected_retry_id') <> current_setting('test.rejected_proposal_id') OR
     (SELECT reason FROM public.quote_proposals WHERE id = current_setting('test.rejected_proposal_id')::uuid) <> 'not approved' OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.rejected_after_event_count')::integer OR
     (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.rejected_after_revision_count')::integer OR
     (SELECT row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.rejected_after_version')::bigint OR
     (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) IS DISTINCT FROM nullif(current_setting('test.rejected_after_revision', true), '')::uuid THEN
    RAISE EXCEPTION 'rejection retry changed terminal state';
  END IF;
END $$;
SELECT row_version AS accept_create_version, current_revision_id AS accept_source_revision FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SET ROLE authenticated;
SELECT (public.create_quote_proposal(
  current_setting('test.proposal_workspace_id')::uuid, 'owner@example.com', :'accept_create_version', NULL,
  '{"lineItems":[{"itemName":"Proposal accept line","buildItem":"Proposal package","clientPrice":400,"internalCost":150,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-create-accept'
)).id AS accepted_proposal_id \gset
RESET ROLE;
SELECT set_config('test.accepted_proposal_id', :'accepted_proposal_id', false);
SELECT row_version AS accept_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SET ROLE authenticated;
SELECT public.accept_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, :'accepted_proposal_id', 'owner@example.com', :'accept_version', NULL, NULL, NULL, '  approved  ', 'release2-accept-1');
RESET ROLE;
SELECT lifecycle_status AS accepted_forged_state FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT set_config('test.accepted_forged_state', :'accepted_forged_state', false);
-- RED: an unedited accepted proposal must not accept a forged proposal_edited event.
SET ROLE authenticated;
DO $$
DECLARE
  proposal_row public.quote_proposals;
  before_events integer;
  before_version bigint;
  forged_rejected boolean := false;
BEGIN
  SELECT * INTO proposal_row FROM public.quote_proposals WHERE id = current_setting('test.accepted_proposal_id')::uuid;
  SELECT (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'events')::integer INTO before_events;
  SELECT (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'version')::bigint INTO before_version;
  BEGIN
    PERFORM public.append_quote_workflow_event(
      current_setting('test.proposal_workspace_id')::uuid, proposal_row.source_revision_id,
      'proposal_edited', 'owner@example.com', 'owner', 'edit_draft', before_version,
      current_setting('test.accepted_forged_state'),
      'forged', proposal_row.proposed_evidence_json,
      jsonb_build_object('proposal_id', proposal_row.id, 'source_revision_id', proposal_row.source_revision_id,
        'proposal_manifest_hash', proposal_row.proposed_manifest_hash, 'proposed_hash', proposal_row.proposed_manifest_hash,
        'accepted_hash', proposal_row.disposition_manifest_hash, 'edited', true,
        'workspace_row_version', before_version + 1),
      'proposal-edited:' || proposal_row.id::text);
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    forged_rejected := true;
  END;
  IF NOT forged_rejected THEN
    RAISE EXCEPTION 'RED: forged proposal_edited event committed';
  END IF;
  IF (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'events')::integer <> before_events
     OR (public.test_proposal_state(current_setting('test.proposal_workspace_id')::uuid) ->> 'version')::bigint <> before_version THEN
    RAISE EXCEPTION 'forged proposal_edited rejection changed state';
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT payload_json -> 'source_revision_id' FROM public.quote_workflow_events
      WHERE event_type = 'proposal_created' AND payload_json ->> 'proposal_id' = current_setting('test.accepted_proposal_id')) IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'baseline proposal_created source_revision_id must be JSON null';
  END IF;
END $$;
SET ROLE authenticated;
SELECT (public.create_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, 'owner@example.com', :'accept_create_version', NULL,
  '{"lineItems":[{"itemName":"Proposal accept line","buildItem":"Proposal package","clientPrice":400,"internalCost":150,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-create-accept')).id;
RESET ROLE;
SELECT row_version AS accepted_retry_version, current_revision_id AS accepted_retry_revision FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT count(*) AS accepted_retry_event_count FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT count(*) AS accepted_retry_revision_count FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid \gset
SELECT set_config('test.accepted_retry_event_count', :'accepted_retry_event_count', false);
SELECT set_config('test.accepted_retry_revision_count', :'accepted_retry_revision_count', false);
SELECT set_config('test.accepted_retry_version', :'accepted_retry_version', false);
SELECT set_config('test.accepted_retry_revision', :'accepted_retry_revision', false);
SET ROLE authenticated;
SELECT (public.accept_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, :'accepted_proposal_id', 'owner@example.com', :'accepted_retry_version', NULL, NULL, NULL, 'approved', 'release2-accept-1')).id AS accepted_retry_id \gset
SELECT set_config('test.accepted_retry_id', :'accepted_retry_id', false);
RESET ROLE;
DO $$
BEGIN
  IF current_setting('test.accepted_retry_id') <> current_setting('test.accepted_proposal_id') OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.accepted_retry_event_count')::integer OR
     (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.accepted_retry_revision_count')::integer OR
     (SELECT row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) <> current_setting('test.accepted_retry_version')::bigint OR
     (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) IS DISTINCT FROM current_setting('test.accepted_retry_revision')::uuid THEN
    RAISE EXCEPTION 'exact acceptance retry changed state';
  END IF;
END $$;
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, current_setting('test.accepted_proposal_id')::uuid, 'owner@example.com', current_setting('test.accepted_retry_version')::bigint,
      '{"lineItems":[{"itemName":"Conflicting","buildItem":"Conflicting","clientPrice":401,"internalCost":151,"lineType":"fabrication"}]}'::jsonb,
      '[]'::jsonb, '[]'::jsonb, 'approved', 'release2-accept-1');
    RAISE EXCEPTION 'conflicting disposition key unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_quote_proposal(current_setting('test.proposal_workspace_id')::uuid, current_setting('test.accepted_proposal_id')::uuid, 'owner@example.com', current_setting('test.accepted_retry_version')::bigint, NULL, NULL, NULL, 'approved', 'release2-accept-2');
    RAISE EXCEPTION 'second disposition key unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE accepted_revision uuid; proposal_status text; revision_events integer; rejection_events integer; creation_events integer;
BEGIN
  SELECT status, accepted_revision_id INTO proposal_status, accepted_revision
  FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-accept';
  IF proposal_status <> 'accepted' OR accepted_revision IS NULL THEN RAISE EXCEPTION 'accept did not persist terminal proposal and revision'; END IF;
  IF (SELECT reason FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-accept') IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'accept reason was not normalized'; END IF;
  SELECT count(*) INTO revision_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = (SELECT id::text FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-accept') AND e.event_type = 'revision_created';
  IF revision_events <> 1 THEN RAISE EXCEPTION 'accept did not append exactly one revision event'; END IF;
  SELECT count(*) INTO rejection_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = (SELECT id::text FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-reject') AND e.event_type = 'proposal_rejected';
  IF rejection_events <> 1 THEN RAISE EXCEPTION 'reject did not append exactly one rejection event'; END IF;
  SELECT count(*) INTO creation_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = (SELECT id::text FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-accept') AND e.event_type = 'proposal_created';
  IF creation_events <> 1 THEN RAISE EXCEPTION 'create retry duplicated proposal event'; END IF;
  IF (SELECT created_from FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 'ada_proposal' OR
     (SELECT normalization_status FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 'normalized' OR
     (SELECT locked_at IS NULL FROM public.ada_quote_revisions WHERE id = accepted_revision) THEN RAISE EXCEPTION 'accepted revision was not normalized and locked'; END IF;
END $$;

DO $$
DECLARE
  accepted_revision uuid;
  proposal_id uuid;
  proposal_status text;
  revision_events integer;
  rejection_events integer;
  creation_events integer;
  event_order text[];
  event_versions bigint[];
  source_hash text;
  normalized_hash text;
  before_revision_count integer;
  before_event_count integer;
  before_row_version bigint;
BEGIN
  SELECT id, status, accepted_revision_id INTO proposal_id, proposal_status, accepted_revision
  FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-accept';
  IF proposal_status <> 'accepted' OR accepted_revision IS NULL THEN RAISE EXCEPTION 'accept did not persist terminal proposal and revision'; END IF;
  SELECT count(*) INTO revision_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = proposal_id::text AND e.event_type = 'revision_created';
  SELECT count(*) INTO rejection_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = (SELECT id::text FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-create-reject') AND e.event_type = 'proposal_rejected';
  SELECT count(*) INTO creation_events FROM public.quote_workflow_events e
  WHERE e.payload_json ->> 'proposal_id' = proposal_id::text AND e.event_type = 'proposal_created';
  IF revision_events <> 1 OR rejection_events <> 1 OR creation_events <> 1 THEN RAISE EXCEPTION 'retry duplicated proposal event'; END IF;
  SELECT array_agg(e.event_type ORDER BY (e.payload_json ->> 'workspace_row_version')::bigint), array_agg((e.payload_json ->> 'workspace_row_version')::bigint ORDER BY (e.payload_json ->> 'workspace_row_version')::bigint)
    INTO event_order, event_versions
  FROM public.quote_workflow_events e WHERE e.payload_json ->> 'proposal_id' = proposal_id::text;
  IF event_order <> ARRAY['proposal_created','proposal_accepted','revision_created'] OR event_versions[2] <> event_versions[1] + 1 OR event_versions[3] <> event_versions[2] + 1 THEN
    RAISE EXCEPTION 'proposal event order/version payload is not deterministic: % / %', event_order, event_versions;
  END IF;
  SELECT source_manifest_hash, manifest_hash INTO source_hash, normalized_hash FROM public.ada_quote_revisions WHERE id = accepted_revision;
  IF source_hash IS DISTINCT FROM public.quote_manifest_sha256((SELECT quote_json FROM public.ada_quote_revisions WHERE id = accepted_revision)) THEN RAISE EXCEPTION 'normalizer source hash was repurposed'; END IF;
  IF source_hash = (SELECT disposition_manifest_hash FROM public.quote_proposals WHERE id = proposal_id) THEN RAISE EXCEPTION 'proposal combined hash leaked into source hash'; END IF;
  IF (SELECT created_from FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 'ada_proposal' OR
     (SELECT normalization_status FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 'normalized' OR
     (SELECT locked_at IS NULL FROM public.ada_quote_revisions WHERE id = accepted_revision) THEN RAISE EXCEPTION 'accepted revision was not normalized and locked'; END IF;
  IF (SELECT internal_cost FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 150 OR
     (SELECT sell_price FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 400 OR
     (SELECT margin_pct FROM public.ada_quote_revisions WHERE id = accepted_revision) <> 62.5 THEN RAISE EXCEPTION 'server-derived totals are wrong'; END IF;
  IF (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) IS DISTINCT FROM accepted_revision THEN RAISE EXCEPTION 'current pointer did not move to accepted revision'; END IF;
  SELECT row_version INTO before_row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid;
  SELECT count(*) INTO before_revision_count FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid;
  SELECT count(*) INTO before_event_count FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid;
  BEGIN
    UPDATE public.ada_quote_revisions SET quote_json = quote_json || '{"postLockMutation":true}'::jsonb WHERE id = accepted_revision;
    RAISE EXCEPTION 'locked quote content update unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> before_revision_count OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.proposal_workspace_id')::uuid) <> before_event_count OR
     (SELECT row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.proposal_workspace_id')::uuid) <> before_row_version THEN
    RAISE EXCEPTION 'post-lock mutation changed state';
  END IF;
END $$;

-- Fresh edited-acceptance workspace: complete edits persist, partial edits are atomic 22023.
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT (public.create_quote_workspace('Release 2 edited fixture', NULL, 'Client', 'Contact', NULL)).id AS edited_workspace_id \gset
SELECT set_config('test.edited_workspace_id', :'edited_workspace_id', false);
SELECT public.create_ada_quote_revision(:'edited_workspace_id'::uuid, 'owner@example.com',
  '{"lineItems":[{"itemName":"Source","buildItem":"Source package","clientPrice":450,"internalCost":180,"lineType":"fabrication","pricingBasis":"reviewed","evidenceRefs":[]}]}'::jsonb,
  180, 450, 60, '[]'::jsonb, '[]'::jsonb);
RESET ROLE;
SELECT row_version AS edited_create_version, current_revision_id AS edited_source_revision FROM public.ada_quote_workspaces WHERE id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.edited_source_revision', current_revision_id::text, false) FROM public.ada_quote_workspaces WHERE id = current_setting('test.edited_workspace_id')::uuid;
SET ROLE authenticated;
SELECT (public.create_quote_proposal(current_setting('test.edited_workspace_id')::uuid, 'owner@example.com', :'edited_create_version', current_setting('test.edited_source_revision')::uuid,
  '{"lineItems":[{"itemName":"Original","buildItem":"Original package","clientPrice":500,"internalCost":200,"lineType":"fabrication"}]}'::jsonb,
  '[{"assumption":"original"}]'::jsonb, '[{"source":"original"}]'::jsonb, 'release2-edited-create')).id AS edited_proposal_id \gset
SELECT set_config('test.edited_proposal_id', :'edited_proposal_id', false);
RESET ROLE;
SELECT row_version AS edited_partial_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.edited_partial_version', :'edited_partial_version', false);
SELECT count(*) AS edited_before_revision_count FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.edited_before_revision_count', :'edited_before_revision_count', false);
SELECT count(*) AS edited_before_event_count FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.edited_before_event_count', :'edited_before_event_count', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.accept_quote_proposal(current_setting('test.edited_workspace_id')::uuid, current_setting('test.edited_proposal_id')::uuid, 'owner@example.com', current_setting('test.edited_partial_version')::bigint,
      '{"lineItems":[{"itemName":"Edited","buildItem":"Edited package","clientPrice":800,"internalCost":300,"lineType":"fabrication"}]}'::jsonb, NULL, '[]'::jsonb, 'partial', 'release2-edited-partial');
    RAISE EXCEPTION 'partial edit unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.edited_workspace_id')::uuid) <> current_setting('test.edited_before_revision_count')::integer OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.edited_workspace_id')::uuid) <> current_setting('test.edited_before_event_count')::integer THEN RAISE EXCEPTION 'partial edit changed state'; END IF;
END $$;
SET ROLE authenticated;
SELECT public.accept_quote_proposal(current_setting('test.edited_workspace_id')::uuid, current_setting('test.edited_proposal_id')::uuid, 'owner@example.com', current_setting('test.edited_partial_version')::bigint,
  '{"lineItems":[{"itemName":"Edited","buildItem":"Edited package","clientPrice":800,"internalCost":300,"lineType":"fabrication"}]}'::jsonb,
  '[{"assumption":"edited"}]'::jsonb, '[{"source":"edited"}]'::jsonb, 'edited', 'release2-edited-accept');
RESET ROLE;
DO $$
DECLARE p public.quote_proposals; r public.ada_quote_revisions; event_order text[]; event_versions bigint[];
BEGIN
  SELECT * INTO p FROM public.quote_proposals WHERE id = current_setting('test.edited_proposal_id')::uuid;
  SELECT * INTO r FROM public.ada_quote_revisions WHERE id = p.accepted_revision_id;
  IF p.status <> 'accepted' OR p.edited_revision_json -> 'lineItems' -> 0 ->> 'itemName' <> 'Edited' OR p.proposed_revision_json -> 'lineItems' -> 0 ->> 'itemName' <> 'Original' THEN RAISE EXCEPTION 'edited/proposed snapshots are not separated'; END IF;
  IF r.quote_json -> 'lineItems' -> 0 ->> 'itemName' <> 'Edited' OR r.internal_cost <> 300 OR r.sell_price <> 800 OR r.margin_pct <> 62.5 THEN RAISE EXCEPTION 'edited canonical revision or totals wrong'; END IF;
  IF p.disposition_manifest_hash = p.proposed_manifest_hash THEN RAISE EXCEPTION 'edited accepted hash did not differ'; END IF;
  SELECT array_agg(e.event_type ORDER BY (e.payload_json ->> 'workspace_row_version')::bigint), array_agg((e.payload_json ->> 'workspace_row_version')::bigint ORDER BY (e.payload_json ->> 'workspace_row_version')::bigint) INTO event_order, event_versions
  FROM public.quote_workflow_events e WHERE e.payload_json ->> 'proposal_id' = p.id::text;
  IF event_order <> ARRAY['proposal_created','proposal_edited','proposal_accepted','revision_created'] OR event_versions[2] <> event_versions[1] + 1 OR event_versions[3] <> event_versions[2] + 1 OR event_versions[4] <> event_versions[3] + 1 THEN RAISE EXCEPTION 'edited event order/version wrong: % / %', event_order, event_versions; END IF;
END $$;

-- Stale creation and disposition are exact 40001 no-op transactions.
SELECT row_version AS stale_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.stale_version', :'stale_version', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.edited_workspace_id')::uuid, 'owner@example.com', current_setting('test.stale_version')::bigint - 1, NULL,
      '{"lineItems":[{"itemName":"Stale","buildItem":"Stale","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-stale-create');
    RAISE EXCEPTION 'stale create unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT count(*) AS stale_proposal_count FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-stale-create' \gset
SELECT set_config('test.stale_proposal_count', :'stale_proposal_count', false);
DO $$ BEGIN IF current_setting('test.stale_proposal_count')::integer <> 0 THEN RAISE EXCEPTION 'stale create leaked proposal'; END IF; END $$;
SELECT row_version AS current_edited_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.edited_workspace_id')::uuid \gset
SELECT set_config('test.current_edited_version', :'current_edited_version', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.edited_workspace_id')::uuid, 'owner@example.com', current_setting('test.current_edited_version')::bigint, NULL,
      '{"lineItems":[{"itemName":"Wrong source","buildItem":"Wrong source","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-current-wrong-source');
    RAISE EXCEPTION 'current-version wrong source unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.quote_proposals WHERE creation_idempotency_key = 'release2-current-wrong-source') <> 0 THEN RAISE EXCEPTION 'wrong source leaked proposal'; END IF; END $$;

-- Grants: helper and table writes are unavailable to all client roles; only governed RPCs execute for authenticated.
DO $$
DECLARE r record;
BEGIN
  IF has_function_privilege('service_role', 'public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text)', 'EXECUTE') OR
     has_function_privilege('service_role', 'public.reject_quote_proposal(uuid,uuid,text,bigint,text,text)', 'EXECUTE') OR
     has_function_privilege('service_role', 'public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text)', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.quote_proposal_validate_snapshot(jsonb,jsonb,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'proposal grant boundary is too broad'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text)', 'EXECUTE') OR
     NOT has_function_privilege('authenticated', 'public.reject_quote_proposal(uuid,uuid,text,bigint,text,text)', 'EXECUTE') OR
     NOT has_function_privilege('authenticated', 'public.accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated RPC grant missing'; END IF;
  IF has_table_privilege('authenticated', 'public.quote_proposals', 'INSERT,UPDATE,DELETE') OR has_table_privilege('service_role', 'public.quote_proposals', 'INSERT,UPDATE,DELETE') OR has_table_privilege('anon', 'public.quote_proposals', 'SELECT') THEN RAISE EXCEPTION 'proposal table grants are too broad'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN INSERT INTO public.quote_proposals(workspace_id, expected_row_version, proposed_revision_json, proposed_manifest_hash, created_by_email, creation_idempotency_key) VALUES (current_setting('test.edited_workspace_id')::uuid, 1, '{"lineItems":[]}', 'x', 'owner@example.com', 'direct-write'); RAISE EXCEPTION 'direct insert unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.quote_proposals SET reason = 'direct-write' WHERE id = current_setting('test.rejected_proposal_id')::uuid; RAISE EXCEPTION 'direct update unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.quote_proposals WHERE id = current_setting('test.rejected_proposal_id')::uuid; RAISE EXCEPTION 'direct delete unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN PERFORM public.create_quote_proposal(current_setting('test.edited_workspace_id')::uuid, 'owner@example.com', 1, NULL, '{"lineItems":[{"itemName":"x","buildItem":"x","clientPrice":1,"internalCost":1,"lineType":"x"}]}', '[]', '[]', 'service'); RAISE EXCEPTION 'service RPC unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Pending stale disposition is a 40001 transaction with no observable writes.
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT (public.create_quote_workspace('Release 2 stale disposition fixture', NULL, 'Client', 'Contact', NULL)).id AS stale_disposition_workspace_id \gset
RESET ROLE;
SELECT set_config('test.stale_disposition_workspace_id', :'stale_disposition_workspace_id', false);
SELECT row_version AS stale_disposition_create_version FROM public.ada_quote_workspaces WHERE id = :'stale_disposition_workspace_id' \gset
SET ROLE authenticated;
SELECT (public.create_quote_proposal(:'stale_disposition_workspace_id'::uuid, 'owner@example.com', :'stale_disposition_create_version', NULL,
  '{"lineItems":[{"itemName":"Stale disposition","buildItem":"Package","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-stale-disposition-create')).id AS stale_disposition_proposal_id \gset
RESET ROLE;
SELECT set_config('test.stale_disposition_proposal_id', :'stale_disposition_proposal_id', false);
SELECT row_version AS stale_disposition_version FROM public.ada_quote_workspaces WHERE id = :'stale_disposition_workspace_id' \gset
SELECT count(*) AS stale_disposition_event_count FROM public.quote_workflow_events WHERE workspace_id = :'stale_disposition_workspace_id' \gset
SELECT count(*) AS stale_disposition_revision_count FROM public.ada_quote_revisions WHERE workspace_id = :'stale_disposition_workspace_id' \gset
SELECT current_revision_id AS stale_disposition_revision FROM public.ada_quote_workspaces WHERE id = :'stale_disposition_workspace_id' \gset
SELECT set_config('test.stale_disposition_version', :'stale_disposition_version', false);
SELECT set_config('test.stale_disposition_event_count', :'stale_disposition_event_count', false);
SELECT set_config('test.stale_disposition_revision_count', :'stale_disposition_revision_count', false);
SELECT set_config('test.stale_disposition_revision', '', true);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reject_quote_proposal(current_setting('test.stale_disposition_workspace_id')::uuid, current_setting('test.stale_disposition_proposal_id')::uuid, 'owner@example.com', current_setting('test.stale_disposition_version')::bigint - 1, 'stale', 'release2-stale-disposition');
    RAISE EXCEPTION 'stale disposition unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.stale_disposition_workspace_id')::uuid) <> current_setting('test.stale_disposition_event_count')::integer OR
     (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.stale_disposition_workspace_id')::uuid) <> current_setting('test.stale_disposition_revision_count')::integer OR
     (SELECT row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.stale_disposition_workspace_id')::uuid) <> current_setting('test.stale_disposition_version')::bigint OR
     (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = current_setting('test.stale_disposition_workspace_id')::uuid) IS DISTINCT FROM nullif(current_setting('test.stale_disposition_revision', true), '')::uuid OR
     (SELECT count(*) FROM public.quote_proposals WHERE id = current_setting('test.stale_disposition_proposal_id')::uuid AND status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'stale disposition changed state';
  END IF;
END $$;

-- Membership and auth.uid are both required; failures are 42501 and preserve the pending row.
SELECT set_config('request.jwt.claim.email', 'outsider@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reject_quote_proposal(current_setting('test.stale_disposition_workspace_id')::uuid, current_setting('test.stale_disposition_proposal_id')::uuid, 'outsider@example.com', current_setting('test.stale_disposition_version')::bigint, 'outsider', 'release2-outsider-disposition');
    RAISE EXCEPTION 'outsider disposition unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.stale_disposition_workspace_id')::uuid, 'outsider@example.com', current_setting('test.stale_disposition_version')::bigint, NULL,
      '{"lineItems":[{"itemName":"Outsider","buildItem":"Package","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-outsider-create');
    RAISE EXCEPTION 'outsider create unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.stale_disposition_workspace_id')::uuid, 'owner@example.com', current_setting('test.stale_disposition_version')::bigint, NULL,
      '{"lineItems":[{"itemName":"Wrong UUID","buildItem":"Package","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-wrong-uuid');
    RAISE EXCEPTION 'same-email wrong auth uid unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

-- Archive is terminal, but an exact creation retry remains idempotent before the archive gate.
SET ROLE authenticated;
SELECT (public.create_quote_workspace('Release 2 archived proposal fixture', NULL, 'Client', 'Contact', NULL)).id AS archived_proposal_workspace_id \gset
RESET ROLE;
SELECT row_version AS archived_proposal_create_version FROM public.ada_quote_workspaces WHERE id = :'archived_proposal_workspace_id' \gset
SET ROLE authenticated;
SELECT (public.create_quote_proposal(:'archived_proposal_workspace_id'::uuid, 'owner@example.com', :'archived_proposal_create_version', NULL,
  '{"lineItems":[{"itemName":"Archived proposal","buildItem":"Package","clientPrice":20,"internalCost":10,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-archived-create')).id AS archived_proposal_id \gset
RESET ROLE;
SELECT row_version AS archived_row_version FROM public.ada_quote_workspaces WHERE id = :'archived_proposal_workspace_id' \gset
SET ROLE authenticated;
SELECT public.append_quote_workflow_event(:'archived_proposal_workspace_id'::uuid, NULL, 'workspace_archived', 'owner@example.com', 'owner', 'archive_workspace', :'archived_row_version', 'archived', 'Archived for Release 2', '[]'::jsonb, '{}'::jsonb, 'release2-archive-workspace');
RESET ROLE;
SELECT row_version AS archived_after_version FROM public.ada_quote_workspaces WHERE id = :'archived_proposal_workspace_id' \gset
SELECT count(*) AS archived_before_events FROM public.quote_workflow_events WHERE workspace_id = :'archived_proposal_workspace_id' \gset
SELECT count(*) AS archived_before_revisions FROM public.ada_quote_revisions WHERE workspace_id = :'archived_proposal_workspace_id' \gset
SELECT set_config('test.archived_proposal_id', :'archived_proposal_id', false);
SELECT set_config('test.archived_workspace_id', :'archived_proposal_workspace_id', false);
SELECT set_config('test.archived_create_version', :'archived_proposal_create_version', false);
SELECT set_config('test.archived_after_version', :'archived_after_version', false);
SELECT set_config('test.archived_before_events', :'archived_before_events', false);
SELECT set_config('test.archived_before_revisions', :'archived_before_revisions', false);
SET ROLE authenticated;
SELECT (public.create_quote_proposal(:'archived_proposal_workspace_id'::uuid, 'owner@example.com', :'archived_proposal_create_version', NULL,
  '{"lineItems":[{"itemName":"Archived proposal","buildItem":"Package","clientPrice":20,"internalCost":10,"lineType":"fabrication"}]}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'release2-archived-create')).id AS archived_retry_id \gset
SELECT set_config('test.archived_retry_id', :'archived_retry_id', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.reject_quote_proposal(current_setting('test.archived_workspace_id')::uuid, current_setting('test.archived_proposal_id')::uuid, 'owner@example.com', current_setting('test.archived_after_version')::bigint, 'archived', 'release2-archived-disposition');
    RAISE EXCEPTION 'archived disposition unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.create_quote_proposal(current_setting('test.archived_workspace_id')::uuid, 'owner@example.com', current_setting('test.archived_create_version')::bigint, NULL,
      '{"lineItems":[{"itemName":"New after archive","buildItem":"Package","clientPrice":20,"internalCost":10,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-archived-new');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '55000' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF current_setting('test.archived_retry_id') <> current_setting('test.archived_proposal_id') OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.archived_workspace_id')::uuid) <> current_setting('test.archived_before_events')::integer OR
     (SELECT count(*) FROM public.ada_quote_revisions WHERE workspace_id = current_setting('test.archived_workspace_id')::uuid) <> current_setting('test.archived_before_revisions')::integer OR
     (SELECT row_version FROM public.ada_quote_workspaces WHERE id = current_setting('test.archived_workspace_id')::uuid) <> current_setting('test.archived_after_version')::bigint THEN
    RAISE EXCEPTION 'archived exact retry changed state';
  END IF;
END $$;

-- Commercially approved/later lifecycle is rejected before source validation and leaves no row.
SELECT row_version AS lifecycle_version, current_revision_id AS lifecycle_source FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001' \gset
SELECT count(*) AS lifecycle_before_events FROM public.quote_workflow_events WHERE workspace_id = '10000000-0000-0000-0000-000000000001' \gset
SELECT count(*) AS lifecycle_before_proposals FROM public.quote_proposals \gset
SELECT set_config('test.lifecycle_version', :'lifecycle_version', false);
SELECT set_config('test.lifecycle_source', :'lifecycle_source', false);
SELECT set_config('test.lifecycle_before_events', :'lifecycle_before_events', false);
SELECT set_config('test.lifecycle_before_proposals', :'lifecycle_before_proposals', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.create_quote_proposal('10000000-0000-0000-0000-000000000001', 'owner@example.com', current_setting('test.lifecycle_version')::bigint, current_setting('test.lifecycle_source')::uuid,
      '{"lineItems":[{"itemName":"Lifecycle blocked","buildItem":"Package","clientPrice":10,"internalCost":5,"lineType":"fabrication"}]}'::jsonb, '[]', '[]', 'release2-lifecycle-blocked');
    RAISE EXCEPTION 'commercially approved proposal unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.quote_proposals) <> current_setting('test.lifecycle_before_proposals')::integer OR
     (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = '10000000-0000-0000-0000-000000000001') <> current_setting('test.lifecycle_before_events')::integer THEN
    RAISE EXCEPTION 'lifecycle rejection changed state';
  END IF;
END $$;

-- Terminal proposal rows remain immutable even to the table owner.
DO $$
BEGIN
  BEGIN UPDATE public.quote_proposals SET proposed_revision_json = proposed_revision_json || '{"mutated":true}'::jsonb WHERE id = current_setting('test.accepted_proposal_id')::uuid; RAISE EXCEPTION 'terminal proposal update succeeded'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN DELETE FROM public.quote_proposals WHERE id = current_setting('test.accepted_proposal_id')::uuid; RAISE EXCEPTION 'terminal proposal delete succeeded'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN UPDATE public.quote_proposals SET proposed_revision_json = proposed_revision_json || '{"mutated":true}'::jsonb WHERE id = current_setting('test.rejected_proposal_id')::uuid; RAISE EXCEPTION 'rejected proposal update succeeded'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN DELETE FROM public.quote_proposals WHERE id = current_setting('test.rejected_proposal_id')::uuid; RAISE EXCEPTION 'rejected proposal delete succeeded'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;

-- Every proposal-linked event rejects a forged payload when its event row is
-- otherwise valid: exercise each event type with the version fields removed.
-- The append-only trigger is disabled only around disposable fixture replacement;
-- the deferred proposal validator remains enabled for the forged insert.
ALTER TABLE public.quote_workflow_events DISABLE TRIGGER reject_quote_workflow_event_mutation;
DO $$
DECLARE
  target public.quote_workflow_events;
  forged_payload jsonb;
BEGIN
  FOR target IN
    SELECT e.*
    FROM public.quote_workflow_events e
    WHERE e.idempotency_key IN (
      'proposal-created:' || current_setting('test.rejected_proposal_id'),
      'proposal-rejected:' || current_setting('test.rejected_proposal_id'),
      'proposal-created:' || current_setting('test.accepted_proposal_id'),
      'proposal-edited:' || current_setting('test.edited_proposal_id'),
      'proposal-accepted:' || current_setting('test.edited_proposal_id'),
      'proposal-revision-created:' || current_setting('test.edited_proposal_id'),
      'proposal-accepted:' || current_setting('test.accepted_proposal_id'),
      'proposal-revision-created:' || current_setting('test.accepted_proposal_id')
    )
  LOOP
    DELETE FROM public.quote_workflow_events WHERE event_id = target.event_id;
    forged_payload := target.payload_json - ARRAY['expected_row_version', 'resulting_workspace_row_version'];
    BEGIN
      INSERT INTO public.quote_workflow_events (
        workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
        occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
      ) VALUES (
        target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
        target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
        target.reason, target.evidence_refs, forged_payload, target.idempotency_key
      );
      SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
      RAISE EXCEPTION 'RED: % accepted missing row-version provenance', target.event_type;
    EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
    END;
    INSERT INTO public.quote_workflow_events (
      workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
      occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
    ) VALUES (
      target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
      target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
      target.reason, target.evidence_refs, target.payload_json, target.idempotency_key
    );
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
  END LOOP;
END $$;
ALTER TABLE public.quote_workflow_events ENABLE TRIGGER reject_quote_workflow_event_mutation;

-- Focused provenance forgeries: only the append-only mutation trigger is disabled
-- while replacing fixtures; the deferred proposal validator stays enabled.
ALTER TABLE public.quote_workflow_events DISABLE TRIGGER reject_quote_workflow_event_mutation;
CREATE OR REPLACE FUNCTION public.test_forge_proposal_event(p_key text, p_mode text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target public.quote_workflow_events;
  forged_payload jsonb;
  forged_reason text;
  forged_rejected boolean := false;
BEGIN
  SELECT * INTO target FROM public.quote_workflow_events WHERE idempotency_key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'forge fixture missing: %', p_key; END IF;
  forged_payload := target.payload_json;
  forged_reason := target.reason || ' forged';
  IF p_mode = 'source' THEN
    forged_payload := jsonb_set(target.payload_json, '{source_revision_id}', to_jsonb('10000000-0000-0000-0000-000000000099'::text), true);
  ELSIF p_mode = 'edited' THEN
    forged_payload := jsonb_set(target.payload_json, '{edited}', to_jsonb(CASE WHEN target.payload_json ->> 'edited' = 'true' THEN 'false' ELSE 'true' END), true);
  END IF;
  DELETE FROM public.quote_workflow_events WHERE event_id = target.event_id;
  BEGIN
    INSERT INTO public.quote_workflow_events (
      workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
      occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
    ) VALUES (
      target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
      target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
      CASE WHEN p_mode = 'reason' THEN forged_reason ELSE target.reason END,
      target.evidence_refs, forged_payload, target.idempotency_key
    );
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    forged_rejected := true;
  END;
  IF NOT forged_rejected THEN
    DELETE FROM public.quote_workflow_events WHERE event_id = target.event_id;
    INSERT INTO public.quote_workflow_events (
      workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
      occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
    ) VALUES (target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
      target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
      target.reason, target.evidence_refs, target.payload_json, target.idempotency_key);
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
    RAISE EXCEPTION 'RED: forged % accepted for %', p_mode, target.event_type;
  END IF;
  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
    target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
    target.reason, target.evidence_refs, target.payload_json, target.idempotency_key);
  SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE idempotency_key = target.idempotency_key) <> 1
     OR (SELECT reason FROM public.quote_workflow_events WHERE idempotency_key = target.idempotency_key) IS DISTINCT FROM target.reason
     OR (SELECT payload_json FROM public.quote_workflow_events WHERE idempotency_key = target.idempotency_key) IS DISTINCT FROM target.payload_json THEN
    RAISE EXCEPTION 'forged % rejection did not restore original %', p_mode, target.event_type;
  END IF;
END $$;
SELECT public.test_forge_proposal_event('proposal-rejected:' || current_setting('test.rejected_proposal_id'), 'reason');
SELECT public.test_forge_proposal_event('proposal-accepted:' || current_setting('test.accepted_proposal_id'), 'reason');
SELECT public.test_forge_proposal_event('proposal-edited:' || current_setting('test.edited_proposal_id'), 'reason');
SELECT public.test_forge_proposal_event('proposal-revision-created:' || current_setting('test.edited_proposal_id'), 'reason');
SELECT public.test_forge_proposal_event('proposal-rejected:' || current_setting('test.rejected_proposal_id'), 'source');
SELECT public.test_forge_proposal_event('proposal-revision-created:' || current_setting('test.edited_proposal_id'), 'source');
SELECT public.test_forge_proposal_event('proposal-revision-created:' || current_setting('test.edited_proposal_id'), 'edited');
DROP FUNCTION public.test_forge_proposal_event(text, text);
ALTER TABLE public.quote_workflow_events ENABLE TRIGGER reject_quote_workflow_event_mutation;

-- Creation also rejects a non-null event revision when the proposal source is null.
ALTER TABLE public.quote_workflow_events DISABLE TRIGGER reject_quote_workflow_event_mutation;
DO $$
DECLARE target public.quote_workflow_events; accepted_revision uuid;
BEGIN
  SELECT accepted_revision_id INTO accepted_revision FROM public.quote_proposals
  WHERE id = current_setting('test.accepted_proposal_id')::uuid;
  SELECT * INTO target FROM public.quote_workflow_events
  WHERE idempotency_key = 'proposal-created:' || current_setting('test.accepted_proposal_id');
  DELETE FROM public.quote_workflow_events WHERE event_id = target.event_id;
  BEGIN
    INSERT INTO public.quote_workflow_events (
      workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
      occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
    ) VALUES (
      target.workspace_id, accepted_revision, target.event_type, target.actor_email, target.actor_role,
      target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
      target.reason, target.evidence_refs, target.payload_json, target.idempotency_key
    );
    SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
    RAISE EXCEPTION 'RED: proposal_created accepted mismatched revision lineage';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    occurred_at, prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    target.workspace_id, target.revision_id, target.event_type, target.actor_email, target.actor_role,
    target.actor_capability, target.occurred_at, target.prior_state, target.resulting_state,
    target.reason, target.evidence_refs, target.payload_json, target.idempotency_key
  );
  SET CONSTRAINTS validate_quote_proposal_workflow_event IMMEDIATE;
END $$;
ALTER TABLE public.quote_workflow_events ENABLE TRIGGER reject_quote_workflow_event_mutation;

-- Rerun after durable rows exist: IDs, statuses, hashes, and payload sequence remain unchanged.
CREATE TEMP TABLE release2_snapshot AS
SELECT p.id, p.status, p.proposed_manifest_hash, p.disposition_manifest_hash, p.accepted_revision_id,
       (SELECT count(*) FROM public.quote_proposals) AS proposal_count,
       (SELECT count(*) FROM public.ada_quote_revisions) AS revision_count,
       (SELECT count(*) FROM public.quote_workflow_events) AS event_count
FROM public.quote_proposals p
WHERE p.creation_idempotency_key = 'release2-create-accept';
\ir ../../supabase/migrations/20260908152000_quote_proposals.sql
DO $$
DECLARE s record; p record;
BEGIN
  SELECT * INTO s FROM release2_snapshot LIMIT 1;
  SELECT id, status, proposed_manifest_hash, disposition_manifest_hash, accepted_revision_id INTO p FROM public.quote_proposals WHERE id = s.id;
  IF p.id IS DISTINCT FROM s.id OR p.status IS DISTINCT FROM s.status OR p.proposed_manifest_hash IS DISTINCT FROM s.proposed_manifest_hash OR p.disposition_manifest_hash IS DISTINCT FROM s.disposition_manifest_hash OR p.accepted_revision_id IS DISTINCT FROM s.accepted_revision_id OR
     (SELECT count(*) FROM public.quote_proposals) <> s.proposal_count OR (SELECT count(*) FROM public.ada_quote_revisions) <> s.revision_count OR (SELECT count(*) FROM public.quote_workflow_events) <> s.event_count THEN RAISE EXCEPTION 'rerun changed durable proposal state'; END IF;
END $$;

SELECT 'release2_proposal_sql_harness_ok' AS marker;
