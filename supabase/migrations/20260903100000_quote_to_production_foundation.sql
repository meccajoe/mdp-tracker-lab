-- Release 1: canonical Quote Workspace and normalized revision foundation.
-- Existing ada_* table names remain compatibility storage; product ownership belongs to Tracker.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.ada_quote_workspaces
  ADD COLUMN IF NOT EXISTS workspace_number text,
  ADD COLUMN IF NOT EXISTS lifecycle_status text,
  ADD COLUMN IF NOT EXISTS lifecycle_status_reason text,
  ADD COLUMN IF NOT EXISTS current_revision_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_approved_revision_id uuid,
  ADD COLUMN IF NOT EXISTS hubspot_published_revision_id uuid,
  ADD COLUMN IF NOT EXISTS customer_accepted_revision_id uuid,
  ADD COLUMN IF NOT EXISTS operationally_released_revision_id uuid,
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

UPDATE public.ada_quote_workspaces
SET workspace_number = 'QW-' || upper(replace(id::text, '-', ''))
WHERE workspace_number IS NULL;

UPDATE public.ada_quote_workspaces
SET lifecycle_status = CASE status
  WHEN 'gathering_inputs' THEN 'intake'
  WHEN 'estimating' THEN 'draft'
  WHEN 'in_review' THEN 'internal_review'
  WHEN 'accepted' THEN 'blocked'
  WHEN 'handed_off' THEN 'blocked'
  WHEN 'archived' THEN 'archived'
  ELSE 'draft'
END,
lifecycle_status_reason = CASE
  WHEN status IN ('accepted','handed_off') THEN 'legacy_' || status || '_requires_governed_review'
  ELSE lifecycle_status_reason
END
WHERE lifecycle_status IS NULL;

