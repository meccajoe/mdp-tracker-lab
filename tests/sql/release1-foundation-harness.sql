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
CREATE TABLE public.ada_quote_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  concept_id uuid REFERENCES public.ada_quote_concepts(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  analysis_status text NOT NULL DEFAULT 'uploaded',
  analysis_json jsonb,
  analysis_error text,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
  concept_id uuid REFERENCES public.ada_quote_concepts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_email text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ada_quote_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.ada_quote_concepts(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  structured_payload_json jsonb,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ada_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  actor_email text NOT NULL,
  request_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  user_message_id uuid REFERENCES public.ada_quote_messages(id) ON DELETE SET NULL,
  assistant_message_id uuid REFERENCES public.ada_quote_messages(id) ON DELETE SET NULL,
  revision_id uuid REFERENCES public.ada_quote_revisions(id) ON DELETE SET NULL,
  response_json jsonb,
  error_message text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, actor_email, client_request_id)
);
CREATE TABLE public.ada_quote_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL
);
CREATE TABLE public.ada_quote_sheet_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.ada_quote_sheets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE CASCADE
);
CREATE TABLE public.ada_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.ada_quote_workspaces(id) ON DELETE SET NULL,
  submitted_by_email text NOT NULL,
  category text NOT NULL,
  message text NOT NULL
);
ALTER TABLE public.ada_quote_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_assets ENABLE ROW LEVEL SECURITY;
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
\ir ../../supabase/migrations/20260910143000_quote_workspace_restore.sql
\ir ../../supabase/migrations/20260914173000_quote_publication_outbox.sql
\ir ../../supabase/migrations/20260915120000_quote_publication_outbox_hardening.sql

CREATE TEMP TABLE workspace_less_revision_child (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL,
  note text
);
CREATE TRIGGER protect_archived_workspace_less_revision_child
  BEFORE INSERT OR UPDATE OR DELETE ON workspace_less_revision_child
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();

SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT (public.create_quote_workspace('Atomic creation test', NULL, 'Client', 'Contact', NULL)).id AS created_workspace_id \gset
SELECT public.create_ada_quote_revision(
  '10000000-0000-0000-0000-000000000001', 'owner@example.com',
  '{"lineItems":[{"itemName":"Install labor","buildItem":"Install","clientPrice":1050,"internalCost":500,"lineType":"install","pricingBasis":"reviewed","evidenceRefs":[]}]}'::jsonb,
  500, 1050, 52.38, '[]'::jsonb, '[]'::jsonb
);
SELECT public.create_ada_quote_revision(
  :'created_workspace_id'::uuid, 'owner@example.com',
  '{"lineItems":[{"itemName":"Archive fixture","buildItem":"Fixture","clientPrice":100,"internalCost":50,"lineType":"fabrication","pricingBasis":"reviewed","evidenceRefs":[]}]}'::jsonb,
  50, 100, 50, '[]'::jsonb, '[]'::jsonb
);
RESET ROLE;

INSERT INTO workspace_less_revision_child (id, revision_id, note) VALUES
  ('29000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active workspace child');
INSERT INTO workspace_less_revision_child (id, revision_id, note)
SELECT '29000000-0000-0000-0000-000000000002', id, 'workspace to archive'
FROM public.ada_quote_revisions
WHERE workspace_id = (SELECT id FROM public.ada_quote_workspaces WHERE title = 'Atomic creation test')
ORDER BY revision_number DESC
LIMIT 1;

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
SELECT id AS archive_workspace_id, row_version AS archive_row_version
FROM public.ada_quote_workspaces WHERE title = 'Atomic creation test' \gset
SELECT set_config('test.archive_workspace_id', :'archive_workspace_id', false);
SET ROLE authenticated;
SELECT public.rename_quote_workspace(:'archive_workspace_id', 'owner@example.com', 'Atomic creation test renamed');
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = current_setting('test.archive_workspace_id')::uuid
      AND title = 'Atomic creation test renamed'
      AND client_name = 'Client'
      AND contact_name = 'Contact'
      AND ada_project_id IS NULL
  ) THEN RAISE EXCEPTION 'Title-only rename overwrote unrelated workspace metadata.'; END IF;
