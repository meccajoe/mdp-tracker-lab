-- Release 1: deterministic, fail-closed normalization of legacy quote_json.
-- Identity rules:
--   work package UUID = workspace_id + normalized legacy buildItem label
--   work package number = first observed revision_number + line ordinal within the workspace
--   revision line UUID = revision_id + source hash + source ordinal
--   logical line UUID = workspace_id + normalized line identity
--   idempotency identity = revision_id || ':' || source hash
-- Canonical hashes use PostgreSQL jsonb text (sorted object keys) encoded with SHA-256.

CREATE TABLE IF NOT EXISTS public.quote_revision_normalization_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE RESTRICT,
  source_manifest_hash text NOT NULL,
  exception_code text NOT NULL,
  exception_path text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text,
  CONSTRAINT quote_revision_normalization_exception_code_check CHECK (exception_code IN (
    'invalid_quote_json','missing_line_items','missing_commercial_line_identity','invalid_money_value',
    'duplicate_commercial_line_identity','ambiguous_work_package_identity','source_hash_mismatch','normalization_failure'
  )),
  CONSTRAINT quote_revision_normalization_resolution_check CHECK (
    (resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL) OR
    (resolved_at IS NOT NULL AND nullif(btrim(resolved_by), '') IS NOT NULL AND nullif(btrim(resolution_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_normalization_exceptions_unresolved
  ON public.quote_revision_normalization_exceptions (revision_id, source_manifest_hash, exception_code, coalesce(exception_path, ''))
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quote_normalization_exceptions_workspace
  ON public.quote_revision_normalization_exceptions (workspace_id, created_at)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.quote_deterministic_uuid(identity_text text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT (
    substr(md5(identity_text), 1, 8) || '-' ||
    substr(md5(identity_text), 9, 4) || '-' ||
    '5' || substr(md5(identity_text), 14, 3) || '-' ||
    '8' || substr(md5(identity_text), 18, 3) || '-' ||
    substr(md5(identity_text), 21, 12)
  )::uuid
$$;

CREATE OR REPLACE FUNCTION public.quote_manifest_sha256(value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.record_quote_normalization_exception(
  p_revision_id uuid,
  p_workspace_id uuid,
  p_source_hash text,
  p_code text,
  p_path text,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.quote_revision_normalization_exceptions (
    revision_id, workspace_id, source_manifest_hash, exception_code, exception_path, details_json
  ) VALUES (
    p_revision_id, p_workspace_id, p_source_hash, p_code, p_path, coalesce(p_details, '{}'::jsonb)
  ) ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_legacy_quote_revision(p_revision_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  revision_row public.ada_quote_revisions;
  source_hash text;
  normalization_key text;
  problem record;
  normalized_manifest jsonb;
  normalized_hash text;
BEGIN
  SELECT * INTO revision_row
  FROM public.ada_quote_revisions
  WHERE id = p_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002';
  END IF;

  source_hash := public.quote_manifest_sha256(revision_row.quote_json);
  normalization_key := revision_row.id::text || ':' || source_hash;

  IF revision_row.normalization_status = 'normalized' AND revision_row.source_manifest_hash = source_hash THEN
    RETURN normalization_key;
  END IF;

  IF revision_row.source_manifest_hash IS NOT NULL AND revision_row.source_manifest_hash <> source_hash THEN
    UPDATE public.ada_quote_revisions
      SET normalization_status = 'mismatch', normalization_exception = 'Legacy quote_json changed after normalization.'
      WHERE id = revision_row.id;
    PERFORM public.record_quote_normalization_exception(
      revision_row.id, revision_row.workspace_id, source_hash, 'source_hash_mismatch', 'quote_json',
      jsonb_build_object('previous_source_hash', revision_row.source_manifest_hash)
    );
    RETURN normalization_key;
  END IF;

  IF jsonb_typeof(revision_row.quote_json) <> 'object' THEN
    PERFORM public.record_quote_normalization_exception(revision_row.id, revision_row.workspace_id, source_hash, 'invalid_quote_json', 'quote_json', '{}'::jsonb);
    UPDATE public.ada_quote_revisions SET normalization_status = 'needs_review', source_manifest_hash = source_hash, normalization_exception = 'quote_json must be an object.' WHERE id = revision_row.id;
    RETURN normalization_key;
  END IF;

  IF jsonb_typeof(revision_row.quote_json -> 'lineItems') <> 'array' OR jsonb_array_length(revision_row.quote_json -> 'lineItems') = 0 THEN
    PERFORM public.record_quote_normalization_exception(revision_row.id, revision_row.workspace_id, source_hash, 'missing_line_items', 'quote_json.lineItems', '{}'::jsonb);
    UPDATE public.ada_quote_revisions SET normalization_status = 'needs_review', source_manifest_hash = source_hash, normalization_exception = 'lineItems must be a non-empty array.' WHERE id = revision_row.id;
    RETURN normalization_key;
  END IF;

  SELECT ordinality, item INTO problem
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  WHERE jsonb_typeof(item) <> 'object'
     OR nullif(btrim(item ->> 'itemName'), '') IS NULL
     OR nullif(btrim(item ->> 'buildItem'), '') IS NULL
     OR nullif(btrim(item ->> 'lineType'), '') IS NULL
  ORDER BY ordinality
  LIMIT 1;
  IF FOUND THEN
    PERFORM public.record_quote_normalization_exception(revision_row.id, revision_row.workspace_id, source_hash, 'missing_commercial_line_identity', 'quote_json.lineItems[' || (problem.ordinality - 1)::text || ']', '{}'::jsonb);
    UPDATE public.ada_quote_revisions SET normalization_status = 'needs_review', source_manifest_hash = source_hash, normalization_exception = 'A commercial line is missing itemName, buildItem, or lineType.' WHERE id = revision_row.id;
    RETURN normalization_key;
  END IF;

  SELECT ordinality, item INTO problem
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  WHERE coalesce(item ->> 'clientPrice', '') !~ '^-?[0-9]+([.][0-9]+)?$'
     OR coalesce(item ->> 'internalCost', '') !~ '^-?[0-9]+([.][0-9]+)?$'
  ORDER BY ordinality
  LIMIT 1;
  IF FOUND THEN
    PERFORM public.record_quote_normalization_exception(revision_row.id, revision_row.workspace_id, source_hash, 'invalid_money_value', 'quote_json.lineItems[' || (problem.ordinality - 1)::text || ']', '{}'::jsonb);
    UPDATE public.ada_quote_revisions SET normalization_status = 'needs_review', source_manifest_hash = source_hash, normalization_exception = 'clientPrice and internalCost must be numeric.' WHERE id = revision_row.id;
    RETURN normalization_key;
  END IF;

  SELECT min(source.ordinality) AS ordinality, NULL::jsonb AS item INTO problem
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  GROUP BY lower(btrim(source.item ->> 'itemName')), lower(btrim(source.item ->> 'buildItem')), lower(btrim(source.item ->> 'lineType'))
  HAVING count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    PERFORM public.record_quote_normalization_exception(revision_row.id, revision_row.workspace_id, source_hash, 'duplicate_commercial_line_identity', 'quote_json.lineItems', '{}'::jsonb);
    UPDATE public.ada_quote_revisions SET normalization_status = 'needs_review', source_manifest_hash = source_hash, normalization_exception = 'Duplicate legacy line identity requires review.' WHERE id = revision_row.id;
    RETURN normalization_key;
  END IF;

  WITH first_occurrences AS (
    SELECT
      r.workspace_id,
      lower(btrim(source.item ->> 'buildItem')) AS identity_key,
      min(r.revision_number * 100000 + source.ordinality) AS first_position
    FROM public.ada_quote_revisions r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(r.quote_json -> 'lineItems') = 'array' THEN r.quote_json -> 'lineItems' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS source(item, ordinality)
    WHERE r.workspace_id = revision_row.workspace_id
      AND jsonb_typeof(r.quote_json -> 'lineItems') = 'array'
      AND nullif(btrim(source.item ->> 'buildItem'), '') IS NOT NULL
    GROUP BY r.workspace_id, lower(btrim(source.item ->> 'buildItem'))
  ), numbered AS (
    SELECT *, row_number() OVER (ORDER BY first_position, identity_key) AS item_sequence
    FROM first_occurrences
  )
  INSERT INTO public.work_packages (
    id, workspace_id, item_number, display_name, classification, quantity, created_by, source_ref
  )
  SELECT
    public.quote_deterministic_uuid('work-package:' || numbered.workspace_id::text || ':' || numbered.identity_key),
    numbered.workspace_id,
    numbered.item_sequence::integer,
    source.item ->> 'buildItem',
    'fabrication',
    1,
    revision_row.created_by_email,
    jsonb_build_object('identity_key', numbered.identity_key, 'first_position', numbered.first_position)
  FROM numbered
  CROSS JOIN LATERAL (
    SELECT item
    FROM public.ada_quote_revisions display_revision
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(display_revision.quote_json -> 'lineItems') = 'array' THEN display_revision.quote_json -> 'lineItems' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS candidate(item, ordinality)
    WHERE display_revision.workspace_id = numbered.workspace_id
      AND lower(btrim(candidate.item ->> 'buildItem')) = numbered.identity_key
    ORDER BY display_revision.revision_number, candidate.ordinality
    LIMIT 1
  ) source
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.quote_revision_work_packages (
    id, revision_id, workspace_id, work_package_id, display_name, description, line_type, quantity,
    materials_other_budget, total_quoted_hours, labor_budget, production_notes, sort_order, source_ref
  )
  SELECT
    public.quote_deterministic_uuid('revision-work-package:' || revision_row.id::text || ':' || lower(btrim(source.item ->> 'buildItem'))),
    revision_row.id,
    revision_row.workspace_id,
    public.quote_deterministic_uuid('work-package:' || revision_row.workspace_id::text || ':' || lower(btrim(source.item ->> 'buildItem'))),
    min(source.item ->> 'buildItem'),
    NULL,
    'fabrication',
    1,
    NULL,
    NULL,
    NULL,
    NULL,
    min(source.ordinality)::integer,
    jsonb_build_object(
      'source', 'ada_quote_revisions.quote_json',
      'source_manifest_hash', source_hash,
      'legacy_internal_cost', sum((source.item ->> 'internalCost')::numeric),
      'legacy_sell_price', sum((source.item ->> 'clientPrice')::numeric)
    )
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  GROUP BY lower(btrim(source.item ->> 'buildItem'))
  ON CONFLICT (revision_id, work_package_id) DO NOTHING;

  INSERT INTO public.quote_revision_lines (
    id, revision_id, workspace_id, logical_line_id, sort_order, sku, name, description, line_type,
    quantity, unit, unit_sell_price, computed_sell_price, final_sell_price, formula_type, formula_status,
    formula_inputs, production_mapping_status, evidence_refs, source_ref
  )
  SELECT
    public.quote_deterministic_uuid('revision-line:' || revision_row.id::text || ':' || source_hash || ':' || source.ordinality::text),
    revision_row.id,
    revision_row.workspace_id,
    public.quote_deterministic_uuid('logical-line:' || revision_row.workspace_id::text || ':' || lower(btrim(source.item ->> 'itemName')) || ':' || lower(btrim(source.item ->> 'buildItem')) || ':' || lower(btrim(source.item ->> 'lineType'))),
    source.ordinality::integer,
    NULL,
    source.item ->> 'itemName',
    NULL,
    source.item ->> 'lineType',
    NULL,
    NULL,
    NULL,
    (source.item ->> 'clientPrice')::numeric,
    (source.item ->> 'clientPrice')::numeric,
    source.item ->> 'lineType',
    CASE WHEN source.item ? 'pricingBasis' THEN 'complete' ELSE 'needs_input' END,
    jsonb_strip_nulls(jsonb_build_object('pricing_basis', source.item -> 'pricingBasis', 'legacy_internal_cost', (source.item ->> 'internalCost')::numeric)),
    'mapped',
    coalesce(source.item -> 'evidenceRefs', '[]'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'ada_quote_revisions.quote_json.lineItems',
      'ordinal', source.ordinality,
      'source_manifest_hash', source_hash,
      'assumption', source.item -> 'assumption',
      'confidence', source.item -> 'confidence'
    ))
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  ON CONFLICT (revision_id, sort_order) DO NOTHING;

  INSERT INTO public.quote_revision_line_work_packages (
    id, revision_id, workspace_id, commercial_line_id, revision_work_package_id,
    mapping_status, allocation_basis, allocation_pct, source_ref
  )
  SELECT
    public.quote_deterministic_uuid('line-work-package:' || line.id::text || ':' || revision_package.id::text),
    revision_row.id,
    revision_row.workspace_id,
    line.id,
    revision_package.id,
    'mapped',
    'percentage',
    1,
    jsonb_build_object('source', 'legacy_quote_json_buildItem', 'source_manifest_hash', source_hash)
  FROM jsonb_array_elements(revision_row.quote_json -> 'lineItems') WITH ORDINALITY AS source(item, ordinality)
  JOIN public.quote_revision_lines line
    ON line.revision_id = revision_row.id AND line.sort_order = source.ordinality::integer
  JOIN public.quote_revision_work_packages revision_package
    ON revision_package.revision_id = revision_row.id
  JOIN public.work_packages package
    ON package.id = revision_package.work_package_id
   AND package.id = public.quote_deterministic_uuid('work-package:' || revision_row.workspace_id::text || ':' || lower(btrim(source.item ->> 'buildItem')))
  ON CONFLICT (revision_id, commercial_line_id, revision_work_package_id) DO NOTHING;

  SELECT jsonb_build_object(
    'revision_id', revision_row.id,
    'currency', revision_row.currency,
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'logical_line_id', line.logical_line_id,
        'sort_order', line.sort_order,
        'name', line.name,
        'line_type', line.line_type,
        'final_sell_price', line.final_sell_price,
        'formula_inputs', line.formula_inputs,
        'work_package_ids', (
          SELECT jsonb_agg(link.revision_work_package_id ORDER BY link.revision_work_package_id)
          FROM public.quote_revision_line_work_packages link
          WHERE link.commercial_line_id = line.id
        )
      ) ORDER BY line.sort_order)
      FROM public.quote_revision_lines line WHERE line.revision_id = revision_row.id
    ), '[]'::jsonb),
    'work_packages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'work_package_id', package.work_package_id,
        'display_name', package.display_name,
        'quantity', package.quantity,
        'materials_other_budget', package.materials_other_budget,
        'quoted_hours', package.total_quoted_hours,
        'labor_budget', package.labor_budget,
        'source_ref', package.source_ref
      ) ORDER BY package.work_package_id)
      FROM public.quote_revision_work_packages package WHERE package.revision_id = revision_row.id
    ), '[]'::jsonb)
  ) INTO normalized_manifest;

  normalized_hash := public.quote_manifest_sha256(normalized_manifest);
  UPDATE public.ada_quote_revisions
  SET normalization_status = 'normalized',
      source_manifest_hash = source_hash,
      manifest_hash = normalized_hash,
      normalized_at = now(),
      normalization_exception = NULL,
      locked_at = coalesce(locked_at, created_at)
  WHERE id = revision_row.id;

  RETURN normalization_key;