ALTER TABLE public.ada_quote_workspaces ALTER COLUMN workspace_number SET NOT NULL;
ALTER TABLE public.ada_quote_workspaces ALTER COLUMN lifecycle_status SET DEFAULT 'intake';
ALTER TABLE public.ada_quote_workspaces ALTER COLUMN lifecycle_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_workspaces_workspace_number_key') THEN
    ALTER TABLE public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_workspace_number_key UNIQUE (workspace_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_workspaces_lifecycle_status_check') THEN
    ALTER TABLE public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_lifecycle_status_check CHECK (lifecycle_status IN (
      'intake','draft','internal_review','commercial_approved','published_verified','customer_accepted',
      'production_readiness_confirmed','operational_release_approved','release_approved_pending_provisioning',
      'operationally_released','active_project','completed','postmortem_review','closed',
      'archived','cancelled','expired','blocked','superseded'
    ));
  END IF;
END $$;

ALTER TABLE public.ada_quote_revisions
  ADD COLUMN IF NOT EXISTS revision_kind text NOT NULL DEFAULT 'baseline',
  ADD COLUMN IF NOT EXISTS parent_revision_id uuid,
  ADD COLUMN IF NOT EXISTS source_manifest_hash text,
  ADD COLUMN IF NOT EXISTS manifest_hash text,
  ADD COLUMN IF NOT EXISTS normalization_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS normalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS normalization_exception text,
  ADD COLUMN IF NOT EXISTS formula_policy_version text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS created_from text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS supersedes_revision_id uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_revision_kind_check') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_revision_kind_check CHECK (revision_kind IN ('baseline','revision','amendment','change_order'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_normalization_status_check') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_normalization_status_check CHECK (normalization_status IN ('pending','normalized','needs_review','mismatch'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_created_from_check') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_created_from_check CHECK (created_from IN ('human','ada_proposal','workbook_import','sheet_sync','hubspot_import'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_currency_check') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_currency_check CHECK (currency = 'USD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_id_workspace_key') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_id_workspace_key UNIQUE (id, workspace_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_parent_fk') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_parent_fk FOREIGN KEY (parent_revision_id) REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ada_quote_revisions_supersedes_fk') THEN
    ALTER TABLE public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_supersedes_fk FOREIGN KEY (supersedes_revision_id) REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE public.ada_quote_workspaces w
SET current_revision_id = (
  SELECT r.id FROM public.ada_quote_revisions r
  WHERE r.workspace_id = w.id
  ORDER BY r.revision_number DESC, r.created_at DESC, r.id DESC
  LIMIT 1
)
WHERE w.current_revision_id IS NULL
  AND EXISTS (SELECT 1 FROM public.ada_quote_revisions r WHERE r.workspace_id = w.id);

DO $$
DECLARE pointer_columns text[] := ARRAY['current_revision_id','commercial_approved_revision_id','hubspot_published_revision_id','customer_accepted_revision_id','operationally_released_revision_id'];
DECLARE constraint_names text[] := ARRAY['aqw_current_revision_fk','aqw_commercial_approved_revision_fk','aqw_hubspot_published_revision_fk','aqw_customer_accepted_revision_fk','aqw_operationally_released_revision_fk'];
DECLARE pointer_index integer;
BEGIN
  FOR pointer_index IN 1..array_length(pointer_columns, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_names[pointer_index]) THEN
      EXECUTE format(
        'ALTER TABLE public.ada_quote_workspaces ADD CONSTRAINT %I FOREIGN KEY (%I, id) REFERENCES public.ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT',
        constraint_names[pointer_index], pointer_columns[pointer_index]
      );
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.quote_revision_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_line_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  sort_order integer NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  line_type text NOT NULL,
  quantity numeric(12,4),
  unit text,
  unit_sell_price numeric(14,2),
  computed_sell_price numeric(14,2) NOT NULL,
  sell_price_override numeric(14,2),
  final_sell_price numeric(14,2) NOT NULL,
  taxability_status text,
  formula_type text,
  formula_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula_status text NOT NULL DEFAULT 'needs_input',
  production_mapping_status text NOT NULL DEFAULT 'needs_review',
  commercial_only_reason text,
  materials_other_budget numeric(14,2),
  quoted_hours numeric(12,4),
  labor_budget numeric(14,2),
  build_budget numeric(14,2),
  contingency_amount numeric(14,2),
  indirect_levy_amount numeric(14,2),
  margin_amount numeric(14,2),
  margin_pct numeric(9,6),
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT quote_revision_lines_revision_aggregate_fk FOREIGN KEY (revision_id, workspace_id) REFERENCES public.ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_revision_lines_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT quote_revision_lines_nonnegative_check CHECK (
    (quantity IS NULL OR quantity >= 0) AND computed_sell_price >= 0 AND final_sell_price >= 0 AND
    (unit_sell_price IS NULL OR unit_sell_price >= 0) AND (sell_price_override IS NULL OR sell_price_override >= 0) AND
    (materials_other_budget IS NULL OR materials_other_budget >= 0) AND (quoted_hours IS NULL OR quoted_hours >= 0) AND
    (labor_budget IS NULL OR labor_budget >= 0) AND (build_budget IS NULL OR build_budget >= 0)
  ),
  CONSTRAINT quote_revision_lines_formula_status_check CHECK (formula_status IN ('complete','needs_input','exception')),
  CONSTRAINT quote_revision_lines_mapping_status_check CHECK (production_mapping_status IN ('mapped','commercial_only','needs_review')),
  CONSTRAINT quote_revision_lines_commercial_only_reason_check CHECK (production_mapping_status <> 'commercial_only' OR nullif(btrim(commercial_only_reason), '') IS NOT NULL),
  CONSTRAINT quote_revision_lines_id_revision_workspace_key UNIQUE (id, revision_id, workspace_id),
  CONSTRAINT quote_revision_lines_revision_sort_key UNIQUE (revision_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.ada_quote_workspaces(id) ON DELETE RESTRICT,
  project_id text REFERENCES public.projects(id) ON DELETE RESTRICT,
  item_number integer NOT NULL,
  display_name text NOT NULL,
  parent_work_package_id uuid,
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  unit text,
  classification text NOT NULL DEFAULT 'fabrication',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  CONSTRAINT work_packages_item_number_check CHECK (item_number > 0),
  CONSTRAINT work_packages_quantity_check CHECK (quantity > 0),
  CONSTRAINT work_packages_classification_check CHECK (classification IN ('fabrication','graphics','resale','service','project_wide','pass_through')),
  CONSTRAINT work_packages_status_check CHECK (status IN ('draft','approved','released','active','completed','cancelled','superseded')),
  CONSTRAINT work_packages_id_workspace_key UNIQUE (id, workspace_id),
  CONSTRAINT work_packages_parent_aggregate_fk FOREIGN KEY (parent_work_package_id, workspace_id) REFERENCES public.work_packages(id, workspace_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_packages_workspace_item_active
  ON public.work_packages (workspace_id, item_number)
  WHERE archived_at IS NULL AND status NOT IN ('cancelled','superseded');
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_packages_project_item_active
  ON public.work_packages (project_id, item_number)
  WHERE project_id IS NOT NULL AND archived_at IS NULL AND status NOT IN ('cancelled','superseded');

CREATE TABLE IF NOT EXISTS public.quote_revision_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.ada_quote_revisions(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  description text,
  line_type text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  unit text,
  resale_classification text,
  materials_other_budget numeric(14,2),
  total_quoted_hours numeric(12,4),
  labor_budget numeric(14,2),
  production_notes text,
  sort_order integer NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT quote_revision_work_packages_quantity_check CHECK (quantity > 0),
  CONSTRAINT quote_revision_work_packages_nonnegative_check CHECK ((materials_other_budget IS NULL OR materials_other_budget >= 0) AND (total_quoted_hours IS NULL OR total_quoted_hours >= 0) AND (labor_budget IS NULL OR labor_budget >= 0)),
  CONSTRAINT quote_revision_work_packages_revision_work_package_key UNIQUE (revision_id, work_package_id),
  CONSTRAINT quote_revision_work_packages_id_revision_key UNIQUE (id, revision_id),
  CONSTRAINT quote_revision_work_packages_id_revision_workspace_key UNIQUE (id, revision_id, workspace_id),
  CONSTRAINT quote_revision_work_packages_revision_workspace_fk FOREIGN KEY (revision_id, workspace_id) REFERENCES public.ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_revision_work_packages_package_workspace_fk FOREIGN KEY (work_package_id, workspace_id) REFERENCES public.work_packages(id, workspace_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.quote_revision_line_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  commercial_line_id uuid NOT NULL,
  revision_work_package_id uuid NOT NULL,
  mapping_status text NOT NULL DEFAULT 'needs_review',
  allocation_basis text NOT NULL,
  allocated_quantity numeric(12,4),
  allocated_sell_amount numeric(14,2),
  allocated_hours numeric(12,4),
  allocation_pct numeric(9,6),
  notes text,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT quote_revision_line_work_packages_line_fk FOREIGN KEY (commercial_line_id, revision_id, workspace_id) REFERENCES public.quote_revision_lines(id, revision_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_revision_line_work_packages_package_fk FOREIGN KEY (revision_work_package_id, revision_id, workspace_id) REFERENCES public.quote_revision_work_packages(id, revision_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT quote_revision_line_work_packages_status_check CHECK (mapping_status IN ('mapped','commercial_only','needs_review')),
  CONSTRAINT quote_revision_line_work_packages_basis_check CHECK (allocation_basis IN ('quantity','percentage','explicit_amount','direct')),
  CONSTRAINT quote_revision_line_work_packages_nonnegative_check CHECK (
    (allocated_quantity IS NULL OR allocated_quantity >= 0) AND
    (allocated_sell_amount IS NULL OR allocated_sell_amount >= 0) AND
    (allocated_hours IS NULL OR allocated_hours >= 0) AND
    (allocation_pct IS NULL OR allocation_pct BETWEEN 0 AND 1)
  ),
  CONSTRAINT quote_revision_line_work_packages_basis_fields_check CHECK (
    (allocation_basis = 'quantity' AND allocated_quantity IS NOT NULL AND allocated_sell_amount IS NULL AND allocation_pct IS NULL) OR
    (allocation_basis = 'percentage' AND allocation_pct IS NOT NULL AND allocated_quantity IS NULL AND allocated_sell_amount IS NULL) OR
    (allocation_basis = 'explicit_amount' AND allocated_sell_amount IS NOT NULL AND allocated_quantity IS NULL AND allocation_pct IS NULL) OR
    (allocation_basis = 'direct' AND allocated_quantity IS NULL AND allocated_sell_amount IS NULL AND allocation_pct IS NULL)
  ),
  CONSTRAINT quote_revision_line_work_packages_unique_mapping UNIQUE (revision_id, commercial_line_id, revision_work_package_id)
);

CREATE TABLE IF NOT EXISTS public.work_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  qbo_service_item_name text,
  qbo_service_item_id text,
  CONSTRAINT work_types_category_check CHECK (category IN ('shop','design','install','dismantle','logistics','other'))
);

CREATE TABLE IF NOT EXISTS public.quote_revision_work_package_labor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL,
  revision_work_package_id uuid NOT NULL,
  work_type_id uuid REFERENCES public.work_types(id) ON DELETE RESTRICT,
  quoted_hours numeric(12,4) NOT NULL,
  quoted_labor_value numeric(14,2),
  allocation_origin text NOT NULL,
  allocation_status text NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  CONSTRAINT quote_revision_work_package_labor_package_fk FOREIGN KEY (revision_work_package_id, revision_id) REFERENCES public.quote_revision_work_packages(id, revision_id) ON DELETE RESTRICT,
  CONSTRAINT quote_revision_work_package_labor_hours_check CHECK (quoted_hours >= 0),
  CONSTRAINT quote_revision_work_package_labor_value_check CHECK (quoted_labor_value IS NULL OR quoted_labor_value >= 0),
  CONSTRAINT quote_revision_work_package_labor_origin_check CHECK (allocation_origin IN ('structured_input','workbook','import','reviewed_inference','unallocated')),
  CONSTRAINT quote_revision_work_package_labor_status_check CHECK (allocation_status IN ('allocated','unallocated','needs_review'))
);

CREATE OR REPLACE FUNCTION public.protect_locked_quote_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF TG_OP = 'UPDATE'
       AND to_regprocedure('public.normalize_legacy_quote_revision(uuid)') IS NOT NULL
       AND current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.normalize_legacy_quote_revision(uuid)'::regprocedure))
       AND (to_jsonb(NEW) - ARRAY['normalization_status','source_manifest_hash','manifest_hash','normalized_at','normalization_exception','locked_at'])
           = (to_jsonb(OLD) - ARRAY['normalization_status','source_manifest_hash','manifest_hash','normalized_at','normalization_exception','locked_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Locked quote revisions are immutable.' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_locked_quote_revision ON public.ada_quote_revisions;
CREATE TRIGGER protect_locked_quote_revision
  BEFORE UPDATE OR DELETE ON public.ada_quote_revisions
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_quote_revision();

CREATE OR REPLACE FUNCTION public.protect_locked_quote_revision_child()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
        SELECT 1 FROM public.ada_quote_revisions WHERE id = OLD.revision_id AND locked_at IS NOT NULL
      )) OR
     (TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
        SELECT 1 FROM public.ada_quote_revisions WHERE id = NEW.revision_id AND locked_at IS NOT NULL
      )) THEN
    RAISE EXCEPTION 'Normalized children of a locked quote revision are immutable.' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_locked_quote_revision_child ON public.quote_revision_lines;
CREATE TRIGGER protect_locked_quote_revision_child
  BEFORE UPDATE OR DELETE ON public.quote_revision_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_quote_revision_child();
DROP TRIGGER IF EXISTS prevent_insert_into_locked_quote_revision ON public.quote_revision_lines;
CREATE TRIGGER prevent_insert_into_locked_quote_revision
  BEFORE INSERT ON public.quote_revision_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_quote_revision_child();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['quote_revision_work_packages','quote_revision_line_work_packages','quote_revision_work_package_labor']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS protect_locked_quote_revision_child ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER protect_locked_quote_revision_child BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_locked_quote_revision_child()', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_insert_into_locked_quote_revision ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER prevent_insert_into_locked_quote_revision BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.protect_locked_quote_revision_child()', table_name);
  END LOOP;
END $$;

-- Governed history cannot disappear through a legacy cascade path.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conrelid::regclass AS child_table, conname,
      replace(pg_get_constraintdef(oid), 'ON DELETE CASCADE', 'ON DELETE RESTRICT') AS restricted_definition
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid IN ('public.ada_quote_workspaces'::regclass, 'public.ada_quote_revisions'::regclass)
      AND confdeltype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child_table, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.child_table, fk.conname, fk.restricted_definition);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_quote_revision_lines_workspace_revision ON public.quote_revision_lines (workspace_id, revision_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_quote_revision_work_packages_revision ON public.quote_revision_work_packages (revision_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_quote_revision_line_work_packages_revision ON public.quote_revision_line_work_packages (revision_id);
CREATE INDEX IF NOT EXISTS idx_quote_revision_work_package_labor_revision ON public.quote_revision_work_package_labor (revision_id);

ALTER TABLE public.quote_revision_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_line_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_work_package_labor ENABLE ROW LEVEL SECURITY;