END $$;
SELECT row_version AS archive_row_version, status AS archive_previous_status
FROM public.ada_quote_workspaces WHERE id = :'archive_workspace_id' \gset
INSERT INTO public.quote_workspace_members (
  workspace_id, user_id, email_normalized, workspace_role, added_by
) VALUES (
  :'archive_workspace_id', '30000000-0000-0000-0000-000000000002',
  'outsider@example.com', 'editor', 'release-3-restore-test'
);
INSERT INTO public.quote_user_capabilities (
  user_id, email_normalized, capability, granted_by, grant_reason
) VALUES (
  '30000000-0000-0000-0000-000000000002', 'outsider@example.com',
  'archive_workspace', 'release-3-restore-test', 'Exercise current restore capability checks'
);
INSERT INTO public.ada_quote_assets (
  id, workspace_id, storage_path, original_name, mime_type, byte_size, analysis_status, created_by_email
) VALUES (
  '12000000-0000-0000-0000-000000000004', :'archive_workspace_id',
  'archived/reassignment-fixture.pdf', 'reassignment-fixture.pdf',
  'application/pdf', 10, 'uploaded', 'owner@example.com'
);
SET ROLE authenticated;
SELECT public.append_quote_workflow_event(
  :'archive_workspace_id',
  NULL,
  'workspace_archived',
  'owner@example.com',
  'owner',
  'archive_workspace',
  :'archive_row_version',
  'archived',
  'Operator archived workspace',
  '[]'::jsonb,
  jsonb_build_object('previous_status', :'archive_previous_status'),
  'test:workspace-archive:1'
);
RESET ROLE;
SELECT set_config(
  'test.archive_row_version',
  (SELECT row_version::text FROM public.ada_quote_workspaces WHERE id = :'archive_workspace_id'),
  false
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_workflow_events e
    JOIN public.ada_quote_workspaces w ON w.id = e.workspace_id
    WHERE w.title = 'Atomic creation test renamed' AND e.event_type = 'workspace_archived'
  ) THEN RAISE EXCEPTION 'Workspace archive omitted governed evidence.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE title = 'Atomic creation test renamed'
      AND lifecycle_status = 'archived' AND status = 'archived' AND archived_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Workspace archive did not project canonical and compatibility state.'; END IF;
  BEGIN
    UPDATE workspace_less_revision_child
    SET note = 'must fail after archive'
    WHERE id = '29000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'Workspace-less child mutation unexpectedly succeeded after archive.';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    UPDATE workspace_less_revision_child
    SET revision_id = '20000000-0000-0000-0000-000000000001'
    WHERE id = '29000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'Workspace-less child reassignment escaped archived source protection.';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  BEGIN
    UPDATE workspace_less_revision_child
    SET revision_id = (
      SELECT id FROM public.ada_quote_revisions
      WHERE workspace_id = current_setting('test.archive_workspace_id')::uuid
      ORDER BY revision_number DESC LIMIT 1
    )
    WHERE id = '29000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Workspace-less child reassignment escaped archived destination protection.';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END $$;