EXCEPTION WHEN OTHERS THEN
  IF revision_row.id IS NULL THEN RAISE; END IF;
  PERFORM public.record_quote_normalization_exception(
    revision_row.id, revision_row.workspace_id, coalesce(source_hash, public.quote_manifest_sha256(revision_row.quote_json)),
    'normalization_failure', NULL, jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM)
  );
  UPDATE public.ada_quote_revisions
  SET normalization_status = 'needs_review', source_manifest_hash = coalesce(source_hash, public.quote_manifest_sha256(quote_json)), normalization_exception = SQLERRM
  WHERE id = revision_row.id;
  RETURN revision_row.id::text || ':' || coalesce(source_hash, 'unavailable');
END;
$$;

DO $$
DECLARE revision_to_normalize record;
BEGIN
  FOR revision_to_normalize IN
    SELECT id FROM public.ada_quote_revisions ORDER BY workspace_id, revision_number, id
  LOOP
    PERFORM public.normalize_legacy_quote_revision(revision_to_normalize.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_ada_quote_revision(
  p_workspace_id uuid,
  p_actor_email text,
  p_quote_json jsonb,
  p_internal_cost numeric,
  p_sell_price numeric,
  p_margin_pct numeric,
  p_assumptions_json jsonb DEFAULT '[]'::jsonb,
  p_evidence_json jsonb DEFAULT '[]'::jsonb
)
RETURNS SETOF public.ada_quote_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_revision_number integer;
  created_revision public.ada_quote_revisions;
  normalized_actor text := lower(btrim(p_actor_email));
  actor_workspace_role text;
  expected_row_version bigint;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  SELECT workspace_role INTO actor_workspace_role
  FROM public.quote_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = normalized_actor
      AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO next_revision_number
  FROM public.ada_quote_revisions WHERE workspace_id = p_workspace_id;

  INSERT INTO public.ada_quote_revisions (
    workspace_id, revision_number, quote_json, internal_cost, sell_price,
    margin_pct, assumptions_json, evidence_json, created_by_email
  ) VALUES (
    p_workspace_id, next_revision_number, p_quote_json, p_internal_cost, p_sell_price,
    p_margin_pct, p_assumptions_json, p_evidence_json, normalized_actor
  ) RETURNING * INTO created_revision;

  UPDATE public.ada_quote_workspaces
  SET status = 'in_review', accepted_revision_id = NULL, accepted_at = NULL, last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING row_version INTO expected_row_version;

  PERFORM public.normalize_legacy_quote_revision(created_revision.id);
  SELECT * INTO created_revision FROM public.ada_quote_revisions WHERE id = created_revision.id;
  PERFORM public.append_quote_workflow_event(
    p_workspace_id, created_revision.id, 'revision_created', normalized_actor,
    actor_workspace_role, 'edit_draft', expected_row_version, 'draft',
    'Legacy-compatible revision creation', '[]'::jsonb,
    jsonb_build_object('compatibility_rpc', 'create_ada_quote_revision'),
    'legacy-revision-created:' || created_revision.id::text
  );

  RETURN NEXT created_revision;
END;
$$;

DROP FUNCTION IF EXISTS public.accept_ada_quote_revision(uuid, uuid, text);
CREATE FUNCTION public.accept_ada_quote_revision(
  p_workspace_id uuid,
  p_revision_id uuid,
  p_actor_email text
)
RETURNS TABLE(commercial_approved_revision_id uuid, commercial_approved_at timestamptz, already_commercially_approved boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_revision public.ada_quote_revisions;
  current_revision_id uuid;
  current_commercial_approved_revision_id uuid;
  current_commercial_approved_at timestamptz;
  current_lifecycle_status text;
  expected_row_version bigint;
  actor_workspace_role text;
  normalized_actor text := lower(btrim(p_actor_email));
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  SELECT w.current_revision_id, w.commercial_approved_revision_id,
         w.lifecycle_status, w.row_version,
         member.workspace_role
  INTO current_revision_id, current_commercial_approved_revision_id,
       current_lifecycle_status, expected_row_version,
       actor_workspace_role
  FROM public.ada_quote_workspaces w
  JOIN public.quote_workspace_members member
    ON member.workspace_id = w.id AND member.user_id = auth.uid()
   AND member.email_normalized = normalized_actor
   AND member.removed_at IS NULL
  WHERE w.id = p_workspace_id
  FOR UPDATE OF w;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO latest_revision
  FROM public.ada_quote_revisions
  WHERE workspace_id = p_workspace_id
  ORDER BY revision_number DESC
  LIMIT 1;
  IF latest_revision.id IS NULL OR latest_revision.id <> p_revision_id THEN
    RAISE EXCEPTION 'Only the latest reviewed quote revision can be accepted.' USING ERRCODE = 'P0001';
  END IF;
  IF latest_revision.normalization_status <> 'normalized' OR latest_revision.manifest_hash IS NULL OR latest_revision.locked_at IS NULL THEN
    RAISE EXCEPTION 'Legacy acceptance requires a stable normalized manifest.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quote_user_capabilities capability
    WHERE capability.user_id = auth.uid()
      AND capability.email_normalized = normalized_actor
      AND capability.capability = 'approve_commercial'
      AND capability.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Quote capability approve_commercial is required.' USING ERRCODE = '42501';
  END IF;
  IF current_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Only the current governed quote revision can be commercially approved.' USING ERRCODE = 'P0001';
  END IF;

  IF current_lifecycle_status = 'commercial_approved'
     AND current_commercial_approved_revision_id = p_revision_id THEN
    SELECT event.occurred_at INTO current_commercial_approved_at
    FROM public.quote_workflow_events event
    WHERE event.workspace_id = p_workspace_id
      AND event.revision_id = p_revision_id
      AND event.event_type = 'commercial_approved'
    ORDER BY event.occurred_at DESC, event.event_id DESC
    LIMIT 1;
    RETURN QUERY SELECT p_revision_id, current_commercial_approved_at, true;
    RETURN;
  END IF;

  IF current_lifecycle_status = 'draft' THEN
    PERFORM public.append_quote_workflow_event(
      p_workspace_id, p_revision_id, 'revision_submitted_for_review', normalized_actor,
      actor_workspace_role, 'submit_review', expected_row_version, 'internal_review',
      'Legacy Ada review submission', '[]'::jsonb,
      jsonb_build_object('compatibility_rpc', 'accept_ada_quote_revision'),
      'legacy-review-submitted:' || p_revision_id::text
    );
    SELECT row_version, lifecycle_status INTO expected_row_version, current_lifecycle_status
    FROM public.ada_quote_workspaces WHERE id = p_workspace_id;
  END IF;

  IF current_lifecycle_status = 'internal_review' THEN
    PERFORM public.append_quote_workflow_event(
      p_workspace_id, p_revision_id, 'commercial_approved', normalized_actor,
      actor_workspace_role, 'approve_commercial', expected_row_version, 'commercial_approved',
      'Approved through the legacy Ada review compatibility action',
      jsonb_build_array(jsonb_build_object('kind', 'legacy_ada_review_action', 'revision_id', p_revision_id)),
      jsonb_build_object('compatibility_rpc', 'accept_ada_quote_revision', 'approval_kind', 'commercial'),
      'legacy-commercial-approved:' || p_revision_id::text
    );
  ELSIF current_lifecycle_status <> 'commercial_approved' OR current_commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Legacy Ada approval is not valid from the current governed lifecycle state.' USING ERRCODE = 'P0001';
  END IF;

  SELECT event.occurred_at INTO current_commercial_approved_at
  FROM public.quote_workflow_events event
  WHERE event.workspace_id = p_workspace_id
    AND event.revision_id = p_revision_id
    AND event.event_type = 'commercial_approved'
  ORDER BY event.occurred_at DESC, event.event_id DESC
  LIMIT 1;
  RETURN QUERY SELECT p_revision_id, current_commercial_approved_at, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_quote_workspace(
  p_title text,
  p_ada_project_id uuid DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_hubspot_deal_id text DEFAULT NULL
)
RETURNS public.ada_quote_workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_actor text := public.current_quote_actor_email();
  created_workspace_id uuid := gen_random_uuid();
  created_workspace public.ada_quote_workspaces;
BEGIN
  IF normalized_actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated quote actor email is required.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Quote title is required.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_user_capabilities capability
    WHERE capability.user_id = auth.uid()
      AND capability.email_normalized = normalized_actor
      AND capability.capability = 'create_workspace'
      AND capability.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Quote capability create_workspace is required.' USING ERRCODE = '42501';
  END IF;
  IF p_ada_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ada_quote_projects project
    WHERE project.id = p_ada_project_id
      AND lower(btrim(project.created_by_email)) = normalized_actor
  ) THEN
    RAISE EXCEPTION 'Ada project not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ada_quote_workspaces (
    id, workspace_number, ada_project_id, title, client_name, contact_name, hubspot_deal_id, status, created_by_email
  ) VALUES (
    created_workspace_id, 'QW-' || upper(replace(created_workspace_id::text, '-', '')),
    p_ada_project_id, btrim(p_title), nullif(btrim(p_client_name), ''),
    nullif(btrim(p_contact_name), ''), nullif(btrim(p_hubspot_deal_id), ''), 'draft', normalized_actor
  ) RETURNING * INTO created_workspace;

  INSERT INTO public.quote_workspace_members (
    workspace_id, user_id, email_normalized, workspace_role, added_by
  ) VALUES (
    created_workspace.id, auth.uid(), normalized_actor, 'owner', normalized_actor
  );

  INSERT INTO public.ada_quote_concepts (
    workspace_id, label, mode, status, created_by_email
  ) VALUES (
    created_workspace.id, 'Workspace', 'standard', 'draft', normalized_actor
  );

  PERFORM public.append_quote_workflow_event(
    created_workspace.id, NULL, 'workspace_created', normalized_actor,
    'owner', 'create_workspace', created_workspace.row_version, 'intake',
    'Created quote workspace', '[]'::jsonb,
    jsonb_build_object('compatibility_concept_created', true),
    'workspace-created:' || created_workspace.id::text
  );

  SELECT * INTO created_workspace
  FROM public.ada_quote_workspaces WHERE id = created_workspace.id;
  RETURN created_workspace;
