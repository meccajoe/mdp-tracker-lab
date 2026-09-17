-- Durable Accounting Review workflow over read-only QBO/Tracker financial evidence.
-- Financial source records are never mutated by this migration.

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('stale_qbo_data', 'missing_qbo_actuals', 'missing_tracker_contract', 'missing_labor_rate', 'revenue_variance', 'cost_variance')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'investigating', 'waiting_on_pm', 'waiting_on_accounting', 'resolved', 'superseded')),
  owner_email text,
  metric_contract_version text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL,
  next_action text NOT NULL,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(review_reasons) = 'array'),
  metric_snapshot jsonb NOT NULL CHECK (jsonb_typeof(metric_snapshot) = 'object'),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot) = 'object'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  reopened_at timestamptz,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  resolution_code text,
  resolution_notes text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  resolved_by text,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('resolved', 'superseded') AND resolved_at IS NOT NULL)
    OR
    (status NOT IN ('resolved', 'superseded') AND resolved_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_reconciliation_cases_fingerprint_uidx
  ON public.financial_reconciliation_cases (fingerprint);
CREATE INDEX IF NOT EXISTS financial_reconciliation_cases_queue_idx
  ON public.financial_reconciliation_cases (status, severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS financial_reconciliation_cases_project_idx
  ON public.financial_reconciliation_cases (project_id, as_of_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS financial_reconciliation_cases_active_category_uidx
  ON public.financial_reconciliation_cases (project_id, category)
  WHERE status NOT IN ('resolved', 'superseded');

CREATE TABLE IF NOT EXISTS public.financial_reconciliation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.financial_reconciliation_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'observed', 'assigned', 'status_changed', 'commented', 'resolved', 'reopened', 'superseded')),
  actor_email text,
  from_status text,
  to_status text,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_reconciliation_case_events_case_idx
  ON public.financial_reconciliation_case_events (case_id, created_at DESC);

-- Canonical labor population: TSheets evidence only. Positive verified rates
-- contribute direct wage cost; missing/zero-rate hours stay visible separately.
CREATE OR REPLACE VIEW public.project_labor_reconciliation_summary
WITH (security_invoker = true)
AS
SELECT
  project_id,
  ROUND(SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0))::numeric, 2) AS total_hours,
  ROUND((SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0))
    FILTER (WHERE hourly_rate > 0))::numeric, 2) AS verified_rate_hours,
  ROUND((SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0))
    FILTER (WHERE COALESCE(hourly_rate, 0) <= 0))::numeric, 2) AS missing_rate_hours,
  ROUND((SUM((COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0)) * hourly_rate)
    FILTER (WHERE hourly_rate > 0))::numeric, 2) AS verified_direct_wages,
  COUNT(*) AS source_row_count,
  COUNT(*) FILTER (WHERE hourly_rate > 0) AS verified_rate_row_count,
  COUNT(*) FILTER (WHERE COALESCE(hourly_rate, 0) <= 0) AS missing_rate_row_count,
  MAX(synced_at) AS labor_synced_at
FROM public.qbo_labor_entries
WHERE qbo_entry_id LIKE 'ts_%'
GROUP BY project_id;

ALTER TABLE public.financial_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reconciliation_case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financial_reconciliation_cases FROM anon, authenticated;
REVOKE ALL ON TABLE public.financial_reconciliation_case_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.project_labor_reconciliation_summary FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financial_reconciliation_cases TO service_role;
GRANT SELECT, INSERT ON TABLE public.financial_reconciliation_case_events TO service_role;
GRANT SELECT ON TABLE public.project_labor_reconciliation_summary TO service_role;

CREATE OR REPLACE FUNCTION public.observe_financial_reconciliation_case(
  p_project_id text,
  p_as_of_date date,
  p_category text,
  p_severity text,
  p_metric_contract_version text,
  p_fingerprint text,
  p_reason text,
  p_next_action text,
  p_review_reasons jsonb,
  p_metric_snapshot jsonb,
  p_source_snapshot jsonb,
  p_actor_email text,
  p_scan_scope_complete boolean DEFAULT false,
  p_reopen_resolved boolean DEFAULT false
)
RETURNS public.financial_reconciliation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.financial_reconciliation_cases;
  v_previous public.financial_reconciliation_cases;