SELECT row_version AS restore_row_version
FROM public.ada_quote_workspaces WHERE id = :'archive_workspace_id' \gset
SELECT set_config('request.jwt.claim.email', 'outsider@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT (public.restore_quote_workspace(
  :'archive_workspace_id', 'outsider@example.com', :'restore_row_version',
  'Operator restored workspace', 'test:workspace-restore:1'
)).event_id AS restored_event_id \gset
SELECT (public.restore_quote_workspace(
  :'archive_workspace_id', 'outsider@example.com', :'restore_row_version',
  'Operator restored workspace', 'test:workspace-restore:1'
)).event_id AS replayed_restore_event_id \gset
RESET ROLE;
SELECT set_config('test.restored_event_id', :'restored_event_id', false);
SELECT set_config('test.replayed_restore_event_id', :'replayed_restore_event_id', false);
SELECT set_config('test.restore_row_version', :'restore_row_version', false);
DO $$ BEGIN
  IF current_setting('test.restored_event_id') <> current_setting('test.replayed_restore_event_id') THEN
    RAISE EXCEPTION 'Workspace restore replay did not return the original event.';
  END IF;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.archive_workspace_id')::uuid AND event_type = 'workspace_restored') <> 1 THEN
    RAISE EXCEPTION 'Workspace restore replay created duplicate evidence.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = current_setting('test.archive_workspace_id')::uuid
      AND lifecycle_status = 'draft' AND status = 'in_review' AND archived_at IS NULL
      AND row_version = current_setting('test.restore_row_version')::bigint + 1
  ) THEN RAISE EXCEPTION 'Workspace restore did not recover exact pre-archive state.'; END IF;
END $$;

UPDATE public.quote_user_capabilities
SET revoked_by = 'owner@example.com', revoked_at = now(), revoke_reason = 'Exercise replay authorization'
WHERE user_id = '30000000-0000-0000-0000-000000000002'
  AND capability = 'archive_workspace' AND revoked_at IS NULL;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.restore_quote_workspace(
      current_setting('test.archive_workspace_id')::uuid,
      'outsider@example.com', current_setting('test.restore_row_version')::bigint,
      'Operator restored workspace', 'test:workspace-restore:1'
    );
    RAISE EXCEPTION 'Revoked lifecycle capability replayed a restore result.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

SELECT row_version AS rearchive_row_version, status AS rearchive_previous_status
FROM public.ada_quote_workspaces WHERE id = :'archive_workspace_id' \gset
SET ROLE authenticated;
SELECT public.append_quote_workflow_event(
  :'archive_workspace_id', NULL, 'workspace_archived', 'owner@example.com', 'owner',
  'archive_workspace', :'rearchive_row_version', 'archived',
  'Operator archived workspace again', '[]'::jsonb,
  jsonb_build_object('previous_status', :'rearchive_previous_status'),
  'test:workspace-archive:2'
);
RESET ROLE;
SELECT set_config(
  'test.archive_row_version',
  (SELECT row_version::text FROM public.ada_quote_workspaces WHERE id = :'archive_workspace_id'),
  false
);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE workspace_id = current_setting('test.archive_workspace_id')::uuid AND event_type = 'workspace_archived') <> 2 THEN
    RAISE EXCEPTION 'Workspace could not be archived again after restore.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id = current_setting('test.archive_workspace_id')::uuid
      AND lifecycle_status = 'archived' AND status = 'archived' AND archived_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Re-archive did not restore archived projection state.'; END IF;
END $$;

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

CREATE TEMP TABLE approved_workspace_status_before AS
SELECT status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.record_ada_compatibility_event(
  '10000000-0000-0000-0000-000000000001', NULL, 'chat_turn_completed',
  'owner@example.com', 'edit_draft', 'gathering_inputs', '{}'::jsonb,
  'test:approved-workspace-compatibility:1'
);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001')
     IS DISTINCT FROM (SELECT status FROM approved_workspace_status_before) THEN
    RAISE EXCEPTION 'Compatibility event regressed status after canonical commercial approval.';
  END IF;
END $$;

INSERT INTO public.ada_quote_workspaces (id, workspace_number, title, created_by_email, status)
VALUES ('10000000-0000-0000-0000-000000000003', 'QW-GOVERNED-FIXTURE', 'Governed compatibility fixture', 'owner@example.com', 'draft');
INSERT INTO public.ada_quote_projects (id, created_by_email)
VALUES ('13000000-0000-0000-0000-000000000003', 'outsider@example.com');
INSERT INTO public.quote_workspace_members (workspace_id, user_id, email_normalized, workspace_role, added_by)
VALUES ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'owner@example.com', 'owner', 'release-1-test');
INSERT INTO public.ada_quote_concepts (id, workspace_id, label, mode, status, created_by_email)
VALUES ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Compatibility', 'standard', 'draft', 'owner@example.com');
INSERT INTO public.ada_quote_concepts (id, workspace_id, label, mode, status, created_by_email)
VALUES ('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Alternate concept', 'standard', 'draft', 'owner@example.com');
INSERT INTO public.ada_quote_assets (
  id, workspace_id, concept_id, storage_path, original_name,
  mime_type, byte_size, analysis_status, created_by_email
) VALUES (
  '12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003',
  '11000000-0000-0000-0000-000000000003', 'governed/fixture.pdf',
  'fixture.pdf', 'application/pdf', 10, 'uploaded', 'owner@example.com'
);