END;
$$;

ALTER TABLE public.quote_revision_normalization_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_normalization_exception_member_read ON public.quote_revision_normalization_exceptions;
CREATE POLICY quote_normalization_exception_member_read ON public.quote_revision_normalization_exceptions
  FOR SELECT TO authenticated USING (public.has_quote_workspace_access(workspace_id));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.quote_revision_normalization_exceptions FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_legacy_quote_revision(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_ada_quote_revision(uuid, text, jsonb, numeric, numeric, numeric, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_ada_quote_revision(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_quote_workspace(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ada_quote_revision(uuid, text, jsonb, numeric, numeric, numeric, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quote_workspace(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ada_quote_revision(uuid, uuid, text) TO authenticated;

DROP TRIGGER IF EXISTS protect_archived_ada_quote_assets ON public.ada_quote_assets;
CREATE TRIGGER protect_archived_ada_quote_assets BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_assets
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_messages ON public.ada_quote_messages;
CREATE TRIGGER protect_archived_ada_quote_messages BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_concepts ON public.ada_quote_concepts;
CREATE TRIGGER protect_archived_ada_quote_concepts BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_concepts
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_chat_turns ON public.ada_chat_turns;
CREATE TRIGGER protect_archived_ada_chat_turns BEFORE INSERT OR UPDATE OR DELETE ON public.ada_chat_turns
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_revisions ON public.ada_quote_revisions;
CREATE TRIGGER protect_archived_ada_quote_revisions BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_revisions
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_events ON public.ada_quote_events;
CREATE TRIGGER protect_archived_ada_quote_events BEFORE INSERT ON public.ada_quote_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_workflow_events ON public.quote_workflow_events;
CREATE TRIGGER protect_archived_quote_workflow_events BEFORE INSERT ON public.quote_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_sheets ON public.ada_quote_sheets;
CREATE TRIGGER protect_archived_ada_quote_sheets BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_sheets
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_quote_sheet_changes ON public.ada_quote_sheet_changes;
CREATE TRIGGER protect_archived_ada_quote_sheet_changes BEFORE INSERT OR UPDATE OR DELETE ON public.ada_quote_sheet_changes
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_ada_feedback ON public.ada_feedback;
CREATE TRIGGER protect_archived_ada_feedback BEFORE INSERT OR UPDATE OR DELETE ON public.ada_feedback
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_work_packages ON public.work_packages;
CREATE TRIGGER protect_archived_work_packages BEFORE INSERT OR UPDATE OR DELETE ON public.work_packages
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_revision_lines ON public.quote_revision_lines;
CREATE TRIGGER protect_archived_quote_revision_lines BEFORE INSERT OR UPDATE OR DELETE ON public.quote_revision_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_revision_work_packages ON public.quote_revision_work_packages;
CREATE TRIGGER protect_archived_quote_revision_work_packages BEFORE INSERT OR UPDATE OR DELETE ON public.quote_revision_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_revision_line_work_packages ON public.quote_revision_line_work_packages;
CREATE TRIGGER protect_archived_quote_revision_line_work_packages BEFORE INSERT OR UPDATE OR DELETE ON public.quote_revision_line_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_revision_work_package_labor ON public.quote_revision_work_package_labor;
CREATE TRIGGER protect_archived_quote_revision_work_package_labor BEFORE INSERT OR UPDATE OR DELETE ON public.quote_revision_work_package_labor
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
DROP TRIGGER IF EXISTS protect_archived_quote_revision_normalization_exceptions ON public.quote_revision_normalization_exceptions;
CREATE TRIGGER protect_archived_quote_revision_normalization_exceptions BEFORE INSERT OR UPDATE OR DELETE ON public.quote_revision_normalization_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_archived_quote_workspace_child();
