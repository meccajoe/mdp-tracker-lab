\set ON_ERROR_STOP on

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'email', nullif(current_setting('request.jwt.claim.email', true), ''),
    'sub', nullif(current_setting('request.jwt.claim.sub', true), '')
  )
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.projects (id text PRIMARY KEY);
CREATE TABLE public.user_roles (email text PRIMARY KEY, ada_access boolean NOT NULL DEFAULT false);
CREATE TABLE public.ada_quote_projects (id uuid PRIMARY KEY, created_by_email text NOT NULL);
CREATE TABLE public.ada_quote_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ada_project_id uuid REFERENCES public.ada_quote_projects(id),
  title text NOT NULL,
  client_name text,
  contact_name text,
  hubspot_deal_id text,
  tracker_project_id text,
  created_by_email text NOT NULL,
  status text NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  accepted_revision_id uuid,
  accepted_at timestamptz
);
CREATE TABLE public.ada_quote_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id),
  label text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  created_by_email text NOT NULL
);
CREATE TABLE public.ada_quote_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  quote_json jsonb NOT NULL,
  internal_cost numeric NOT NULL DEFAULT 0,
  sell_price numeric NOT NULL DEFAULT 0,
  margin_pct numeric NOT NULL DEFAULT 0,
  assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, revision_number)
);
CREATE TABLE public.ada_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_email text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ada_quote_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_events ENABLE ROW LEVEL SECURITY;
GRANT UPDATE ON public.ada_quote_workspaces TO service_role;

INSERT INTO auth.users (id, email) VALUES
  ('30000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('30000000-0000-0000-0000-000000000002', 'outsider@example.com');
INSERT INTO public.user_roles (email, ada_access) VALUES
  ('owner@example.com', true), ('outsider@example.com', false);
INSERT INTO public.ada_quote_workspaces (id, title, created_by_email, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Valid legacy workspace', 'owner@example.com', 'draft'),
  ('10000000-0000-0000-0000-000000000002', 'Blocked legacy workspace', 'owner@example.com', 'accepted');
INSERT INTO public.ada_quote_revisions (id, workspace_id, revision_number, quote_json, internal_cost, sell_price, created_by_email) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1,
   '{"lineItems":[{"itemName":"Wall fabrication","buildItem":"Back Wall","clientPrice":5000,"internalCost":2500,"lineType":"fabrication","pricingBasis":"reviewed","evidenceRefs":[]},{"itemName":"Monitor rental","buildItem":"AV Package","clientPrice":1500,"internalCost":700,"lineType":"resale","pricingBasis":"reviewed","evidenceRefs":[]}]}'::jsonb,
   3200, 6500, 'owner@example.com'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 1,
   '{"lineItems":[{"itemName":"Unknown package","clientPrice":100,"internalCost":50,"lineType":"fabrication"}]}'::jsonb,
   50, 100, 'owner@example.com');

\ir ../../supabase/migrations/20260903100000_quote_to_production_foundation.sql
\ir ../../supabase/migrations/20260903101000_quote_workspace_memberships.sql
\ir ../../supabase/migrations/20260903102000_quote_workflow_events_and_outbox.sql
\ir ../../supabase/migrations/20260903103000_quote_normalized_backfill.sql

SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT (public.create_quote_workspace('Atomic creation test', NULL, 'Client', 'Contact', NULL)).id AS created_workspace_id \gset
SELECT public.create_ada_quote_revision(
  '10000000-0000-0000-0000-000000000001', 'owner@example.com',
  '{"lineItems":[{"itemName":"Install labor","buildItem":"Install","clientPrice":1050,"internalCost":500,"lineType":"install","pricingBasis":"reviewed","evidenceRefs":[]}]}'::jsonb,
  500, 1050, 52.38, '[]'::jsonb, '[]'::jsonb
);
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_workspace_members
    WHERE workspace_id = (SELECT id FROM public.ada_quote_workspaces WHERE title = 'Atomic creation test')
      AND email_normalized = 'owner@example.com'
      AND workspace_role = 'owner' AND removed_at IS NULL
  ) THEN RAISE EXCEPTION 'New workspace did not receive active owner membership.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_concepts
    WHERE workspace_id = (SELECT id FROM public.ada_quote_workspaces WHERE title = 'Atomic creation test')
      AND label = 'Workspace'
  ) THEN RAISE EXCEPTION 'Atomic workspace creation omitted compatibility concept.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_workflow_events
    WHERE workspace_id = (SELECT id FROM public.ada_quote_workspaces WHERE title = 'Atomic creation test')
      AND event_type = 'workspace_created'
  ) THEN RAISE EXCEPTION 'Atomic workspace creation omitted governed evidence.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_user_capabilities
    WHERE email_normalized = 'owner@example.com' AND capability = 'create_workspace' AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Legacy Ada access was not normalized to create_workspace capability.'; END IF;

  IF (SELECT normalization_status FROM public.ada_quote_revisions WHERE workspace_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision_number DESC LIMIT 1) <> 'normalized' OR
     (SELECT locked_at IS NULL FROM public.ada_quote_revisions WHERE workspace_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision_number DESC LIMIT 1) THEN
    RAISE EXCEPTION 'Legacy revision RPC did not atomically normalize and lock.';
  END IF;
  IF (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') IS DISTINCT FROM
     (SELECT id FROM public.ada_quote_revisions WHERE workspace_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision_number DESC LIMIT 1) THEN
    RAISE EXCEPTION 'Legacy revision RPC did not project the exact current revision.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_workflow_events
    WHERE workspace_id = '10000000-0000-0000-0000-000000000001' AND event_type = 'revision_created'
  ) THEN RAISE EXCEPTION 'Legacy revision RPC did not append governed evidence.'; END IF;