SET ROLE authenticated;
SELECT public.record_ada_compatibility_event(
  '10000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003',
  'asset_uploaded', 'owner@example.com', 'attach_evidence', 'gathering_inputs',
  '{"asset_id":"12000000-0000-0000-0000-000000000003"}'::jsonb,
  'test:compatibility-event:1'
);
SELECT public.record_ada_compatibility_event(
  '10000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003',
  'asset_uploaded', 'owner@example.com', 'attach_evidence', 'gathering_inputs',
  '{"asset_id":"12000000-0000-0000-0000-000000000003"}'::jsonb,
  'test:compatibility-event:1'
);
SELECT public.update_ada_quote_workspace_metadata(
  '10000000-0000-0000-0000-000000000003', 'owner@example.com',
  'Updated governed fixture', 'Client', 'Contact', NULL
);
DO $$ BEGIN
  BEGIN
    PERFORM public.update_ada_quote_workspace_metadata(
      '10000000-0000-0000-0000-000000000003', 'owner@example.com',
      'Cross-owner project', 'Client', 'Contact', '13000000-0000-0000-0000-000000000003'
    );
    RAISE EXCEPTION 'Metadata service attached another actor''s project.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT public.archive_ada_quote_asset(
  '10000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000003',
  'owner@example.com', 'test:asset-archive:1'
);
SELECT public.archive_ada_quote_asset(
  '10000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000003',
  'owner@example.com', 'test:asset-archive:1'
);
RESET ROLE;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.record_ada_compatibility_event(
      current_setting('test.archive_workspace_id')::uuid,
      NULL, 'chat_turn_completed', 'owner@example.com',
      'edit_draft', NULL, '{}'::jsonb, 'test:archived-compatibility:1'
    );
    RAISE EXCEPTION 'Archived workspace accepted a compatibility event.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    PERFORM public.update_ada_quote_workspace_metadata(
      current_setting('test.archive_workspace_id')::uuid,
      'owner@example.com', 'Mutated after archive', NULL, NULL, NULL
    );
    RAISE EXCEPTION 'Archived workspace accepted a metadata update.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    PERFORM public.append_quote_workflow_event(
      current_setting('test.archive_workspace_id')::uuid,
      NULL, 'evidence_attached', 'owner@example.com', 'owner',
      'attach_evidence',
      current_setting('test.archive_row_version')::bigint,
      'archived', NULL, '[]'::jsonb, '{}'::jsonb, 'test:archived-canonical-event:1'
    );
    RAISE EXCEPTION 'Archived workspace accepted a canonical no-op event.';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$ BEGIN
  IF (SELECT status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000003') <> 'gathering_inputs' THEN
    RAISE EXCEPTION 'Compatibility status was not projected from its immutable event.';
  END IF;
  IF (SELECT title FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000003') <> 'Updated governed fixture' THEN
    RAISE EXCEPTION 'Authenticated metadata service did not update the workspace.';
  END IF;
  IF (SELECT count(*) FROM public.ada_quote_events WHERE idempotency_key = 'test:compatibility-event:1') <> 1 THEN
    RAISE EXCEPTION 'Compatibility event idempotency key created duplicate evidence.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ada_quote_assets
    WHERE id = '12000000-0000-0000-0000-000000000003'
      AND archived_at IS NOT NULL
      AND archived_by_email = 'owner@example.com'
  ) THEN
    RAISE EXCEPTION 'Evidence archive did not preserve and mark the asset row.';
  END IF;
  IF (SELECT count(*) FROM public.ada_quote_events WHERE idempotency_key = 'test:asset-archive:1') <> 1 THEN
    RAISE EXCEPTION 'Evidence archive idempotency key created duplicate evidence.';
  END IF;
END $$;

GRANT SELECT ON public.ada_quote_revisions TO service_role;
GRANT SELECT, UPDATE ON public.quote_revision_line_work_packages TO service_role;
GRANT SELECT, UPDATE ON public.ada_quote_workspaces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ada_quote_assets TO service_role;
SET ROLE service_role;
SELECT set_config('app.quote_projection_writer', 'on', false);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.ada_quote_assets (
      workspace_id, storage_path, original_name, mime_type, byte_size, analysis_status, created_by_email
    ) VALUES (
      current_setting('test.archive_workspace_id')::uuid, 'archived/forbidden.pdf',
      'forbidden.pdf', 'application/pdf', 10, 'uploaded', 'owner@example.com'
    );
    RAISE EXCEPTION 'Service role inserted evidence after workspace archive.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    UPDATE public.ada_quote_assets
    SET workspace_id = '10000000-0000-0000-0000-000000000003'
    WHERE id = '12000000-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'Service role moved evidence out of an archived workspace.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    UPDATE public.ada_quote_workspaces SET lifecycle_status = 'closed' WHERE id = '10000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Service role forged the projection-writer setting.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.ada_quote_workspaces SET status = 'estimating' WHERE id = '10000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'Service role directly changed a compatibility status projection.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.ada_quote_assets WHERE id = '12000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'Service role physically deleted governed evidence.';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;
  BEGIN
    PERFORM public.record_ada_compatibility_event(
      '10000000-0000-0000-0000-000000000003', NULL, 'chat_turn_completed',
      'owner@example.com', 'edit_draft', NULL, '{}'::jsonb, 'test:service-role-compatibility:1'
    );
    RAISE EXCEPTION 'Service role executed the human compatibility RPC.';
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
  BEGIN
    PERFORM public.restore_quote_workspace(
      current_setting('test.archive_workspace_id')::uuid,
      'owner@example.com', current_setting('test.archive_row_version')::bigint,
      'forbidden service restore', 'test:service-role-restore:1'
    );
    RAISE EXCEPTION 'Service role executed the workspace restore RPC.';
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
\ir ../../supabase/migrations/20260910143000_quote_workspace_restore.sql
\ir ../../supabase/migrations/20260914173000_quote_publication_outbox.sql
\ir ../../supabase/migrations/20260915120000_quote_publication_outbox_hardening.sql

DO $$ BEGIN
  IF (SELECT count(*) FROM public.work_packages) <> 4 OR
     (SELECT count(*) FROM public.quote_revision_lines) <> 4 OR
     (SELECT count(*) FROM public.quote_revision_line_work_packages) <> 4 THEN
    RAISE EXCEPTION 'Rerun changed normalized row counts.';
  END IF;
  IF (SELECT lifecycle_status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') <> 'commercial_approved' THEN
    RAISE EXCEPTION 'Rerun overwrote progressed lifecycle state.';
  END IF;
END $$;

-- Release 4 publication outbox executable proof.
UPDATE public.ada_quote_workspaces SET hubspot_deal_id = 'deal-release4-001' WHERE id = '10000000-0000-0000-0000-000000000001';
INSERT INTO public.quote_user_capabilities (user_id, email_normalized, capability, granted_by, grant_reason)
VALUES ('30000000-0000-0000-0000-000000000001', 'owner@example.com', 'request_publication', 'release-4-test', 'Disposable publication proof')
ON CONFLICT DO NOTHING;
SELECT current_revision_id AS publication_revision_id, row_version AS publication_row_version FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001' \gset
SELECT set_config('test.publication_revision_id', :'publication_revision_id', false);
SELECT set_config('test.publication_row_version', :'publication_row_version', false);
SELECT set_config('request.jwt.claim.email', 'owner@example.com', false);
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'outsider@example.com', current_setting('test.publication_row_version')::bigint, '{"destination":"hubspot","operation":"publish_quote"}'::jsonb, repeat('a',64), 'r4:unauthorized');
    RAISE EXCEPTION 'wrong actor publication request succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT (public.request_quote_publication(
  '10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', current_setting('test.publication_row_version')::bigint,
  jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'payloadHash',repeat('a',64),'idempotencyKey','r4:publication:1'), repeat('a',64), 'r4:publication:1'
)).id AS publication_outbox_id \gset
RESET ROLE;
SELECT set_config('test.publication_outbox_id', :'publication_outbox_id', false);
SELECT row_version AS publication_replay_row_version
FROM public.ada_quote_workspaces
WHERE id = '10000000-0000-0000-0000-000000000001' \gset
SELECT set_config('test.publication_replay_row_version', :'publication_replay_row_version', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.integration_outbox WHERE id = current_setting('test.publication_outbox_id')::uuid AND status = 'pending' AND destination = 'hubspot' AND operation = 'publish_quote') <> 1 THEN RAISE EXCEPTION 'valid publication command was not pending'; END IF;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE idempotency_key LIKE 'quote-publication-request:%:r4:publication:1') <> 1 THEN RAISE EXCEPTION 'publication request evidence count is not one'; END IF;
END $$;
SET ROLE authenticated;
SELECT (public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', current_setting('test.publication_replay_row_version')::bigint,
  jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'payloadHash',repeat('a',64),'idempotencyKey','r4:publication:1'), repeat('a',64), 'r4:publication:1')).id AS replayed_publication_outbox_id \gset
