\set ON_ERROR_STOP on

INSERT INTO public.projects (id, name, client, status)
VALUES ('test-recon-1', 'Reconciliation Harness', 'Harness Client', 'Active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.qbo_labor_entries (
  qbo_entry_id, project_id, employee_name, date, reg_hours, ot_hours, hourly_rate
) VALUES
  ('ts_harness_verified', 'test-recon-1', 'Verified Worker', '2026-09-15', 8, 1, 25),
  ('ts_harness_missing', 'test-recon-1', 'Missing Rate Worker', '2026-09-15', 2, 0, 0);

DO $$
DECLARE
  v_labor record;
  v_case public.financial_reconciliation_cases;
  v_resolved public.financial_reconciliation_cases;
BEGIN
  SELECT * INTO v_labor
  FROM public.project_labor_reconciliation_summary
  WHERE project_id = 'test-recon-1';

  IF v_labor.total_hours <> 11 OR v_labor.verified_rate_hours <> 9 OR v_labor.missing_rate_hours <> 2 OR v_labor.verified_direct_wages <> 225 THEN
    RAISE EXCEPTION 'labor reconciliation summary mismatch: %', row_to_json(v_labor);
  END IF;

  SELECT * INTO v_case FROM public.observe_financial_reconciliation_case(
    'test-recon-1', '2026-09-15', 'cost_variance', 'high', '2026-09-17.v1', repeat('a', 64),
    'QBO cost is above Tracker.', 'Review costs.', '[{"code":"cost_variance"}]'::jsonb,
    '{"costVariance":{"amount":10000}}'::jsonb, '{"qboSource":"ProjectProfitabilitySummary"}'::jsonb,
    'harness@meccadesign.com', true, false
  );

  PERFORM public.observe_financial_reconciliation_case(
    'test-recon-1', '2026-09-16', 'cost_variance', 'high', '2026-09-17.v1', repeat('a', 64),
    'QBO cost is above Tracker.', 'Review costs.', '[{"code":"cost_variance"}]'::jsonb,
    '{"costVariance":{"amount":10000}}'::jsonb, '{"qboSource":"ProjectProfitabilitySummary"}'::jsonb,
    'harness@meccadesign.com', true, false
  );

  IF (SELECT count(*) FROM public.financial_reconciliation_cases WHERE fingerprint = repeat('a', 64)) <> 1 THEN
    RAISE EXCEPTION 'unchanged observation duplicated case';
  END IF;
  IF (SELECT count(*) FROM public.financial_reconciliation_case_events WHERE case_id = v_case.id AND event_type = 'created') <> 1 THEN
    RAISE EXCEPTION 'unchanged observation duplicated event';
  END IF;

  SELECT * INTO v_resolved FROM public.transition_financial_reconciliation_case(
    v_case.id, v_case.row_version, 'harness@meccadesign.com', 'resolved', NULL, NULL,
    'expected_difference', 'Verified timing difference.', 'Reviewed in harness.'
  );
  IF v_resolved.status <> 'resolved' OR v_resolved.row_version <> v_case.row_version + 1 THEN
    RAISE EXCEPTION 'resolution transition mismatch';
  END IF;

  SELECT * INTO v_resolved FROM public.observe_financial_reconciliation_case(
    'test-recon-1', '2026-09-17', 'cost_variance', 'high', '2026-09-17.v1', repeat('a', 64),
    'QBO cost is above Tracker.', 'Review costs.', '[{"code":"cost_variance"}]'::jsonb,
    '{"costVariance":{"amount":10000}}'::jsonb, '{"qboSource":"ProjectProfitabilitySummary"}'::jsonb,
    'harness@meccadesign.com', true, false
  );
  IF v_resolved.status <> 'resolved' OR v_resolved.reopen_count <> 0 THEN
    RAISE EXCEPTION 'resolved case reopened without explicit recurrence';
  END IF;

  SELECT * INTO v_resolved FROM public.observe_financial_reconciliation_case(
    'test-recon-1', '2026-09-17', 'cost_variance', 'high', '2026-09-17.v1', repeat('a', 64),
    'QBO cost is above Tracker.', 'Review costs.', '[{"code":"cost_variance"}]'::jsonb,
    '{"costVariance":{"amount":10000}}'::jsonb, '{"qboSource":"ProjectProfitabilitySummary"}'::jsonb,
    'harness@meccadesign.com', true, true
  );
  IF v_resolved.status <> 'new' OR v_resolved.reopen_count <> 1 THEN
    RAISE EXCEPTION 'explicit recurrence did not reopen once';
  END IF;
  IF (SELECT count(*) FROM public.financial_reconciliation_case_events WHERE case_id = v_case.id AND event_type = 'reopened') <> 1 THEN
    RAISE EXCEPTION 'reopen event count mismatch';
  END IF;

  PERFORM public.observe_financial_reconciliation_case(
    'test-recon-1', '2026-09-17', 'cost_variance', 'critical', '2026-09-17.v1', repeat('b', 64),
    'QBO cost changed materially.', 'Review changed costs.', '[{"code":"cost_variance"}]'::jsonb,
    '{"costVariance":{"amount":20000}}'::jsonb, '{"qboSource":"ProjectProfitabilitySummary"}'::jsonb,
    'harness@meccadesign.com', true, false
  );

  IF (SELECT status FROM public.financial_reconciliation_cases WHERE fingerprint = repeat('a', 64)) <> 'superseded' THEN
    RAISE EXCEPTION 'prior active fingerprint was not superseded';
  END IF;
  IF (SELECT count(*) FROM public.financial_reconciliation_cases WHERE project_id = 'test-recon-1' AND status NOT IN ('resolved', 'superseded')) <> 1 THEN
    RAISE EXCEPTION 'expected one active case';
  END IF;
END;
$$;

SELECT 'financial_reconciliation_harness_ok' AS result;
