ALTER TABLE public.qbo_labor_entries
  ADD COLUMN IF NOT EXISTS qbo_time_user_id bigint,
  ADD COLUMN IF NOT EXISTS qbo_time_salaried boolean;

CREATE INDEX IF NOT EXISTS idx_qbo_labor_entries_qbo_time_user
  ON public.qbo_labor_entries(qbo_time_user_id)
  WHERE qbo_entry_id LIKE 'ts_%';

-- Browsers may read labor evidence but only server-side service-role syncs may mutate it.
DROP POLICY IF EXISTS "auth_all_qbo_labor_entries" ON public.qbo_labor_entries;
DROP POLICY IF EXISTS "authenticated_read_qbo_labor_entries" ON public.qbo_labor_entries;
CREATE POLICY "authenticated_read_qbo_labor_entries"
  ON public.qbo_labor_entries FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON TABLE public.qbo_labor_entries FROM anon, authenticated;
GRANT SELECT ON TABLE public.qbo_labor_entries TO authenticated;

-- One approved payroll authority manifest is active at a time. A replacement must explicitly
-- reference and revoke its predecessor so historical recalculation cannot change silently.
CREATE TABLE IF NOT EXISTS public.labor_rate_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_scope text NOT NULL DEFAULT 'mecca_payroll' CHECK (authority_scope = 'mecca_payroll'),
  source_label text NOT NULL,
  source_file_name text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_modified_at timestamptz NOT NULL,
  baseline_date date NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  supersedes_import_id uuid REFERENCES public.labor_rate_imports(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,
  UNIQUE (source_sha256),
  CONSTRAINT labor_rate_import_revocation_complete CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND NULLIF(trim(revoked_by), '') IS NOT NULL AND NULLIF(trim(revoked_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_labor_rate_imports_one_active_scope
  ON public.labor_rate_imports(authority_scope)
  WHERE revoked_at IS NULL;

ALTER TABLE public.labor_rate_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.labor_rate_imports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.labor_rate_imports FROM service_role;
GRANT SELECT ON TABLE public.labor_rate_imports TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_labor_rate_import(
  target_import_id uuid,
  actor text,
  reason text
)
RETURNS public.labor_rate_imports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revoked public.labor_rate_imports;
BEGIN
  IF NULLIF(trim(actor), '') IS NULL OR NULLIF(trim(reason), '') IS NULL THEN
    RAISE EXCEPTION 'actor and reason are required';
  END IF;

  UPDATE public.labor_rate_imports
  SET revoked_at = now(), revoked_by = actor, revoked_reason = reason
  WHERE id = target_import_id AND revoked_at IS NULL
  RETURNING * INTO revoked;

  IF revoked.id IS NULL THEN
    RAISE EXCEPTION 'active labor-rate import not found';
  END IF;
  RETURN revoked;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_labor_rate_import(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_labor_rate_import(uuid, text, text) TO service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Individual authority rows are append-only children of an approved import manifest.
CREATE TABLE IF NOT EXISTS public.labor_worker_rate_authority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.labor_rate_imports(id),
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('employee', 'contractor')),
  base_hourly_rate numeric(10, 2) NOT NULL CHECK (base_hourly_rate > 0),
  effective_start_date date NOT NULL,
  effective_end_date date,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  source_note text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT labor_worker_rate_authority_date_order
    CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
  CONSTRAINT labor_worker_rate_authority_source_row_unique
    UNIQUE (import_id, source_row_number, effective_start_date),
  CONSTRAINT labor_worker_rate_authority_no_overlap
    EXCLUDE USING gist (
      import_id WITH =,
      normalized_name WITH =,
      daterange(effective_start_date, COALESCE(effective_end_date, 'infinity'::date), '[]') WITH &&
    )
);

CREATE INDEX IF NOT EXISTS idx_labor_worker_rate_authority_lookup
  ON public.labor_worker_rate_authority(import_id, normalized_name, effective_start_date, effective_end_date);

CREATE OR REPLACE FUNCTION public.prevent_labor_rate_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'labor worker rate authority rows are append-only; revoke the parent import instead';
END;
$$;

DROP TRIGGER IF EXISTS labor_worker_rate_authority_immutable ON public.labor_worker_rate_authority;
CREATE TRIGGER labor_worker_rate_authority_immutable
  BEFORE UPDATE OR DELETE ON public.labor_worker_rate_authority
  FOR EACH ROW EXECUTE FUNCTION public.prevent_labor_rate_authority_mutation();

ALTER TABLE public.labor_worker_rate_authority ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.labor_worker_rate_authority FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.labor_worker_rate_authority FROM service_role;
GRANT SELECT ON TABLE public.labor_worker_rate_authority TO service_role;

CREATE OR REPLACE FUNCTION public.import_labor_rate_authority(
  import_source_label text,
  import_source_file_name text,
  import_source_sha256 text,
  import_source_modified_at timestamptz,
  import_baseline_date date,
  import_approved_by text,
  rate_rows jsonb,
  classification_rows jsonb,
  import_supersedes_id uuid DEFAULT NULL,
  supersession_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_import public.labor_rate_imports;
  existing_import public.labor_rate_imports;
  new_import_id uuid;
BEGIN
  IF import_source_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid source SHA-256';
  END IF;
  IF NULLIF(trim(import_approved_by), '') IS NULL THEN
    RAISE EXCEPTION 'approved_by is required';
  END IF;
  IF jsonb_typeof(rate_rows) <> 'array' OR jsonb_array_length(rate_rows) = 0 THEN
    RAISE EXCEPTION 'rate_rows must be a non-empty JSON array';
  END IF;
  IF jsonb_typeof(classification_rows) <> 'array' THEN
    RAISE EXCEPTION 'classification_rows must be a JSON array';
  END IF;

  SELECT * INTO existing_import
  FROM public.labor_rate_imports
  WHERE source_sha256 = import_source_sha256;
  IF existing_import.id IS NOT NULL THEN
    IF existing_import.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'this source hash belongs to a revoked import';
    END IF;
    RETURN existing_import.id;
  END IF;

  SELECT * INTO active_import
  FROM public.labor_rate_imports
  WHERE authority_scope = 'mecca_payroll' AND revoked_at IS NULL
  FOR UPDATE;

  IF active_import.id IS NOT NULL THEN
    IF import_supersedes_id IS DISTINCT FROM active_import.id OR NULLIF(trim(supersession_reason), '') IS NULL THEN
      RAISE EXCEPTION 'active import % must be explicitly superseded with a reason', active_import.id;
    END IF;
    UPDATE public.labor_rate_imports
    SET revoked_at = now(), revoked_by = import_approved_by, revoked_reason = supersession_reason
    WHERE id = active_import.id;
  ELSIF import_supersedes_id IS NOT NULL THEN
    RAISE EXCEPTION 'superseded import is not the active authority';
  END IF;

  INSERT INTO public.labor_rate_imports(
    source_label, source_file_name, source_sha256, source_modified_at,
    baseline_date, approved_by, supersedes_import_id
  ) VALUES (
    import_source_label, import_source_file_name, import_source_sha256,
    import_source_modified_at, import_baseline_date, import_approved_by,
    import_supersedes_id
  ) RETURNING id INTO new_import_id;

  INSERT INTO public.labor_worker_rate_authority(
    import_id, normalized_name, display_name, classification, base_hourly_rate,
    effective_start_date, effective_end_date, source_row_number, source_note
  )
  SELECT
    new_import_id,
    row.normalized_name,
    row.display_name,
    row.classification,
    row.base_hourly_rate,
    row.effective_start_date,
    row.effective_end_date,
    row.source_row_number,
    row.source_note
  FROM jsonb_to_recordset(rate_rows) AS row(
    normalized_name text,
    display_name text,
    classification text,
    base_hourly_rate numeric,
    effective_start_date date,
    effective_end_date date,
    source_row_number integer,
    source_note text
  );

  INSERT INTO public.labor_worker_classifications(
    normalized_name, display_name, classification, roster_snapshot_date, source, notes
  )
  SELECT
    row.normalized_name,
    row.display_name,
    row.classification,
    row.roster_snapshot_date,
    row.source,
    row.notes
  FROM jsonb_to_recordset(classification_rows) AS row(
    normalized_name text,
    display_name text,
    classification text,
    roster_snapshot_date date,
    source text,
    notes text
  )
  ON CONFLICT (normalized_name, roster_snapshot_date)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    classification = EXCLUDED.classification,
    source = EXCLUDED.source,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN new_import_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_labor_rate_authority(text, text, text, timestamptz, date, text, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_labor_rate_authority(text, text, text, timestamptz, date, text, jsonb, jsonb, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_labor_worker_name(worker_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH cleaned AS (
    SELECT trim(regexp_replace(
      regexp_replace(lower(regexp_replace(COALESCE(worker_name, ''), '\([^)]*\)', ' ', 'g')), '[^a-z]', ' ', 'g'),
      '\s+', ' ', 'g'
    )) AS value
  )
  SELECT CASE value
    WHEN 'daniel guiterrez' THEN 'daniel gutierrez'
    WHEN 'cruz eduardo deleon' THEN 'eduardo c deleon'
    WHEN 'eliezar william sosa' THEN 'eliezer william salinas sosa'
    WHEN 'greg maslyk' THEN 'gregory maslyk'
    WHEN 'henry ledezma' THEN 'henry ledezma mireles'
    WHEN 'john chitwood' THEN 'john chittwood'
    WHEN 'jorge reyes' THEN 'jorge rodriguez reyes'
    WHEN 'jose dozal' THEN 'jose l dozal'
    WHEN 'josua datray' THEN 'joshua datray'
    WHEN 'juan gaucin' THEN 'juan a gaucin'
    WHEN 'roger davis' THEN 'roger d davis'
    ELSE value
  END
  FROM cleaned;
$$;

REVOKE ALL ON FUNCTION public.normalize_labor_worker_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_labor_worker_name(text) TO service_role;

-- Approved payroll-sheet authority is joined by identity and work date. QBO Time rates
-- with trusted provenance retain precedence; positive legacy defaults remain unverified.
CREATE OR REPLACE VIEW public.project_labor_reconciliation_summary
WITH (security_invoker = true)
AS
WITH valued AS (
  SELECT
    labor.*,
    CASE
      WHEN authority.base_hourly_rate > 0 THEN authority.base_hourly_rate
      WHEN COALESCE(labor.hourly_rate, 0) > 0
        AND COALESCE(labor.rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched')
        THEN labor.hourly_rate
      ELSE NULL
    END AS effective_hourly_rate,
    CASE
      WHEN authority.base_hourly_rate > 0 THEN 'payroll_rate_sheet'
      WHEN COALESCE(labor.hourly_rate, 0) > 0
        AND COALESCE(labor.rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched')
        THEN labor.rate_source
      ELSE NULL
    END AS effective_rate_source
  FROM public.qbo_labor_entries labor
  LEFT JOIN LATERAL (
    SELECT rate.base_hourly_rate
    FROM public.labor_worker_rate_authority rate
    INNER JOIN public.labor_rate_imports rate_import ON rate_import.id = rate.import_id
    WHERE rate_import.approved_at IS NOT NULL
      AND rate_import.revoked_at IS NULL
      AND rate.normalized_name = public.normalize_labor_worker_name(labor.employee_name)
      AND labor.date >= rate.effective_start_date
      AND (rate.effective_end_date IS NULL OR labor.date <= rate.effective_end_date)
    ORDER BY rate.effective_start_date DESC
    LIMIT 1
  ) authority ON true
  WHERE labor.qbo_entry_id LIKE 'ts_%'
)
SELECT
  project_id,
  ROUND(SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0))::numeric, 2) AS total_hours,
  ROUND((SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0)) FILTER (WHERE COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet')))::numeric, 2) AS verified_rate_hours,
  ROUND((SUM(COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0)) FILTER (WHERE NOT (COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet'))))::numeric, 2) AS missing_rate_hours,
  ROUND((SUM((COALESCE(reg_hours, 0) + COALESCE(ot_hours, 0)) * effective_hourly_rate) FILTER (WHERE COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet')))::numeric, 2) AS verified_direct_wages,
  COUNT(*) AS source_row_count,
  COUNT(*) FILTER (WHERE COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet')) AS verified_rate_row_count,
  COUNT(*) FILTER (WHERE NOT (COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet'))) AS missing_rate_row_count,
  MAX(synced_at) AS labor_synced_at,
  COUNT(DISTINCT employee_name) FILTER (WHERE NOT (COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet'))) AS missing_rate_worker_count,
  COALESCE(ARRAY_AGG(DISTINCT employee_name ORDER BY employee_name) FILTER (WHERE NOT (COALESCE(effective_hourly_rate, 0) > 0 AND COALESCE(effective_rate_source, '') IN ('qbo_time_users', 'qbo_time_users_matched', 'payroll_rate_sheet'))), ARRAY[]::text[]) AS missing_rate_workers
FROM valued
GROUP BY project_id;

REVOKE ALL ON TABLE public.project_labor_reconciliation_summary FROM anon, authenticated;
GRANT SELECT ON TABLE public.project_labor_reconciliation_summary TO service_role;