RESET ROLE;
SELECT set_config('test.replayed_publication_outbox_id', :'replayed_publication_outbox_id', false);
DO $$ BEGIN
  IF current_setting('test.publication_outbox_id') <> current_setting('test.replayed_publication_outbox_id') THEN RAISE EXCEPTION 'publication retry changed outbox id'; END IF;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE idempotency_key LIKE 'quote-publication-request:%:r4:publication:1') <> 1 THEN RAISE EXCEPTION 'publication retry appended duplicate evidence'; END IF;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', current_setting('test.publication_replay_row_version')::bigint - 1,
      jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'payloadHash',repeat('a',64),'idempotencyKey','r4:publication:1'), repeat('a',64), 'r4:publication:1');
    RAISE EXCEPTION 'stale exact replay unexpectedly returned';
  EXCEPTION WHEN sqlstate 'PT409' THEN NULL;
  END;
END $$;
SET ROLE service_role;
SELECT id FROM public.claim_integration_outbox('release4-publication-worker', 30) WHERE id = current_setting('test.publication_outbox_id')::uuid \gset
DO $$ BEGIN
  BEGIN
    PERFORM public.record_quote_publication_readback(current_setting('test.publication_outbox_id')::uuid, 'wrong-worker', 'deal-release4-001', '{"id":"deal-release4-001"}'::jsonb, repeat('a',64));
    RAISE EXCEPTION 'wrong lease read-back succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT public.record_quote_publication_readback(current_setting('test.publication_outbox_id')::uuid, 'release4-publication-worker', 'deal-release4-001', '{"id":"deal-release4-001"}'::jsonb, repeat('a',64));