END $$;

SELECT set_config('request.jwt.claim.email', 'outsider@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_quote_workspace('Unauthorized creation test', NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'Workspace creation without create_workspace capability unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.ada_quote_workspaces WHERE title = 'Unauthorized creation test') THEN
    RAISE EXCEPTION 'Unauthorized workspace creation left a partial row.';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

SELECT id, normalization_status, normalization_exception
FROM public.ada_quote_revisions
ORDER BY id;
SELECT revision_id, exception_code, details_json
FROM public.quote_revision_normalization_exceptions
ORDER BY revision_id, created_at;

DO $$
DECLARE before_counts jsonb;
DECLARE after_counts jsonb;
BEGIN
  IF (SELECT normalization_status FROM public.ada_quote_revisions WHERE id = '20000000-0000-0000-0000-000000000001') <> 'normalized' THEN
    RAISE EXCEPTION 'Valid legacy revision did not normalize.';
  END IF;
  IF (SELECT locked_at IS NULL FROM public.ada_quote_revisions WHERE id = '20000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Normalized legacy revision was not locked.';
  END IF;
  IF (SELECT normalization_status FROM public.ada_quote_revisions WHERE id = '20000000-0000-0000-0000-000000000002') <> 'needs_review' THEN
    RAISE EXCEPTION 'Malformed legacy revision did not fail closed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quote_revision_normalization_exceptions WHERE revision_id = '20000000-0000-0000-0000-000000000002' AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'Malformed legacy revision has no review exception.';
  END IF;
  IF (SELECT array_agg(item_number ORDER BY item_number) FROM public.work_packages WHERE workspace_id = '10000000-0000-0000-0000-000000000001') <> ARRAY[1,2,3] THEN
    RAISE EXCEPTION 'Work-package numbering is not deterministic.';
  END IF;
  IF (SELECT count(*) FROM public.quote_revision_lines WHERE revision_id = '20000000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Commercial lines were not normalized.';
  END IF;
  IF (SELECT count(*) FROM public.quote_revision_line_work_packages WHERE revision_id = '20000000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Commercial line mappings were not normalized.';
  END IF;
  IF (SELECT lifecycle_status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000002') <> 'blocked' OR
     (SELECT lifecycle_status_reason FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000002') <> 'legacy_accepted_requires_governed_review' THEN
    RAISE EXCEPTION 'Legacy acceptance was silently reinterpreted.';
  END IF;

  SELECT jsonb_build_object(
    'packages', (SELECT count(*) FROM public.work_packages),
    'lines', (SELECT count(*) FROM public.quote_revision_lines),
    'mappings', (SELECT count(*) FROM public.quote_revision_line_work_packages),
    'exceptions', (SELECT count(*) FROM public.quote_revision_normalization_exceptions)
  ) INTO before_counts;
  PERFORM public.normalize_legacy_quote_revision('20000000-0000-0000-0000-000000000001');
  SELECT jsonb_build_object(
    'packages', (SELECT count(*) FROM public.work_packages),
    'lines', (SELECT count(*) FROM public.quote_revision_lines),
    'mappings', (SELECT count(*) FROM public.quote_revision_line_work_packages),
    'exceptions', (SELECT count(*) FROM public.quote_revision_normalization_exceptions)
  ) INTO after_counts;
  IF before_counts <> after_counts THEN RAISE EXCEPTION 'Normalization replay created duplicates.'; END IF;

  BEGIN
    UPDATE public.ada_quote_revisions SET quote_json = '{}'::jsonb WHERE id = '20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Locked revision update unexpectedly succeeded.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Governed workspace delete unexpectedly succeeded.';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL;
  END;
END $$;

INSERT INTO public.quote_user_capabilities (user_id, email_normalized, capability, granted_by, grant_reason)
VALUES ('30000000-0000-0000-0000-000000000001', 'owner@example.com', 'approve_commercial', 'release-1-test', 'Disposable integration test');

SELECT id AS latest_revision_id
FROM public.ada_quote_revisions
WHERE workspace_id = '10000000-0000-0000-0000-000000000001'
ORDER BY revision_number DESC LIMIT 1 \gset

SET ROLE authenticated;
SELECT public.accept_ada_quote_revision(
  '10000000-0000-0000-0000-000000000001',
  :'latest_revision_id'::uuid,
  'owner@example.com'
);
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = '10000000-0000-0000-0000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'Legacy approval wrapper did not append revision, review, and commercial approval evidence.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quote_workflow_events WHERE workspace_id = '10000000-0000-0000-0000-000000000001' AND event_type = 'customer_accepted') THEN
    RAISE EXCEPTION 'Legacy internal review was silently reinterpreted as customer acceptance.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = '10000000-0000-0000-0000-000000000001'
      AND (status = 'accepted' OR accepted_revision_id IS NOT NULL OR accepted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Legacy commercial approval wrote customer-acceptance-shaped workspace state.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ada_quote_events
    WHERE workspace_id = '10000000-0000-0000-0000-000000000001'
      AND event_type = 'quote_accepted'
  ) THEN
    RAISE EXCEPTION 'Legacy commercial approval wrote a quote_accepted compatibility event.';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
DO $$ BEGIN
  IF public.has_quote_workspace_access('10000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Matching email with the wrong authenticated user id gained workspace access.';
  END IF;
  BEGIN
    PERFORM public.accept_ada_quote_revision(
      '10000000-0000-0000-0000-000000000001',
      (SELECT current_revision_id FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001'),
      'owner@example.com'
    );
    RAISE EXCEPTION 'Matching email with the wrong authenticated user id used owner capability.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

DO $$ BEGIN
  BEGIN
    PERFORM public.append_quote_workflow_event(
      '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'commercial_approved',
      'owner@example.com', 'owner', 'approve_commercial',
      (SELECT row_version FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001'),
      'commercial_approved', 'Cross-workspace attempt', '[{"kind":"review"}]'::jsonb, '{}'::jsonb, 'test:cross-workspace:1'
    );
    RAISE EXCEPTION 'Cross-workspace revision injection unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.validate_quote_event_evidence(
      'operational_release_approved',
      (SELECT id FROM public.ada_quote_revisions WHERE workspace_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision_number DESC LIMIT 1),
      NULL, '[]'::jsonb, '{}'::jsonb
    );
    RAISE EXCEPTION 'Release approval without reason/evidence unexpectedly succeeded.';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;
  BEGIN
    UPDATE public.quote_workflow_events SET reason = 'changed';
    RAISE EXCEPTION 'Workflow history update unexpectedly succeeded.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.email', 'outsider@example.com', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_ada_quote_revision(
      '10000000-0000-0000-0000-000000000001', 'owner@example.com',
      '{"lineItems":[{"itemName":"Bad actor","buildItem":"Bad actor","clientPrice":1,"internalCost":1,"lineType":"fabrication"}]}'::jsonb,
      1, 1, 0, '[]'::jsonb, '[]'::jsonb
    );
    RAISE EXCEPTION 'JWT/actor mismatch unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);

GRANT SELECT ON public.ada_quote_revisions TO service_role;
GRANT SELECT, UPDATE ON public.quote_revision_line_work_packages TO service_role;
SET ROLE service_role;
SELECT set_config('app.quote_projection_writer', 'on', false);
DO $$ BEGIN
  BEGIN
    UPDATE public.ada_quote_workspaces SET lifecycle_status = 'closed' WHERE id = '10000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Service role forged the projection-writer setting.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.quote_revision_line_work_packages
    SET revision_id = '20000000-0000-0000-0000-000000000002'
    WHERE revision_id = '20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Locked child was reassigned away from a locked source revision.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    PERFORM public.append_quote_workflow_event(
      '10000000-0000-0000-0000-000000000001', NULL, 'evidence_attached',
      'owner@example.com', 'owner', 'attach_evidence', 5,
      'commercial_approved', NULL, '[]'::jsonb, '{}'::jsonb, 'test:service-role:1'
    );
    RAISE EXCEPTION 'Service role executed the human workflow RPC.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

INSERT INTO public.integration_outbox (
  aggregate_type, aggregate_id, destination, operation, idempotency_key, payload_json, payload_hash
) VALUES ('quote_revision', '20000000-0000-0000-0000-000000000001', 'hubspot', 'publish', 'test:hubspot:1', '{"quote_id":"test"}'::jsonb, 'hash');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.integration_outbox (
      aggregate_type, aggregate_id, destination, operation, idempotency_key, payload_json, payload_hash
    ) VALUES ('quote_revision', 'nested-secret', 'hubspot', 'publish', 'test:nested-secret:1', '{"metadata":{"access_token":"[REDACTED]"}}'::jsonb, 'hash');
    RAISE EXCEPTION 'Nested credential-shaped payload unexpectedly succeeded.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.integration_outbox (
      aggregate_type, aggregate_id, destination, operation, idempotency_key, external_identity, payload_json, payload_hash
    ) VALUES ('quote_revision', 'text-secret', 'hubspot', 'publish', 'test:text-secret:1', 'credential=[REDACTED]', '{"quote_id":"test"}'::jsonb, 'hash');
    RAISE EXCEPTION 'Credential-shaped external identity unexpectedly succeeded.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT id FROM public.claim_integration_outbox('release-1-test-worker', 30);
DO $$ BEGIN
  BEGIN
    UPDATE public.integration_outbox SET payload_json = '{"quote_id":"changed"}'::jsonb;
    RAISE EXCEPTION 'Outbox payload mutation unexpectedly succeeded.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
END $$;

-- Prove rerunnable DDL and idempotent backfill.
\ir ../../supabase/migrations/20260903100000_quote_to_production_foundation.sql
\ir ../../supabase/migrations/20260903101000_quote_workspace_memberships.sql
\ir ../../supabase/migrations/20260903102000_quote_workflow_events_and_outbox.sql
\ir ../../supabase/migrations/20260903103000_quote_normalized_backfill.sql

DO $$ BEGIN
  IF (SELECT count(*) FROM public.work_packages) <> 3 OR
     (SELECT count(*) FROM public.quote_revision_lines) <> 3 OR
     (SELECT count(*) FROM public.quote_revision_line_work_packages) <> 3 THEN
    RAISE EXCEPTION 'Rerun changed normalized row counts.';
  END IF;
  IF (SELECT lifecycle_status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') <> 'commercial_approved' THEN
    RAISE EXCEPTION 'Rerun overwrote progressed lifecycle state.';
  END IF;
END $$;

SELECT 'release1_sql_harness_ok' AS result;
