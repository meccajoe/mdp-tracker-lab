-- Release 1: workspace membership, capability data, and read-only RLS.
-- Exact Paul/Rooster identities are deliberately not guessed or seeded here.

CREATE TABLE IF NOT EXISTS public.quote_workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  email_normalized text NOT NULL,
  workspace_role text NOT NULL,
  added_by text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT quote_workspace_members_email_normalized_check CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''),
  CONSTRAINT quote_workspace_members_role_check CHECK (workspace_role IN ('owner','editor','reviewer','viewer'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_workspace_members_active_email
  ON public.quote_workspace_members (workspace_id, email_normalized)
  WHERE removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_workspace_members_active_user
  ON public.quote_workspace_members (workspace_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_workspace_members_email
  ON public.quote_workspace_members (email_normalized, workspace_id)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.quote_user_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  email_normalized text NOT NULL,
  capability text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reason text NOT NULL,
  revoked_by text,
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT quote_user_capabilities_email_check CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''),
  CONSTRAINT quote_user_capabilities_capability_check CHECK (capability IN (
    'create_workspace','edit_draft','submit_review','attach_evidence','approve_commercial',
    'request_publication','verify_publication','record_manual_acceptance','confirm_readiness',
    'approve_release','execute_release','approve_change','classify_operational_cause',
    'correct_labor_coding','approve_postmortem','approve_lesson','archive_workspace','block_release','break_glass'
  )),
  CONSTRAINT quote_user_capabilities_grant_reason_check CHECK (nullif(btrim(grant_reason), '') IS NOT NULL),
  CONSTRAINT quote_user_capabilities_revoke_check CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND nullif(btrim(revoked_by), '') IS NOT NULL AND nullif(btrim(revoke_reason), '') IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_user_capabilities_active_email
  ON public.quote_user_capabilities (email_normalized, capability)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_user_capabilities_active_user
  ON public.quote_user_capabilities (user_id, capability)
  WHERE revoked_at IS NULL AND user_id IS NOT NULL;

INSERT INTO public.quote_workspace_members (workspace_id, user_id, email_normalized, workspace_role, added_by)
SELECT w.id, u.id, lower(btrim(w.created_by_email)), 'owner', 'release-1-owner-backfill'
FROM public.ada_quote_workspaces w
LEFT JOIN auth.users u ON lower(u.email) = lower(btrim(w.created_by_email))
WHERE nullif(btrim(w.created_by_email), '') IS NOT NULL
ON CONFLICT (workspace_id, email_normalized) WHERE removed_at IS NULL DO NOTHING;

INSERT INTO public.quote_user_capabilities (user_id, email_normalized, capability, granted_by, grant_reason)
SELECT u.id, lower(btrim(r.email)), 'create_workspace', 'release-1-ada-access-backfill',
       'Preserve existing Ada workspace creation access under the normalized capability model'
FROM public.user_roles r
LEFT JOIN auth.users u ON lower(u.email) = lower(btrim(r.email))
WHERE r.ada_access = true AND nullif(btrim(r.email), '') IS NOT NULL
ON CONFLICT (email_normalized, capability) WHERE revoked_at IS NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_quote_actor_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''))
$$;

CREATE OR REPLACE FUNCTION public.has_quote_workspace_access(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quote_workspace_members m
    WHERE m.workspace_id = target_workspace_id
      AND m.user_id = auth.uid()
      AND m.email_normalized = public.current_quote_actor_email()
      AND m.removed_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.has_quote_workspace_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_quote_workspace_access(uuid) TO authenticated, service_role;

ALTER TABLE public.quote_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_user_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_workspace_member_read ON public.ada_quote_workspaces;
CREATE POLICY quote_workspace_member_read ON public.ada_quote_workspaces
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(id));

DROP POLICY IF EXISTS quote_workspace_members_self_read ON public.quote_workspace_members;
CREATE POLICY quote_workspace_members_self_read ON public.quote_workspace_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND email_normalized = public.current_quote_actor_email() AND removed_at IS NULL);

DROP POLICY IF EXISTS quote_user_capabilities_self_read ON public.quote_user_capabilities;
CREATE POLICY quote_user_capabilities_self_read ON public.quote_user_capabilities
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND email_normalized = public.current_quote_actor_email() AND revoked_at IS NULL);

DROP POLICY IF EXISTS quote_revision_member_read ON public.ada_quote_revisions;
CREATE POLICY quote_revision_member_read ON public.ada_quote_revisions
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

DROP POLICY IF EXISTS quote_event_member_read ON public.ada_quote_events;
CREATE POLICY quote_event_member_read ON public.ada_quote_events
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

DROP POLICY IF EXISTS quote_line_member_read ON public.quote_revision_lines;
CREATE POLICY quote_line_member_read ON public.quote_revision_lines
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

DROP POLICY IF EXISTS work_package_member_read ON public.work_packages;
CREATE POLICY work_package_member_read ON public.work_packages
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

DROP POLICY IF EXISTS revision_work_package_member_read ON public.quote_revision_work_packages;
CREATE POLICY revision_work_package_member_read ON public.quote_revision_work_packages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ada_quote_revisions r
    WHERE r.id = revision_id AND public.has_quote_workspace_access(r.workspace_id)
  ));

DROP POLICY IF EXISTS line_work_package_member_read ON public.quote_revision_line_work_packages;
CREATE POLICY line_work_package_member_read ON public.quote_revision_line_work_packages
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

DROP POLICY IF EXISTS work_type_authenticated_read ON public.work_types;
CREATE POLICY work_type_authenticated_read ON public.work_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS revision_labor_member_read ON public.quote_revision_work_package_labor;
CREATE POLICY revision_labor_member_read ON public.quote_revision_work_package_labor
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ada_quote_revisions r
    WHERE r.id = revision_id AND public.has_quote_workspace_access(r.workspace_id)
  ));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ada_quote_workspaces FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ada_quote_revisions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ada_quote_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_workspace_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_user_capabilities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_revision_lines FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_revision_work_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_revision_line_work_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_types FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_revision_work_package_labor FROM anon, authenticated;