SELECT public.record_quote_publication_readback(current_setting('test.publication_outbox_id')::uuid, 'release4-publication-worker', 'deal-release4-001', '{"id":"deal-release4-001"}'::jsonb, repeat('a',64));
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.integration_outbox WHERE id = current_setting('test.publication_outbox_id')::uuid AND status = 'succeeded' AND reconciliation_status = 'verified' AND lease_owner IS NULL) <> 1 THEN RAISE EXCEPTION 'matching read-back did not verify'; END IF;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE event_type = 'publication_succeeded' AND payload_json ->> 'outbox_id' = current_setting('test.publication_outbox_id')) <> 1 THEN RAISE EXCEPTION 'matching reconciliation did not append exactly one success event'; END IF;
  IF (SELECT lifecycle_status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') <> 'published_verified' OR
     (SELECT hubspot_published_revision_id FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001')::text <> current_setting('test.publication_revision_id') THEN RAISE EXCEPTION 'matching reconciliation did not project exact published revision'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.integration_outbox (aggregate_type, aggregate_id, destination, operation, idempotency_key, revision_id, payload_json, payload_hash)
VALUES ('quote_workspace', '10000000-0000-0000-0000-000000000001', 'hubspot', 'publish_quote', 'r4:identity-mismatch', current_setting('test.publication_revision_id')::uuid,
  jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1'))), repeat('a',64))
RETURNING id AS identity_mismatch_outbox_id \gset
SELECT set_config('test.identity_mismatch_outbox_id', :'identity_mismatch_outbox_id', false);
SET ROLE service_role;
SELECT id FROM public.claim_integration_outbox('release4-identity-worker', 30) WHERE id = current_setting('test.identity_mismatch_outbox_id')::uuid \gset
SELECT public.record_quote_publication_readback(current_setting('test.identity_mismatch_outbox_id')::uuid, 'release4-identity-worker', 'different-deal', '{"id":"different-deal"}'::jsonb, repeat('a',64));
SELECT public.record_quote_publication_readback(current_setting('test.identity_mismatch_outbox_id')::uuid, 'release4-identity-worker', 'different-deal', '{"id":"different-deal"}'::jsonb, repeat('a',64));
RESET ROLE;
DO $$
BEGIN
  IF (SELECT reconciliation_status FROM public.integration_outbox WHERE id = current_setting('test.identity_mismatch_outbox_id')::uuid) <> 'drifted' OR
     (SELECT status FROM public.integration_outbox WHERE id = current_setting('test.identity_mismatch_outbox_id')::uuid) <> 'terminal_failed' THEN RAISE EXCEPTION 'deal identity mismatch with matching hash was verified'; END IF;
  IF (SELECT count(*) FROM public.quote_workflow_events WHERE event_type = 'publication_drift_detected' AND payload_json ->> 'outbox_id' = current_setting('test.identity_mismatch_outbox_id')) <> 1 THEN RAISE EXCEPTION 'identity mismatch did not append exactly one drift event'; END IF;
  IF (SELECT lifecycle_status FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') <> 'commercial_approved' OR
     (SELECT hubspot_published_revision_id FROM public.ada_quote_workspaces WHERE id = '10000000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'identity mismatch projected publication'; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.integration_outbox (aggregate_type, aggregate_id, destination, operation, idempotency_key, revision_id, payload_json, payload_hash, reconciliation_status)
    VALUES ('quote_workspace', '10000000-0000-0000-0000-000000000001', 'hubspot', 'publish_quote', 'r4:invalid-terminal', current_setting('test.publication_revision_id')::uuid, '{}', repeat('a',64), 'verified');
    RAISE EXCEPTION 'terminal evidence constraint unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE service_role;
UPDATE public.ada_quote_workspaces SET lifecycle_status = 'commercial_approved', hubspot_published_revision_id = NULL WHERE id = '10000000-0000-0000-0000-000000000001';
RESET ROLE;
INSERT INTO public.integration_outbox (aggregate_type, aggregate_id, destination, operation, idempotency_key, revision_id, payload_json, payload_hash)
VALUES ('quote_workspace', '10000000-0000-0000-0000-000000000001', 'hubspot', 'publish_quote', 'r4:mismatch', current_setting('test.publication_revision_id')::uuid,
  '{"destination":"hubspot","operation":"publish_quote","workspaceId":"10000000-0000-0000-0000-000000000001","revisionId":"mismatch","dealId":"deal-release4-001","currency":"USD","lines":[{"sku":"SKU-1"}]}'::jsonb, repeat('c',64))
RETURNING id AS mismatch_outbox_id \gset
SELECT set_config('test.mismatch_outbox_id', :'mismatch_outbox_id', false);
SET ROLE service_role;
SELECT id FROM public.claim_integration_outbox('release4-mismatch-worker', 30) WHERE id = current_setting('test.mismatch_outbox_id')::uuid \gset
SELECT public.record_quote_publication_readback(current_setting('test.mismatch_outbox_id')::uuid, 'release4-mismatch-worker', 'deal-release4-001', '{"id":"deal-release4-001"}'::jsonb, repeat('b',64));
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.integration_outbox WHERE id = current_setting('test.mismatch_outbox_id')::uuid AND status = 'terminal_failed' AND reconciliation_status = 'drifted' AND next_attempt_at IS NULL AND last_error_code = 'PUBLICATION_READBACK_HASH_MISMATCH' AND completed_at IS NULL) <> 1 THEN RAISE EXCEPTION 'mismatch fixture was not terminal drifted'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.record_quote_publication_readback(current_setting('test.mismatch_outbox_id')::uuid, 'release4-mismatch-worker', 'different-deal', '{"id":"different-deal"}'::jsonb, repeat('d',64));
    RAISE EXCEPTION 'conflicting evidence succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
DO $$ BEGIN
  BEGIN
    UPDATE public.integration_outbox SET payload_json = '{}'::jsonb;
    RAISE EXCEPTION 'direct service-role outbox mutation succeeded';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;
END $$;
RESET ROLE;
-- Release 4 Slice 2 specification regressions (RED before implementation).
SET ROLE authenticated;
DO $$
DECLARE cmd jsonb := jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'changed',true,'payloadHash',repeat('a',64),'idempotencyKey','r4:publication:1');
BEGIN
  BEGIN
    PERFORM public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', 1, cmd, repeat('a',64), 'r4:publication:1');
    RAISE EXCEPTION 'changed prepared command unexpectedly replayed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SET ROLE service_role;
UPDATE public.ada_quote_workspaces SET hubspot_deal_id = NULL WHERE id = '10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', 2,
      jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'payloadHash',repeat('a',64),'idempotencyKey','r4:publication:1'), repeat('a',64), 'r4:publication:1');
    RAISE EXCEPTION 'ineligible replay unexpectedly returned';
  EXCEPTION WHEN check_violation OR raise_exception THEN
    IF SQLERRM NOT LIKE 'Quote Workspace is not eligible%' THEN RAISE; END IF;
  END;
END $$;
SET ROLE service_role;
UPDATE public.ada_quote_workspaces SET hubspot_deal_id = 'deal-release4-001' WHERE id = '10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN PERFORM public.request_quote_publication(NULL, NULL, NULL, NULL, NULL, NULL, NULL); RAISE EXCEPTION 'NULL request inputs accepted'; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $$;
SET ROLE service_role;
DO $$
BEGIN
  BEGIN PERFORM public.record_quote_publication_readback(NULL, NULL, NULL, NULL, NULL); RAISE EXCEPTION 'NULL readback inputs accepted'; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $$;
SET ROLE authenticated;
DO $$
DECLARE stale_key text := 'r4:stale:' || gen_random_uuid()::text;
BEGIN
  BEGIN
    PERFORM public.request_quote_publication('10000000-0000-0000-0000-000000000001', current_setting('test.publication_revision_id')::uuid, 'owner@example.com', 1,
      jsonb_build_object('destination','hubspot','operation','publish_quote','workspaceId','10000000-0000-0000-0000-000000000001','revisionId',current_setting('test.publication_revision_id'),'dealId','deal-release4-001','currency','USD','lines',jsonb_build_array(jsonb_build_object('sku','SKU-1')),'payloadHash',repeat('a',64),'idempotencyKey',stale_key), repeat('a',64), stale_key);
    RAISE EXCEPTION 'stale row version unexpectedly accepted';
  EXCEPTION WHEN sqlstate 'PT409' THEN NULL;
  END;
END $$;
RESET ROLE;

-- The marker is intentionally the final successful statement.
SELECT 'release4_publication_outbox_sql_harness_ok' AS result;