BEGIN
  IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid reconciliation fingerprint' USING ERRCODE = '22023';
  END IF;
  IF p_category NOT IN ('stale_qbo_data', 'missing_qbo_actuals', 'missing_tracker_contract', 'missing_labor_rate', 'revenue_variance', 'cost_variance') THEN
    RAISE EXCEPTION 'Invalid reconciliation category' USING ERRCODE = '22023';
  END IF;
  IF p_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Invalid reconciliation severity' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_review_reasons) <> 'array' OR jsonb_typeof(p_metric_snapshot) <> 'object' OR jsonb_typeof(p_source_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Invalid reconciliation snapshots' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_case
  FROM public.financial_reconciliation_cases
  WHERE fingerprint = p_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    IF v_case.status IN ('resolved', 'superseded') AND p_reopen_resolved THEN
      UPDATE public.financial_reconciliation_cases
      SET status = 'new',
          as_of_date = p_as_of_date,
          severity = p_severity,
          reason = p_reason,
          next_action = p_next_action,
          review_reasons = p_review_reasons,
          metric_snapshot = p_metric_snapshot,
          source_snapshot = p_source_snapshot,
          last_seen_at = now(),
          reopened_at = now(),
          reopen_count = reopen_count + 1,
          resolution_code = NULL,
          resolution_notes = '',
          resolved_at = NULL,
          resolved_by = NULL,
          row_version = row_version + 1,
          updated_at = now()
      WHERE id = v_case.id
      RETURNING * INTO v_case;

      INSERT INTO public.financial_reconciliation_case_events
        (case_id, event_type, actor_email, from_status, to_status, fingerprint, payload)
      VALUES
        (v_case.id, 'reopened', p_actor_email, 'resolved', 'new', p_fingerprint, jsonb_build_object('as_of_date', p_as_of_date));
    ELSE
      UPDATE public.financial_reconciliation_cases
      SET as_of_date = p_as_of_date,
          severity = p_severity,
          reason = p_reason,
          next_action = p_next_action,
          review_reasons = p_review_reasons,
          metric_snapshot = p_metric_snapshot,
          source_snapshot = p_source_snapshot,
          last_seen_at = now(),
          updated_at = now()
      WHERE id = v_case.id
      RETURNING * INTO v_case;
    END IF;
    RETURN v_case;
  END IF;

  IF p_scan_scope_complete THEN
    FOR v_previous IN
      SELECT *
      FROM public.financial_reconciliation_cases
      WHERE project_id = p_project_id
        AND category = p_category
        AND status NOT IN ('resolved', 'superseded')
      FOR UPDATE
    LOOP
      UPDATE public.financial_reconciliation_cases
      SET status = 'superseded',
          resolved_at = now(),
          resolved_by = p_actor_email,
          resolution_code = 'condition_changed',
          resolution_notes = 'Superseded by a materially changed reconciliation condition.',
          row_version = row_version + 1,
          updated_at = now()
      WHERE id = v_previous.id;

      INSERT INTO public.financial_reconciliation_case_events
        (case_id, event_type, actor_email, from_status, to_status, fingerprint, payload)
      VALUES
        (v_previous.id, 'superseded', p_actor_email, v_previous.status, 'superseded', v_previous.fingerprint, jsonb_build_object('replacement_fingerprint', p_fingerprint));
    END LOOP;
  END IF;

  INSERT INTO public.financial_reconciliation_cases (
    project_id, as_of_date, category, severity, status, metric_contract_version,
    fingerprint, reason, next_action, review_reasons, metric_snapshot, source_snapshot
  ) VALUES (
    p_project_id, p_as_of_date, p_category, p_severity, 'new', p_metric_contract_version,
    p_fingerprint, p_reason, p_next_action, p_review_reasons, p_metric_snapshot, p_source_snapshot
  )
  RETURNING * INTO v_case;

  INSERT INTO public.financial_reconciliation_case_events
    (case_id, event_type, actor_email, from_status, to_status, fingerprint, payload)
  VALUES
    (v_case.id, 'created', p_actor_email, NULL, 'new', p_fingerprint, jsonb_build_object('as_of_date', p_as_of_date));

  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_financial_reconciliation_case(
  p_case_id uuid,
  p_expected_row_version integer,
  p_actor_email text,
  p_status text DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_resolution_code text DEFAULT NULL,
  p_resolution_notes text DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS public.financial_reconciliation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.financial_reconciliation_cases;
  v_from_status text;
  v_to_status text;
  v_event_type text;
BEGIN
  SELECT * INTO v_case
  FROM public.financial_reconciliation_cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation case not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_case.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Reconciliation case changed; refresh before saving' USING ERRCODE = 'PT409';
  END IF;

  v_from_status := v_case.status;
  v_to_status := COALESCE(p_status, v_case.status);
  IF v_to_status NOT IN ('new', 'assigned', 'investigating', 'waiting_on_pm', 'waiting_on_accounting', 'resolved') THEN
    RAISE EXCEPTION 'Invalid reconciliation status' USING ERRCODE = '22023';
  END IF;
  IF p_category IS NOT NULL AND p_category NOT IN ('stale_qbo_data', 'missing_qbo_actuals', 'missing_tracker_contract', 'missing_labor_rate', 'revenue_variance', 'cost_variance') THEN
    RAISE EXCEPTION 'Invalid reconciliation category' USING ERRCODE = '22023';
  END IF;
  IF v_to_status = 'resolved' AND (NULLIF(btrim(COALESCE(p_resolution_code, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_resolution_notes, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'Resolution code and notes are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_reconciliation_cases
  SET status = v_to_status,
      owner_email = CASE WHEN p_owner_email IS NULL THEN owner_email ELSE NULLIF(btrim(p_owner_email), '') END,
      category = COALESCE(p_category, category),
      resolution_code = CASE WHEN v_to_status = 'resolved' THEN p_resolution_code ELSE NULL END,
      resolution_notes = CASE WHEN v_to_status = 'resolved' THEN btrim(p_resolution_notes) ELSE '' END,
      resolved_at = CASE WHEN v_to_status = 'resolved' THEN now() ELSE NULL END,
      resolved_by = CASE WHEN v_to_status = 'resolved' THEN p_actor_email ELSE NULL END,
      row_version = row_version + 1,
      updated_at = now()
  WHERE id = p_case_id
  RETURNING * INTO v_case;

  v_event_type := CASE
    WHEN v_to_status = 'resolved' THEN 'resolved'
    WHEN p_comment IS NOT NULL AND v_to_status = v_from_status AND p_owner_email IS NULL AND p_category IS NULL THEN 'commented'
    WHEN p_owner_email IS NOT NULL AND v_to_status = v_from_status THEN 'assigned'
    ELSE 'status_changed'
  END;

  INSERT INTO public.financial_reconciliation_case_events
    (case_id, event_type, actor_email, from_status, to_status, fingerprint, payload)
  VALUES (
    v_case.id,
    v_event_type,
    p_actor_email,
    v_from_status,
    v_case.status,
    v_case.fingerprint,
    jsonb_strip_nulls(jsonb_build_object(
      'owner_email', p_owner_email,
      'category', p_category,
      'resolution_code', p_resolution_code,
      'resolution_notes', p_resolution_notes,
      'comment', p_comment
    ))
  );

  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.observe_financial_reconciliation_case(text, date, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_financial_reconciliation_case(uuid, integer, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_financial_reconciliation_case(text, date, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_financial_reconciliation_case(uuid, integer, text, text, text, text, text, text, text) TO service_role;
