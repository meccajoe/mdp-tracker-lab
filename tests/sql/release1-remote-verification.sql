\set ON_ERROR_STOP on

DO $$
DECLARE cascade_count integer;
DECLARE missing_table_count integer;
DECLARE missing_trigger_count integer;
DECLARE unsafe_authenticated_execute_count integer;
BEGIN
  SELECT count(*) INTO missing_table_count
  FROM unnest(ARRAY[
    'quote_revision_lines','work_packages','quote_revision_work_packages','quote_revision_line_work_packages',
    'work_types','quote_revision_work_package_labor','quote_workspace_members','quote_user_capabilities',
    'quote_workflow_events','integration_outbox','quote_revision_normalization_exceptions'
  ]) AS expected(table_name)
  WHERE to_regclass('public.' || expected.table_name) IS NULL;
  IF missing_table_count <> 0 THEN RAISE EXCEPTION '% Release 1 tables are missing.', missing_table_count; END IF;

  SELECT count(*) INTO cascade_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid IN ('public.ada_quote_workspaces'::regclass, 'public.ada_quote_revisions'::regclass)
    AND confdeltype = 'c';
  IF cascade_count <> 0 THEN RAISE EXCEPTION '% governed-history foreign keys still cascade.', cascade_count; END IF;

  SELECT count(*) INTO missing_trigger_count
  FROM unnest(ARRAY[
    'protect_locked_quote_revision','protect_locked_quote_revision_child','reject_quote_workflow_event_mutation',
    'protect_integration_outbox_identity','protect_quote_workspace_projection'
  ]) AS expected(trigger_name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = expected.trigger_name AND NOT tgisinternal);
  IF missing_trigger_count <> 0 THEN RAISE EXCEPTION '% required Release 1 triggers are missing.', missing_trigger_count; END IF;

  SELECT count(*) INTO unsafe_authenticated_execute_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('append_quote_workflow_event','claim_integration_outbox','normalize_legacy_quote_revision')
    AND grantee IN ('PUBLIC','anon','authenticated')
    AND privilege_type = 'EXECUTE';
  IF unsafe_authenticated_execute_count <> 0 THEN RAISE EXCEPTION 'Privileged Release 1 functions are directly executable by browser roles.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ada_quote_revisions
    WHERE normalization_status = 'normalized'
      AND (source_manifest_hash IS NULL OR manifest_hash IS NULL OR normalized_at IS NULL OR locked_at IS NULL)
  ) THEN RAISE EXCEPTION 'A normalized revision is missing its immutable manifest evidence.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces w
    JOIN public.ada_quote_revisions r ON r.id IN (
      w.current_revision_id, w.commercial_approved_revision_id, w.hubspot_published_revision_id,
      w.customer_accepted_revision_id, w.operationally_released_revision_id
    )
    WHERE r.workspace_id <> w.id
  ) THEN RAISE EXCEPTION 'A revision pointer crosses Quote Workspace boundaries.'; END IF;
END $$;

SELECT 'workspace_counts' AS check_name,
  count(*) AS workspaces,
  count(*) FILTER (WHERE lifecycle_status = 'blocked') AS compatibility_review_required,
  count(*) FILTER (WHERE lifecycle_status_reason LIKE 'legacy_%_requires_governed_review') AS explicitly_held_legacy_states
FROM public.ada_quote_workspaces;

SELECT 'normalization_counts' AS check_name,
  count(*) AS revisions,
  count(*) FILTER (WHERE normalization_status = 'normalized') AS normalized,
  count(*) FILTER (WHERE normalization_status = 'needs_review') AS needs_review,
  count(*) FILTER (WHERE normalization_status = 'mismatch') AS mismatch
FROM public.ada_quote_revisions;

SELECT 'normalized_child_counts' AS check_name,
  (SELECT count(*) FROM public.quote_revision_lines) AS commercial_lines,
  (SELECT count(*) FROM public.work_packages) AS work_packages,
  (SELECT count(*) FROM public.quote_revision_work_packages) AS revision_work_packages,
  (SELECT count(*) FROM public.quote_revision_line_work_packages) AS line_mappings,
  (SELECT count(*) FROM public.quote_revision_work_package_labor) AS labor_allocations;

SELECT 'governance_counts' AS check_name,
  (SELECT count(*) FROM public.quote_workspace_members WHERE removed_at IS NULL) AS active_memberships,
  (SELECT count(*) FROM public.quote_user_capabilities WHERE revoked_at IS NULL) AS active_capabilities,
  (SELECT count(*) FROM public.quote_workflow_events) AS workflow_events,
  (SELECT count(*) FROM public.integration_outbox) AS outbox_commands,
  (SELECT count(*) FROM public.quote_revision_normalization_exceptions WHERE resolved_at IS NULL) AS unresolved_normalization_exceptions;

SELECT 'release1_remote_verification_ok' AS result;
