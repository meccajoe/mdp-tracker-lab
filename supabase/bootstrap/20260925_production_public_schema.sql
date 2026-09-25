-- MDP Tracker lab schema bootstrap
-- Source project: yaftybqzlbbvzwwdzlny
-- Schema-only catalog export; no production rows included.
SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET search_path = public, extensions, pg_catalog;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;


CREATE SEQUENCE public.expense_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE public.ada_chat_turns (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  client_request_id uuid NOT NULL,
  actor_email text NOT NULL,
  request_content text NOT NULL,
  status text NOT NULL,
  user_message_id uuid,
  assistant_message_id uuid,
  revision_id uuid,
  response_json jsonb,
  error_message text,
  claimed_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  proposal_id uuid
);
CREATE TABLE public.ada_feedback (
  id uuid NOT NULL,
  workspace_id uuid,
  submitted_by_email text NOT NULL,
  category text NOT NULL,
  message text NOT NULL,
  page_path text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.ada_quote_assets (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  concept_id uuid,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  analysis_status text NOT NULL,
  analysis_json jsonb,
  analysis_error text,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone,
  archived_by_email text
);
CREATE TABLE public.ada_quote_concepts (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  label text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.ada_quote_events (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  concept_id uuid,
  event_type text NOT NULL,
  payload_json jsonb,
  actor_email text,
  created_at timestamp with time zone NOT NULL,
  idempotency_key text
);
CREATE TABLE public.ada_quote_messages (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  structured_payload_json jsonb,
  created_by_email text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.ada_quote_projects (
  id uuid NOT NULL,
  title text NOT NULL,
  client_name text,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.ada_quote_revisions (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_number integer NOT NULL,
  quote_json jsonb NOT NULL,
  internal_cost numeric NOT NULL,
  sell_price numeric NOT NULL,
  margin_pct numeric NOT NULL,
  assumptions_json jsonb NOT NULL,
  evidence_json jsonb NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  revision_kind text NOT NULL,
  parent_revision_id uuid,
  source_manifest_hash text,
  manifest_hash text,
  normalization_status text NOT NULL,
  normalized_at timestamp with time zone,
  normalization_exception text,
  formula_policy_version text,
  currency text NOT NULL,
  created_from text NOT NULL,
  supersedes_revision_id uuid,
  locked_at timestamp with time zone
);
CREATE TABLE public.ada_quote_sheet_changes (
  id uuid NOT NULL,
  sheet_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  range_a1 text NOT NULL,
  values_json jsonb NOT NULL,
  status text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  applied_at timestamp with time zone
);
CREATE TABLE public.ada_quote_sheets (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  sync_status text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  last_sync_at timestamp with time zone,
  sync_conflicts_json jsonb NOT NULL
);
CREATE TABLE public.ada_quote_workspaces (
  id uuid NOT NULL,
  title text NOT NULL,
  client_name text,
  contact_name text,
  hubspot_deal_id text,
  tracker_project_id text,
  status text NOT NULL,
  last_activity_at timestamp with time zone NOT NULL,
  pinned_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  ada_project_id uuid,
  accepted_revision_id uuid,
  accepted_at timestamp with time zone,
  workspace_number text NOT NULL,
  lifecycle_status text NOT NULL,
  lifecycle_status_reason text,
  current_revision_id uuid,
  commercial_approved_revision_id uuid,
  hubspot_published_revision_id uuid,
  customer_accepted_revision_id uuid,
  operationally_released_revision_id uuid,
  row_version bigint NOT NULL
);
CREATE TABLE public.app_config (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone
);
CREATE TABLE public.billcom_sync_state (
  id integer NOT NULL,
  last_sync_at timestamp with time zone,
  last_bill_updated_time text,
  jobs_cache jsonb,
  vendors_cache jsonb,
  updated_at timestamp with time zone,
  last_sync_errors integer,
  last_sync_skipped integer,
  last_sync_error_msgs text[]
);
CREATE TABLE public.budget_formula_settings (
  category text NOT NULL,
  label text NOT NULL,
  default_pct numeric(5,2) NOT NULL,
  updated_at timestamp with time zone
);
CREATE TABLE public.cogs_categories (
  code text NOT NULL,
  name text NOT NULL,
  definition text
);
CREATE TABLE public.expenses (
  id text NOT NULL,
  project_id text NOT NULL,
  date date NOT NULL,
  category text NOT NULL,
  cogs_code text,
  vendor text,
  amount numeric(10,2) NOT NULL,
  amount_pending boolean NOT NULL,
  purchaser text,
  notes text,
  created_at timestamp with time zone NOT NULL,
  flagged boolean,
  flag_note text,
  flagged_by text,
  flagged_at timestamp with time zone,
  source text,
  external_id text,
  synced_at timestamp with time zone
);
CREATE TABLE public.financial_reconciliation_case_events (
  id uuid NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_email text,
  from_status text,
  to_status text,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.financial_reconciliation_cases (
  id uuid NOT NULL,
  project_id text NOT NULL,
  as_of_date date NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  owner_email text,
  metric_contract_version text NOT NULL,
  fingerprint text NOT NULL,
  reason text NOT NULL,
  next_action text NOT NULL,
  review_reasons jsonb NOT NULL,
  metric_snapshot jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  reopened_at timestamp with time zone,
  reopen_count integer NOT NULL,
  resolution_code text,
  resolution_notes text NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by text,
  row_version integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.formula_rebaseline_audits (
  id uuid NOT NULL,
  project_id text NOT NULL,
  formula_version text NOT NULL,
  before_budget_hrs numeric NOT NULL,
  before_budget_materials numeric NOT NULL,
  after_budget_hrs numeric NOT NULL,
  after_budget_materials numeric NOT NULL,
  formula_snapshot jsonb NOT NULL,
  applied_by text NOT NULL,
  applied_at timestamp with time zone NOT NULL,
  rollback_payload jsonb NOT NULL
);
CREATE TABLE public.integration_outbox (
  id uuid NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  destination text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  external_identity text,
  payload_json jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL,
  max_attempts integer NOT NULL,
  lease_owner text,
  lease_expires_at timestamp with time zone,
  next_attempt_at timestamp with time zone,
  last_error_code text,
  last_error_message text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  revision_id uuid,
  external_readback_json jsonb,
  external_readback_hash text,
  reconciliation_status text NOT NULL,
  reconciled_at timestamp with time zone
);
CREATE TABLE public.labor_allocation_je_reviews (
  id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  roster_snapshot_date date NOT NULL,
  source_snapshot jsonb NOT NULL,
  allocation_rows jsonb NOT NULL,
  journal_entry_lines jsonb NOT NULL,
  exception_rows jsonb NOT NULL,
  source_reconciliation jsonb NOT NULL,
  debit_total numeric(12,2) NOT NULL,
  credit_total numeric(12,2) NOT NULL,
  status text NOT NULL,
  reviewer_email text,
  reviewer_notes text NOT NULL,
  reviewed_at timestamp with time zone,
  qbo_transaction_id text,
  created_by text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.labor_allocation_mappings (
  service_item text NOT NULL,
  labor_bucket text NOT NULL,
  source_gl_account_id text NOT NULL,
  target_gl_account_id text NOT NULL,
  active boolean NOT NULL,
  notes text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.labor_entries (
  id uuid NOT NULL,
  project_id text NOT NULL,
  date date NOT NULL,
  person text NOT NULL,
  hours numeric(6,2) NOT NULL,
  labor_type text,
  notes text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.labor_rate_imports (
  id uuid NOT NULL,
  authority_scope text NOT NULL,
  source_label text NOT NULL,
  source_file_name text NOT NULL,
  source_sha256 text NOT NULL,
  source_modified_at timestamp with time zone NOT NULL,
  baseline_date date NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamp with time zone NOT NULL,
  supersedes_import_id uuid,
  imported_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by text,
  revoked_reason text
);
CREATE TABLE public.labor_reclass_draft_entries (
  draft_id uuid NOT NULL,
  qbo_entry_id text NOT NULL
);
CREATE TABLE public.labor_reclass_drafts (
  id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  source_project_id text,
  target_project_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  memo text NOT NULL,
  status text NOT NULL,
  created_by text,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  qbo_transaction_id text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.labor_worker_classifications (
  id uuid NOT NULL,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  classification text NOT NULL,
  roster_snapshot_date date NOT NULL,
  source text NOT NULL,
  notes text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.labor_worker_cost_policies (
  id uuid NOT NULL,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  cost_basis text NOT NULL,
  rate_amount numeric(10,2),
  effective_start_date date NOT NULL,
  effective_end_date date,
  source text NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamp with time zone NOT NULL,
  notes text NOT NULL
);
CREATE TABLE public.labor_worker_rate_authority (
  id uuid NOT NULL,
  import_id uuid NOT NULL,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  classification text NOT NULL,
  base_hourly_rate numeric(10,2) NOT NULL,
  effective_start_date date NOT NULL,
  effective_end_date date,
  source_row_number integer NOT NULL,
  source_note text,
  imported_at timestamp with time zone NOT NULL
);
CREATE TABLE public.master_schedule_tasks (
  id uuid NOT NULL,
  job_number text NOT NULL,
  project_name text NOT NULL,
  task text NOT NULL,
  assigned_to text NOT NULL,
  stage text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  hours numeric(6,2),
  notes text,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.material_aliases (
  id uuid NOT NULL,
  material_id uuid NOT NULL,
  alias_text text NOT NULL,
  normalized_alias_text text NOT NULL,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.material_change_log (
  id uuid NOT NULL,
  material_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  change_type text NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  changed_by text,
  changed_at timestamp with time zone NOT NULL,
  batch_id uuid
);
CREATE TABLE public.material_import_batches (
  id uuid NOT NULL,
  source_name text NOT NULL,
  source_url text,
  uploaded_by text,
  status text NOT NULL,
  workbook_hash text,
  summary jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.material_import_rows (
  id uuid NOT NULL,
  batch_id uuid NOT NULL,
  sheet_name text NOT NULL,
  source_row_number integer NOT NULL,
  raw_row jsonb NOT NULL,
  parsed_row jsonb,
  normalized_candidate jsonb,
  status text NOT NULL,
  error_text text,
  created_at timestamp with time zone NOT NULL,
  review_reasons jsonb NOT NULL
);
CREATE TABLE public.material_vendor_prices (
  id uuid NOT NULL,
  material_id uuid NOT NULL,
  vendor_id uuid,
  vendor_sku text,
  vendor_material_name text,
  vendor_dimension_text text,
  unit text,
  pack_quantity numeric(12,4),
  price numeric(12,2) NOT NULL,
  price_basis text,
  effective_date date,
  source_type text NOT NULL,
  source_ref text,
  is_current boolean NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.materials (
  id uuid NOT NULL,
  canonical_name text NOT NULL,
  category text NOT NULL,
  subcategory text,
  dimensions text,
  thickness_text text,
  base_unit text,
  default_vendor_id uuid,
  default_price numeric(12,2),
  sku_or_code text,
  finish text,
  notes text,
  search_text text GENERATED ALWAYS AS (btrim(((((((((((((((((COALESCE(canonical_name, ''::text) || ' '::text) || COALESCE(category, ''::text)) || ' '::text) || COALESCE(subcategory, ''::text)) || ' '::text) || COALESCE(dimensions, ''::text)) || ' '::text) || COALESCE(thickness_text, ''::text)) || ' '::text) || COALESCE(base_unit, ''::text)) || ' '::text) || COALESCE(sku_or_code, ''::text)) || ' '::text) || COALESCE(finish, ''::text)) || ' '::text) || COALESCE(notes, ''::text)))) STORED,
  active boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  created_by text,
  updated_by text
);
CREATE TABLE public.production_issue_notes (
  id uuid NOT NULL,
  issue_id uuid NOT NULL,
  note text NOT NULL,
  created_by text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.production_issue_photos (
  id uuid NOT NULL,
  issue_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  uploaded_by text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.production_issues (
  id uuid NOT NULL,
  project_id text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL,
  owner_label text,
  cost_impact numeric(12,2),
  schedule_impact_days integer,
  linked_vendor text,
  reported_date date NOT NULL,
  resolved_date date,
  reported_by text,
  created_by text,
  updated_by text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.project_activity_events (
  id uuid NOT NULL,
  project_id text NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  details text,
  created_by text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.project_actuals (
  project_id text NOT NULL,
  category text NOT NULL,
  manual_amount numeric(10,2),
  notes text,
  updated_at timestamp with time zone
);
CREATE TABLE public.project_completion_reviews (
  project_id text NOT NULL,
  checklist jsonb NOT NULL,
  exception_notes jsonb NOT NULL,
  reviewed_by text,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.project_conversation_threads (
  id uuid NOT NULL,
  slack_team_id text NOT NULL,
  channel_id text NOT NULL,
  thread_ts text NOT NULL,
  project_id text NOT NULL,
  created_by_slack_user_id text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  last_used_at timestamp with time zone NOT NULL
);
CREATE TABLE public.project_operational_state (
  project_id text NOT NULL,
  operational_status text NOT NULL,
  next_action text,
  blocker_summary text,
  pending_human_input text,
  context_notes text,
  target_date date,
  updated_by text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.project_portfolio_projects (
  portfolio_id uuid NOT NULL,
  project_id text NOT NULL,
  ordinal integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  monitor_json jsonb NOT NULL
);
CREATE TABLE public.project_portfolios (
  id uuid NOT NULL,
  created_by_email text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  automation_json jsonb NOT NULL
);
CREATE TABLE public.project_postmortem_lessons (
  id uuid NOT NULL,
  postmortem_id uuid NOT NULL,
  project_id text NOT NULL,
  condition_json jsonb NOT NULL,
  lesson text NOT NULL,
  recommendation text NOT NULL,
  confidence text NOT NULL,
  evidence_refs jsonb NOT NULL,
  approved_for_ada boolean NOT NULL,
  approved_by text,
  approved_at timestamp with time zone
);
CREATE TABLE public.project_postmortems (
  id uuid NOT NULL,
  project_id text NOT NULL,
  status text NOT NULL,
  source_snapshot jsonb NOT NULL,
  narrative jsonb NOT NULL,
  generated_by text,
  generated_at timestamp with time zone NOT NULL,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  error_message text
);
CREATE TABLE public.project_subscription_deliveries (
  id uuid NOT NULL,
  subscription_run_id uuid NOT NULL,
  channel text NOT NULL,
  target text,
  delivery_status text NOT NULL,
  external_message_id text,
  delivered_at timestamp with time zone,
  error_text text
);
CREATE TABLE public.project_subscription_runs (
  id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  evaluated_at timestamp with time zone NOT NULL,
  outcome text NOT NULL,
  reason text,
  snapshot_json jsonb NOT NULL
);
CREATE TABLE public.project_subscriptions (
  id uuid NOT NULL,
  project_id text,
  created_by_email text NOT NULL,
  channel text NOT NULL,
  target_json jsonb NOT NULL,
  subscription_type text NOT NULL,
  metric_key text,
  condition_operator text,
  threshold_value numeric(12,2),
  rule_json jsonb NOT NULL,
  schedule_cron text,
  status text NOT NULL,
  cooldown_minutes integer NOT NULL,
  last_evaluated_at timestamp with time zone,
  last_triggered_at timestamp with time zone,
  summary_text text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  scope_type text NOT NULL,
  scope_json jsonb NOT NULL
);
CREATE TABLE public.project_tasks (
  id uuid NOT NULL,
  project_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  owner_label text,
  due_date date,
  needs_human_input boolean NOT NULL,
  notes text,
  sort_order integer NOT NULL,
  created_by text,
  updated_by text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.projects (
  id text NOT NULL,
  name text NOT NULL,
  client text NOT NULL,
  pm text NOT NULL,
  close_date date,
  contract_amount numeric(12,2),
  status text NOT NULL,
  notes text,
  budget_hrs numeric(8,2),
  budget_design numeric(10,2),
  budget_pm numeric(10,2),
  budget_shipping numeric(10,2),
  budget_id_labor numeric(10,2),
  budget_travel numeric(10,2),
  budget_props numeric(10,2),
  budget_equipment numeric(10,2),
  budget_flooring numeric(10,2),
  project_type text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  job_number text,
  hubspot_deal_id text,
  hubspot_deal_url text,
  qbo_project_id text,
  qbo_project_url text,
  quote_design numeric(10,2),
  quote_pm numeric(10,2),
  quote_shipping numeric(10,2),
  quote_id_labor numeric(10,2),
  quote_travel numeric(10,2),
  quote_props numeric(10,2),
  quote_equipment numeric(10,2),
  quote_flooring numeric(10,2),
  pct_design numeric(5,2),
  pct_pm numeric(5,2),
  pct_shipping numeric(5,2),
  pct_id_labor numeric(5,2),
  pct_travel numeric(5,2),
  pct_props numeric(5,2),
  pct_equipment numeric(5,2),
  pct_flooring numeric(5,2),
  budget_materials numeric(10,2),
  quote_labor numeric(10,2),
  quote_materials numeric(10,2),
  pct_labor numeric(5,2),
  pct_materials numeric(5,2),
  due_date date,
  monday_board_id text,
  monday_board_url text,
  budget_rental numeric(12,2),
  quote_rental numeric(12,2),
  pct_rental numeric(5,2),
  quote_crating numeric(10,2),
  budget_crating numeric(10,2),
  pct_crating numeric(5,2),
  wip_class text,
  sales_tax_included text,
  estimated_cost_override numeric(12,2),
  wip_notes text,
  wip_updated_at timestamp with time zone,
  wip_updated_by text,
  bill_budget_uuid text,
  bill_budget_name text,
  bill_budget_seeded_at timestamp with time zone,
  bill_budget_seed_source text,
  bill_budget_last_sync_status text,
  bill_budget_last_sync_error text,
  bill_job_name_snapshot text,
  bill_budget_total_snapshot numeric(12,2),
  budget_storage numeric(10,2),
  quote_storage numeric(12,2),
  pct_storage numeric(5,2),
  hubspot_quote_id text
);
CREATE TABLE public.purchasers (
  id uuid NOT NULL,
  initials text NOT NULL,
  full_name text,
  active boolean NOT NULL
);
CREATE TABLE public.qbo_labor_entries (
  id uuid NOT NULL,
  project_id text NOT NULL,
  employee_name text NOT NULL,
  date date NOT NULL,
  reg_hours numeric(8,2) NOT NULL,
  ot_hours numeric(8,2) NOT NULL,
  hourly_rate numeric(8,2),
  qbo_entry_id text NOT NULL,
  synced_at timestamp with time zone NOT NULL,
  service_item text,
  rate_source text,
  rate_verified_at timestamp with time zone,
  qbo_time_user_id bigint,
  qbo_time_salaried boolean
);
CREATE TABLE public.qbo_project_pnl (
  project_id text NOT NULL,
  qbo_income numeric,
  qbo_expenses numeric,
  qbo_net_income numeric,
  synced_at timestamp with time zone
);
CREATE TABLE public.qbo_project_wip_metrics (
  project_id text NOT NULL,
  as_of_date date NOT NULL,
  total_billed_to_date numeric(12,2),
  total_cost_to_date numeric(12,2),
  current_year_total_billings numeric(12,2),
  current_year_total_retainage numeric(12,2),
  current_year_costs numeric(12,2),
  billing_source text NOT NULL,
  cost_source text NOT NULL,
  synced_at timestamp with time zone NOT NULL
);
CREATE TABLE public.quote_line_formula_overrides (
  quote_line_item_id uuid NOT NULL,
  formula_type text NOT NULL,
  square_feet numeric,
  frame_count numeric,
  notes text NOT NULL,
  reviewed_by text NOT NULL,
  reviewed_at timestamp with time zone NOT NULL
);
CREATE TABLE public.quote_line_items (
  id uuid NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  source_ref text,
  source_date date,
  project_id text,
  project_name text,
  sku text,
  description text,
  unit_cost numeric(12,2),
  quantity numeric(12,4),
  line_total numeric(12,2),
  vendor text,
  line_key text NOT NULL,
  raw_text text GENERATED ALWAYS AS (((((((((COALESCE(sku, ''::text) || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(project_name, ''::text)) || ' '::text) || COALESCE(vendor, ''::text)) || ' '::text) || COALESCE(source_ref, ''::text))) STORED,
  synced_at timestamp with time zone NOT NULL,
  hubspot_deal_id text
);
CREATE TABLE public.quote_proposals (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  source_revision_id uuid,
  expected_row_version bigint NOT NULL,
  status text NOT NULL,
  proposed_revision_json jsonb NOT NULL,
  proposed_assumptions_json jsonb NOT NULL,
  proposed_evidence_json jsonb NOT NULL,
  proposed_manifest_hash text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  disposed_by_email text,
  disposed_at timestamp with time zone,
  reason text,
  edited_revision_json jsonb,
  edited_assumptions_json jsonb,
  edited_evidence_json jsonb,
  disposition_manifest_hash text,
  accepted_revision_id uuid,
  creation_idempotency_key text NOT NULL,
  disposition_idempotency_key text
);
CREATE TABLE public.quote_revision_line_work_packages (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  commercial_line_id uuid NOT NULL,
  revision_work_package_id uuid NOT NULL,
  mapping_status text NOT NULL,
  allocation_basis text NOT NULL,
  allocated_quantity numeric(12,4),
  allocated_sell_amount numeric(14,2),
  allocated_hours numeric(12,4),
  allocation_pct numeric(9,6),
  notes text,
  source_ref jsonb NOT NULL
);
CREATE TABLE public.quote_revision_lines (
  id uuid NOT NULL,
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
  formula_inputs jsonb NOT NULL,
  formula_status text NOT NULL,
  production_mapping_status text NOT NULL,
  commercial_only_reason text,
  materials_other_budget numeric(14,2),
  quoted_hours numeric(12,4),
  labor_budget numeric(14,2),
  build_budget numeric(14,2),
  contingency_amount numeric(14,2),
  indirect_levy_amount numeric(14,2),
  margin_amount numeric(14,2),
  margin_pct numeric(9,6),
  source_ref jsonb NOT NULL,
  evidence_refs jsonb NOT NULL
);
CREATE TABLE public.quote_revision_normalization_exceptions (
  id uuid NOT NULL,
  revision_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  source_manifest_hash text NOT NULL,
  exception_code text NOT NULL,
  exception_path text,
  details_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by text,
  resolution_reason text
);
CREATE TABLE public.quote_revision_work_package_labor (
  id uuid NOT NULL,
  revision_id uuid NOT NULL,
  revision_work_package_id uuid NOT NULL,
  work_type_id uuid,
  quoted_hours numeric(12,4) NOT NULL,
  quoted_labor_value numeric(14,2),
  allocation_origin text NOT NULL,
  allocation_status text NOT NULL,
  source_ref jsonb NOT NULL,
  notes text
);
CREATE TABLE public.quote_revision_work_packages (
  id uuid NOT NULL,
  revision_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  work_package_id uuid NOT NULL,
  display_name text NOT NULL,
  description text,
  line_type text NOT NULL,
  quantity numeric(12,4) NOT NULL,
  unit text,
  resale_classification text,
  materials_other_budget numeric(14,2),
  total_quoted_hours numeric(12,4),
  labor_budget numeric(14,2),
  production_notes text,
  sort_order integer NOT NULL,
  source_ref jsonb NOT NULL
);
CREATE TABLE public.quote_user_capabilities (
  id uuid NOT NULL,
  user_id uuid,
  email_normalized text NOT NULL,
  capability text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamp with time zone NOT NULL,
  grant_reason text NOT NULL,
  revoked_by text,
  revoked_at timestamp with time zone,
  revoke_reason text
);
CREATE TABLE public.quote_workflow_events (
  event_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_id uuid,
  event_type text NOT NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  actor_capability text NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  prior_state text NOT NULL,
  resulting_state text NOT NULL,
  reason text,
  evidence_refs jsonb NOT NULL,
  payload_json jsonb NOT NULL,
  idempotency_key text NOT NULL
);
CREATE TABLE public.quote_workspace_members (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid,
  email_normalized text NOT NULL,
  workspace_role text NOT NULL,
  added_by text NOT NULL,
  added_at timestamp with time zone NOT NULL,
  removed_at timestamp with time zone
);
CREATE TABLE public.user_roles (
  email text NOT NULL,
  pm_initials text,
  role text NOT NULL,
  show_in_filters boolean NOT NULL,
  full_name text,
  bill_spend_email text,
  ada_access boolean NOT NULL
);
CREATE TABLE public.vendor_aliases (
  id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  alias_text text NOT NULL,
  normalized_alias_text text NOT NULL,
  source_type text,
  created_at timestamp with time zone NOT NULL
);
CREATE TABLE public.vendors (
  id uuid NOT NULL,
  name text NOT NULL,
  category text,
  active boolean NOT NULL,
  created_at timestamp with time zone
);
CREATE TABLE public.wip_report_snapshot_rows (
  id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  project_id text,
  customer text NOT NULL,
  project_number text,
  project_name text NOT NULL,
  wip_class text,
  contract_date date,
  contract_amount numeric(12,2),
  estimated_cost numeric(12,2),
  estimated_cost_source text NOT NULL,
  sales_tax_included text,
  completion_date date,
  project_status text,
  pm_initials text,
  source_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL,
  updated_contract_amount numeric(12,2),
  updated_est_cost numeric(12,2),
  updated_est_gross_profit numeric(12,2),
  est_gpm_pct numeric(12,6),
  total_billed_to_date numeric(12,2),
  total_cost_to_date numeric(12,2),
  cost_pct_complete numeric(12,6),
  revenue_earned numeric(12,2),
  job_profit_earned numeric(12,2),
  job_profit_pct_earned numeric(12,6),
  billings_in_excess_of_costs numeric(12,2),
  costs_in_excess_of_billings numeric(12,2),
  current_year_total_billings numeric(12,2),
  current_year_total_retainage numeric(12,2),
  current_year_costs numeric(12,2)
);
CREATE TABLE public.wip_report_snapshots (
  id uuid NOT NULL,
  snapshot_date date NOT NULL,
  generated_at timestamp with time zone NOT NULL,
  generated_by text,
  status text NOT NULL,
  notes text,
  filters_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE TABLE public.work_packages (
  id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  project_id text,
  item_number integer NOT NULL,
  display_name text NOT NULL,
  parent_work_package_id uuid,
  quantity numeric(12,4) NOT NULL,
  unit text,
  classification text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  created_by text NOT NULL,
  source_ref jsonb NOT NULL,
  archived_at timestamp with time zone
);
CREATE TABLE public.work_types (
  id uuid NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,
  active boolean NOT NULL,
  sort_order integer NOT NULL,
  qbo_service_item_name text,
  qbo_service_item_id text
);

CREATE OR REPLACE FUNCTION public.accept_ada_quote_revision(p_workspace_id uuid, p_revision_id uuid, p_actor_email text)
 RETURNS TABLE(commercial_approved_revision_id uuid, commercial_approved_at timestamp with time zone, already_commercially_approved boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.accept_quote_proposal(p_workspace_id uuid, p_proposal_id uuid, p_actor_email text, p_expected_row_version bigint, p_edited_revision_json jsonb DEFAULT NULL::jsonb, p_edited_assumptions_json jsonb DEFAULT NULL::jsonb, p_edited_evidence_json jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_disposition_idempotency_key text DEFAULT NULL::text)
 RETURNS quote_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals; actor text := lower(btrim(p_actor_email)); member_role text;
DECLARE revision_json jsonb; assumptions_json jsonb; evidence_json jsonb; edited boolean; accepted_hash text; revision_id uuid; revision_number integer; cost numeric; sell numeric; margin numeric; norm_status text; source_hash text; norm_hash text; norm_locked_at timestamptz; normalized_reason text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO p FROM public.quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote proposal not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_disposition_idempotency_key), '') IS NULL OR char_length(btrim(p_disposition_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Disposition idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  normalized_reason := nullif(btrim(p_reason), '');
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 2000 THEN RAISE EXCEPTION 'Acceptance reason is bounded.' USING ERRCODE = '22023'; END IF;
  edited := p_edited_revision_json IS NOT NULL OR p_edited_assumptions_json IS NOT NULL OR p_edited_evidence_json IS NOT NULL;
  IF edited AND (p_edited_revision_json IS NULL OR p_edited_assumptions_json IS NULL OR p_edited_evidence_json IS NULL) THEN RAISE EXCEPTION 'Edited acceptance requires a complete revision, assumptions, and evidence snapshot.' USING ERRCODE = '22023'; END IF;
  revision_json := coalesce(p_edited_revision_json, p.proposed_revision_json); assumptions_json := coalesce(p_edited_assumptions_json, p.proposed_assumptions_json); evidence_json := coalesce(p_edited_evidence_json, p.proposed_evidence_json);
  PERFORM public.quote_proposal_validate_snapshot(revision_json, assumptions_json, evidence_json);
  accepted_hash := public.quote_manifest_sha256(jsonb_build_object('revision', revision_json, 'assumptions', assumptions_json, 'evidence', evidence_json));
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND disposition_idempotency_key = btrim(p_disposition_idempotency_key);
  IF FOUND THEN
    IF existing.id = p_proposal_id AND existing.disposed_by_email = actor AND existing.status = 'accepted' AND existing.reason IS NOT DISTINCT FROM normalized_reason AND (existing.edited_revision_json IS NOT NULL) = edited AND existing.disposition_manifest_hash = accepted_hash THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Disposition idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Quote proposal is already terminal.' USING ERRCODE = '55000'; END IF;
  IF w.row_version <> p_expected_row_version OR p.expected_row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  SELECT coalesce(max(r.revision_number), 0) + 1 INTO revision_number FROM public.ada_quote_revisions r WHERE r.workspace_id = p_workspace_id;
  SELECT sum((value ->> 'internalCost')::numeric), sum((value ->> 'clientPrice')::numeric) INTO cost, sell FROM jsonb_array_elements(revision_json -> 'lineItems');
  margin := CASE WHEN sell = 0 THEN 0 ELSE round(((sell - cost) / sell) * 100, 6) END;
  IF edited THEN
    PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_edited', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'accepted_hash',accepted_hash,'edited',true,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-edited:' || p.id::text);
    SELECT row_version INTO p_expected_row_version FROM public.ada_quote_workspaces WHERE id=p_workspace_id;
  END IF;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_accepted', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'edited',edited,'accepted_hash',accepted_hash,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-accepted:' || p.id::text);
  SELECT row_version INTO p_expected_row_version FROM public.ada_quote_workspaces WHERE id=p_workspace_id;
  revision_id := gen_random_uuid();
  INSERT INTO public.ada_quote_revisions(id, workspace_id, revision_number, parent_revision_id, revision_kind, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_by_email, created_from, source_manifest_hash)
  VALUES (revision_id, p_workspace_id, revision_number, p.source_revision_id, CASE WHEN p.source_revision_id IS NULL THEN 'baseline' ELSE 'revision' END, revision_json, cost, sell, margin, assumptions_json, evidence_json, actor, 'ada_proposal', NULL);
  PERFORM public.normalize_legacy_quote_revision(revision_id);
  SELECT normalization_status, source_manifest_hash, manifest_hash, locked_at INTO norm_status, source_hash, norm_hash, norm_locked_at FROM public.ada_quote_revisions WHERE id=revision_id;
  IF norm_status <> 'normalized' OR source_hash IS DISTINCT FROM public.quote_manifest_sha256(revision_json) OR norm_hash IS NULL OR norm_locked_at IS NULL THEN RAISE EXCEPTION 'Accepted proposal revision did not normalize and lock.' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.append_quote_workflow_event(p_workspace_id, revision_id, 'revision_created', actor, member_role, 'edit_draft', p_expected_row_version, 'draft', normalized_reason, evidence_json, jsonb_build_object('proposal_id',p.id,'source_revision_id',p.source_revision_id,'proposal_manifest_hash',p.proposed_manifest_hash,'proposed_hash',p.proposed_manifest_hash,'accepted_hash',accepted_hash,'normalized_manifest_hash',norm_hash,'edited',edited,'expected_row_version',p_expected_row_version,'resulting_workspace_row_version',p_expected_row_version + 1,'workspace_row_version',p_expected_row_version + 1), 'proposal-revision-created:' || p.id::text);
  UPDATE public.quote_proposals SET status='accepted', disposed_by_email=actor, disposed_at=now(), reason=normalized_reason, edited_revision_json=CASE WHEN edited THEN revision_json ELSE NULL END, edited_assumptions_json=CASE WHEN edited THEN assumptions_json ELSE NULL END, edited_evidence_json=CASE WHEN edited THEN evidence_json ELSE NULL END, disposition_manifest_hash=accepted_hash, accepted_revision_id=revision_id, disposition_idempotency_key=btrim(p_disposition_idempotency_key) WHERE id=p.id RETURNING * INTO p;
  RETURN p;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.append_quote_workflow_event(p_workspace_id uuid, p_revision_id uuid, p_event_type text, p_actor_email text, p_actor_role text, p_actor_capability text, p_expected_row_version bigint, p_resulting_state text, p_reason text, p_evidence_refs jsonb, p_payload_json jsonb, p_idempotency_key text)
 RETURNS quote_workflow_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  workspace_row public.ada_quote_workspaces;
  existing_event public.quote_workflow_events;
  required_capability text;
  created_event public.quote_workflow_events;
  normalized_actor text := lower(btrim(p_actor_email));
  authenticated_actor text;
  resolved_actor_role text;
  revision_workspace_id uuid;
  capability_authorized boolean;
BEGIN
  authenticated_actor := public.current_quote_actor_email();
  IF authenticated_actor IS NULL OR authenticated_actor <> normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workspace_row FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT workspace_role INTO resolved_actor_role
  FROM public.quote_workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
    AND email_normalized = normalized_actor AND removed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_actor_role), '') IS NULL OR p_actor_role <> resolved_actor_role THEN
    RAISE EXCEPTION 'Recorded actor role does not match active workspace membership.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event FROM public.quote_workflow_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id OR existing_event.actor_email <> normalized_actor THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different workflow actor or workspace.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  IF workspace_row.row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409'; END IF;

  IF p_revision_id IS NOT NULL THEN
    SELECT workspace_id INTO revision_workspace_id FROM public.ada_quote_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
    IF revision_workspace_id <> p_workspace_id THEN
      RAISE EXCEPTION 'Quote revision does not belong to this workspace.' USING ERRCODE = '23503';
    END IF;
  END IF;

  required_capability := public.required_quote_capability(p_event_type);
  IF required_capability IS NULL THEN
    RAISE EXCEPTION 'Workflow event has no governed capability mapping.' USING ERRCODE = '42501';
  END IF;
  capability_authorized := p_actor_capability = required_capability AND (
    (resolved_actor_role = 'owner' AND required_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review','archive_workspace')) OR
    (resolved_actor_role = 'editor' AND required_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review')) OR
    (resolved_actor_role = 'reviewer' AND required_capability IN ('attach_evidence','submit_review','approve_change')) OR
    EXISTS (
      SELECT 1 FROM public.quote_user_capabilities
      WHERE user_id = auth.uid() AND email_normalized = normalized_actor
        AND revoked_at IS NULL AND capability = required_capability
    )
  );
  IF p_actor_capability = 'break_glass' AND nullif(btrim(p_reason), '') IS NOT NULL THEN
    capability_authorized := EXISTS (
      SELECT 1 FROM public.quote_user_capabilities
      WHERE user_id = auth.uid() AND email_normalized = normalized_actor
        AND revoked_at IS NULL AND capability = 'break_glass'
    );
  END IF;
  IF NOT coalesce(capability_authorized, false) THEN
    RAISE EXCEPTION 'Recorded quote capability is not authorized for this event.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_quote_transition_allowed(workspace_row.lifecycle_status, p_resulting_state, p_event_type) THEN
    RAISE EXCEPTION 'Invalid quote lifecycle transition.' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IN ('publication_requested','publication_succeeded') AND workspace_row.commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Publication must use the exact commercially approved revision.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'customer_accepted' AND workspace_row.hubspot_published_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Acceptance must use the exact verified published revision.' USING ERRCODE = 'P0001';
  ELSIF p_event_type IN ('production_readiness_confirmed','operational_release_approved','operationally_released') AND workspace_row.customer_accepted_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Release gates must use the exact customer-accepted revision.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.validate_quote_event_evidence(
    p_event_type, p_revision_id, p_reason,
    coalesce(p_evidence_refs, '[]'::jsonb), coalesce(p_payload_json, '{}'::jsonb)
  );

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_workspace_id, p_revision_id, p_event_type, normalized_actor, p_actor_role, p_actor_capability,
    workspace_row.lifecycle_status, p_resulting_state, p_reason, coalesce(p_evidence_refs, '[]'::jsonb),
    coalesce(p_payload_json, '{}'::jsonb), p_idempotency_key
  ) RETURNING * INTO created_event;

  UPDATE public.ada_quote_workspaces
  SET lifecycle_status = p_resulting_state,
      status = CASE WHEN p_event_type = 'workspace_archived' THEN 'archived' ELSE status END,
      archived_at = CASE WHEN p_event_type = 'workspace_archived' THEN now() ELSE archived_at END,
      current_revision_id = CASE
        WHEN p_event_type IN ('revision_created','revision_submitted_for_review','commercial_approved') THEN p_revision_id
        ELSE current_revision_id
      END,
      commercial_approved_revision_id = CASE
        WHEN p_event_type = 'commercial_approved' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked') THEN NULL
        ELSE commercial_approved_revision_id
      END,
      hubspot_published_revision_id = CASE
        WHEN p_event_type = 'publication_succeeded' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected') THEN NULL
        ELSE hubspot_published_revision_id
      END,
      customer_accepted_revision_id = CASE
        WHEN p_event_type = 'customer_accepted' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected','customer_acceptance_revoked_or_voided') THEN NULL
        ELSE customer_accepted_revision_id
      END,
      operationally_released_revision_id = CASE
        WHEN p_event_type = 'operationally_released' THEN p_revision_id
        WHEN p_event_type IN ('revision_created','commercial_approval_revoked','publication_drift_detected','customer_acceptance_revoked_or_voided') THEN NULL
        ELSE operationally_released_revision_id
      END,
      row_version = row_version + 1,
      last_activity_at = now()
  WHERE id = p_workspace_id;

  RETURN created_event;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.archive_ada_quote_asset(p_workspace_id uuid, p_asset_id uuid, p_actor_email text, p_idempotency_key text)
 RETURNS ada_quote_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE normalized_actor text := lower(btrim(p_actor_email));
DECLARE asset_row public.ada_quote_assets;
DECLARE workspace_lifecycle text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Evidence archive capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Evidence archive requires an idempotency key.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO asset_row FROM public.ada_quote_assets
  WHERE id = p_asset_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada asset not found for this workspace.' USING ERRCODE = 'P0002'; END IF;
  IF asset_row.archived_at IS NOT NULL THEN RETURN asset_row; END IF;
  UPDATE public.ada_quote_assets
  SET archived_at = now(), archived_by_email = normalized_actor
  WHERE id = p_asset_id RETURNING * INTO asset_row;
  INSERT INTO public.ada_quote_events (
    workspace_id, concept_id, event_type, payload_json, actor_email, idempotency_key
  ) VALUES (
    p_workspace_id, asset_row.concept_id, 'asset_archived',
    jsonb_build_object('asset_id', asset_row.id, 'original_name', asset_row.original_name),
    normalized_actor, p_idempotency_key
  );
  UPDATE public.ada_quote_workspaces SET last_activity_at = now() WHERE id = p_workspace_id;
  RETURN asset_row;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_ada_chat_turn(p_workspace_id uuid, p_actor_email text, p_client_request_id uuid, p_request_content text)
 RETURNS TABLE(turn_id uuid, turn_status text, claimed boolean, response_json jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE existing_turn public.ada_chat_turns; workspace_row public.ada_quote_workspaces; normalized_actor text := lower(btrim(p_actor_email)); turn_found boolean;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO workspace_row FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO existing_turn FROM public.ada_chat_turns WHERE workspace_id = p_workspace_id AND actor_email = normalized_actor AND client_request_id = p_client_request_id FOR UPDATE;
  turn_found := FOUND;
  IF turn_found AND existing_turn.request_content IS DISTINCT FROM p_request_content THEN RAISE EXCEPTION 'This request id belongs to different message content.' USING ERRCODE = '22023'; END IF;
  IF turn_found AND existing_turn.status = 'completed' THEN RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json; RETURN; END IF;
  IF turn_found AND existing_turn.status = 'pending' AND existing_turn.claimed_at > now() - interval '15 minutes' THEN RETURN QUERY SELECT existing_turn.id, existing_turn.status, false, existing_turn.response_json; RETURN; END IF;
  IF nullif(btrim(p_request_content), '') IS NULL OR char_length(p_request_content) > 20000 OR octet_length(p_request_content) > 80000 THEN RAISE EXCEPTION 'Ada chat request exceeds the technical size limit.' USING ERRCODE = '22023'; END IF;
  IF workspace_row.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000'; END IF;
  IF NOT turn_found THEN
    INSERT INTO public.ada_chat_turns(workspace_id, client_request_id, actor_email, request_content) VALUES (p_workspace_id, p_client_request_id, normalized_actor, p_request_content) RETURNING * INTO existing_turn;
    RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json; RETURN;
  END IF;
  UPDATE public.ada_chat_turns SET status = 'pending', claimed_at = now(), error_message = NULL, response_json = NULL, completed_at = NULL WHERE id = existing_turn.id RETURNING * INTO existing_turn;
  RETURN QUERY SELECT existing_turn.id, existing_turn.status, true, existing_turn.response_json;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_integration_outbox(p_lease_owner text, p_lease_seconds integer DEFAULT 120)
 RETURNS SETOF integration_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE claimed_id uuid;
BEGIN
  IF nullif(btrim(p_lease_owner), '') IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'A bounded lease owner and duration are required.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO claimed_id
  FROM public.integration_outbox
  WHERE attempt_count < max_attempts
    AND (
      (status IN ('pending','retryable_failed') AND coalesce(next_attempt_at, now()) <= now()) OR
      (status = 'processing' AND lease_expires_at < now())
    )
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF claimed_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    UPDATE public.integration_outbox
    SET status = 'processing', attempt_count = attempt_count + 1, lease_owner = p_lease_owner,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    WHERE id = claimed_id
    RETURNING *;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.complete_ada_proposal_chat_turn(p_workspace_id uuid, p_turn_id uuid, p_concept_id uuid, p_actor_email text, p_expected_row_version bigint, p_source_revision_id uuid, p_proposed_revision_json jsonb, p_proposed_assumptions_json jsonb, p_proposed_evidence_json jsonb, p_creation_idempotency_key text, p_assistant_content text, p_assistant_payload_json jsonb, p_proposal_delta_json jsonb, p_workspace_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.ada_chat_turns;
  m public.ada_quote_messages;
  p public.quote_proposals;
  event public.ada_quote_events;
  actor text := lower(btrim(p_actor_email));
  proposal_json jsonb := NULL;
  response jsonb;
  payload jsonb;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.ada_chat_turns WHERE id = p_turn_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ada chat turn not found.' USING ERRCODE = 'P0002'; END IF;
  IF t.actor_email IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF t.user_message_id IS NULL THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.ada_quote_messages WHERE id = t.user_message_id;
  IF NOT FOUND OR m.workspace_id IS DISTINCT FROM p_workspace_id OR m.concept_id IS DISTINCT FROM p_concept_id
     OR m.role IS DISTINCT FROM 'user' OR lower(btrim(m.created_by_email)) IS DISTINCT FROM actor
     OR m.content IS DISTINCT FROM t.request_content THEN
    RAISE EXCEPTION 'Ada chat user message provenance is invalid.' USING ERRCODE = '42501';
  END IF;
  IF t.status = 'completed' THEN
    IF t.response_json IS NULL THEN RAISE EXCEPTION 'Completed Ada chat turn has no response.' USING ERRCODE = 'P0001'; END IF;
    RETURN t.response_json;
  END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Ada chat turn is not pending.' USING ERRCODE = '55000'; END IF;
  IF p_assistant_content IS NULL OR nullif(btrim(p_assistant_content), '') IS NULL
     OR char_length(p_assistant_content) > 100000 OR octet_length(p_assistant_content) > 400000
     OR jsonb_typeof(p_assistant_payload_json) IS DISTINCT FROM 'object'
     OR (p_proposal_delta_json IS NOT NULL AND jsonb_typeof(p_proposal_delta_json) IS DISTINCT FROM 'object')
     OR octet_length(jsonb_build_object('assistantPayload', p_assistant_payload_json, 'proposalDelta', coalesce(p_proposal_delta_json, 'null'::jsonb))::text) > 1048576 THEN
    RAISE EXCEPTION 'Ada assistant response exceeds the technical size limit.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;
  IF p_assistant_content IS NULL OR jsonb_typeof(coalesce(p_assistant_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Ada assistant response is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_revision_json IS NOT NULL THEN
    p := public.create_quote_proposal(p_workspace_id, actor, p_expected_row_version, p_source_revision_id,
      p_proposed_revision_json, coalesce(p_proposed_assumptions_json, '[]'::jsonb), coalesce(p_proposed_evidence_json, '[]'::jsonb), p_creation_idempotency_key);
    proposal_json := jsonb_build_object(
      'id', p.id, 'workspaceId', p.workspace_id, 'sourceRevisionId', p.source_revision_id,
      'expectedRowVersion', p.expected_row_version, 'status', p.status,
      'proposedRevision', p.proposed_revision_json, 'proposedAssumptions', p.proposed_assumptions_json,
      'proposedEvidence', p.proposed_evidence_json, 'proposedManifestHash', p.proposed_manifest_hash,
      'createdByEmail', p.created_by_email, 'createdAt', p.created_at,
      'disposedByEmail', p.disposed_by_email, 'disposedAt', p.disposed_at, 'reason', p.reason,
      'editedRevision', p.edited_revision_json, 'editedAssumptions', p.edited_assumptions_json,
      'editedEvidence', p.edited_evidence_json, 'dispositionManifestHash', p.disposition_manifest_hash,
      'acceptedRevisionId', p.accepted_revision_id, 'creationIdempotencyKey', p.creation_idempotency_key,
      'dispositionIdempotencyKey', p.disposition_idempotency_key
    );
  END IF;
  payload := p_assistant_payload_json || jsonb_build_object('proposal', proposal_json, 'proposalDelta', p_proposal_delta_json, 'revision', NULL, 'revisionDelta', NULL);
  INSERT INTO public.ada_quote_messages(workspace_id, concept_id, role, content, structured_payload_json, created_by_email)
  VALUES (p_workspace_id, p_concept_id, 'assistant', p_assistant_content, payload, actor)
  RETURNING * INTO m;
  SELECT * INTO event FROM public.record_ada_compatibility_event(
    p_workspace_id, p_concept_id, 'chat_turn_completed', actor, 'edit_draft', p_workspace_status,
    jsonb_build_object('turn_id', t.id, 'user_message_id', t.user_message_id, 'assistant_message_id', m.id,
      'proposal_id', p.id, 'source_revision_id', p_source_revision_id, 'proposal_manifest_hash', p.proposed_manifest_hash),
    'chat-turn-completed:' || p_workspace_id::text || ':' || t.id::text
  );
  response := jsonb_build_object('userMessage', (SELECT to_jsonb(x) FROM public.ada_quote_messages x WHERE x.id = t.user_message_id),
    'assistantMessage', to_jsonb(m), 'proposal', proposal_json, 'proposalDelta', p_proposal_delta_json, 'revision', NULL, 'revisionDelta', NULL);
  UPDATE public.ada_chat_turns SET status = 'completed', assistant_message_id = m.id, proposal_id = p.id,
    response_json = response, error_message = NULL, completed_at = now() WHERE id = t.id;
  RETURN response;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_ada_quote_revision(p_workspace_id uuid, p_actor_email text, p_quote_json jsonb, p_internal_cost numeric, p_sell_price numeric, p_margin_pct numeric, p_assumptions_json jsonb DEFAULT '[]'::jsonb, p_evidence_json jsonb DEFAULT '[]'::jsonb)
 RETURNS SETOF ada_quote_revisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.create_quote_proposal(p_workspace_id uuid, p_actor_email text, p_expected_row_version bigint, p_source_revision_id uuid, p_proposed_revision_json jsonb, p_proposed_assumptions_json jsonb, p_proposed_evidence_json jsonb, p_creation_idempotency_key text)
 RETURNS quote_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals;
DECLARE actor text := lower(btrim(p_actor_email)); member_role text; proposed_hash text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_creation_idempotency_key), '') IS NULL OR char_length(btrim(p_creation_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Creation idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor
      AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  PERFORM public.quote_proposal_validate_snapshot(p_proposed_revision_json, p_proposed_assumptions_json, p_proposed_evidence_json);
  proposed_hash := public.quote_manifest_sha256(jsonb_build_object('revision', p_proposed_revision_json, 'assumptions', p_proposed_assumptions_json, 'evidence', p_proposed_evidence_json));
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND creation_idempotency_key = btrim(p_creation_idempotency_key);
  IF FOUND THEN
    IF existing.created_by_email = actor AND existing.source_revision_id IS NOT DISTINCT FROM p_source_revision_id AND existing.proposed_manifest_hash = proposed_hash THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Creation idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF w.lifecycle_status NOT IN ('intake','draft','internal_review') THEN RAISE EXCEPTION 'Proposal creation is not allowed from the current lifecycle state.' USING ERRCODE = 'P0001'; END IF;
  IF w.row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409'; END IF;
  IF p_source_revision_id IS DISTINCT FROM w.current_revision_id THEN RAISE EXCEPTION 'Proposal source must exactly match the current revision.' USING ERRCODE = '23503'; END IF;
  IF p_source_revision_id IS NOT NULL AND (w.current_revision_id IS NULL OR w.current_revision_id IS DISTINCT FROM p_source_revision_id) THEN RAISE EXCEPTION 'Proposal source must be the current revision.' USING ERRCODE = '23503'; END IF;
  IF p_source_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ada_quote_revisions WHERE id = p_source_revision_id AND workspace_id = p_workspace_id) THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.quote_proposals(workspace_id, source_revision_id, expected_row_version, proposed_revision_json, proposed_assumptions_json, proposed_evidence_json, proposed_manifest_hash, created_by_email, creation_idempotency_key)
  VALUES (p_workspace_id, p_source_revision_id, p_expected_row_version + 1, p_proposed_revision_json, p_proposed_assumptions_json, p_proposed_evidence_json, proposed_hash, actor, btrim(p_creation_idempotency_key)) RETURNING * INTO p;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p_source_revision_id, 'proposal_created', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, 'Quote proposal created', p_proposed_evidence_json, jsonb_build_object('proposal_id', p.id, 'source_revision_id', p_source_revision_id, 'expected_row_version', p_expected_row_version, 'proposal_manifest_hash', proposed_hash, 'created_from', 'ada_proposal', 'resulting_workspace_row_version', p_expected_row_version + 1, 'workspace_row_version', p_expected_row_version + 1), 'proposal-created:' || p.id::text);
  SELECT * INTO p FROM public.quote_proposals WHERE id = p.id;
  RETURN p;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_quote_workspace(p_title text, p_ada_project_id uuid DEFAULT NULL::uuid, p_client_name text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_hubspot_deal_id text DEFAULT NULL::text)
 RETURNS ada_quote_workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.current_quote_actor_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''))
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_ada_proposal_chat_user_message(p_workspace_id uuid, p_turn_id uuid, p_concept_id uuid, p_actor_email text, p_request_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.ada_chat_turns;
  m public.ada_quote_messages;
  actor text := lower(btrim(p_actor_email));
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_request_content), '') IS NULL OR char_length(p_request_content) > 20000 OR octet_length(p_request_content) > 80000 THEN
    RAISE EXCEPTION 'Ada chat request exceeds the technical size limit.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM public.ada_chat_turns WHERE id = p_turn_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR t.actor_email IS DISTINCT FROM actor OR t.request_content IS DISTINCT FROM p_request_content THEN
    RAISE EXCEPTION 'Ada chat turn context is invalid.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;
  IF t.user_message_id IS NOT NULL THEN
    SELECT * INTO m FROM public.ada_quote_messages WHERE id = t.user_message_id;
    IF FOUND THEN RETURN jsonb_build_object('userMessage', to_jsonb(m)); END IF;
    RAISE EXCEPTION 'Ada chat user message linkage is invalid.' USING ERRCODE = 'P0001';
  END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Ada chat turn is not pending.' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.ada_quote_messages(workspace_id, concept_id, role, content, created_by_email)
  VALUES (p_workspace_id, p_concept_id, 'user', p_request_content, actor)
  RETURNING * INTO m;
  UPDATE public.ada_chat_turns SET user_message_id = m.id WHERE id = t.id;
  RETURN jsonb_build_object('userMessage', to_jsonb(m));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fail_ada_chat_turn(p_workspace_id uuid, p_turn_id uuid, p_actor_email text, p_error_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE actor text := lower(btrim(p_actor_email));
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  IF NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Chat turn capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ada_chat_turns SET status = 'failed', error_message = 'Ada could not complete this chat turn.', completed_at = NULL
  WHERE id = p_turn_id AND workspace_id = p_workspace_id AND actor_email = actor AND status <> 'completed';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_expense_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id = 'EXP-' || LPAD(nextval('expense_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_quote_workspace_access(target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.quote_workspace_members m
    WHERE m.workspace_id = target_workspace_id
      AND m.user_id = auth.uid()
      AND m.email_normalized = public.current_quote_actor_email()
      AND m.removed_at IS NULL
  )
$function$
;
CREATE OR REPLACE FUNCTION public.import_labor_rate_authority(import_source_label text, import_source_file_name text, import_source_sha256 text, import_source_modified_at timestamp with time zone, import_baseline_date date, import_approved_by text, rate_rows jsonb, classification_rows jsonb, import_supersedes_id uuid DEFAULT NULL::uuid, supersession_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE email = (auth.jwt()->>'email') AND role = 'admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_quote_transition_allowed(prior text, resulting text, event_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN event_name IN ('evidence_attached','proposal_created','proposal_accepted','proposal_rejected','proposal_edited','change_requested','work_package_corrected','labor_coding_corrected','lesson_approved','lesson_withdrawn') THEN prior = resulting AND prior <> 'archived'
    WHEN event_name = 'revision_created' THEN prior IN ('intake','draft','internal_review') AND resulting = 'draft'
    WHEN event_name = 'revision_submitted_for_review' THEN prior = 'draft' AND resulting = 'internal_review'
    WHEN event_name = 'commercial_approved' THEN prior = 'internal_review' AND resulting = 'commercial_approved'
    WHEN event_name = 'commercial_approval_revoked' THEN prior = 'commercial_approved' AND resulting = 'internal_review'
    WHEN event_name = 'publication_requested' THEN prior = resulting AND prior = 'commercial_approved'
    WHEN event_name = 'publication_succeeded' THEN prior = 'commercial_approved' AND resulting = 'published_verified'
    WHEN event_name IN ('publication_failed','publication_drift_detected') THEN prior = resulting
    WHEN event_name = 'customer_accepted' THEN prior = 'published_verified' AND resulting = 'customer_accepted'
    WHEN event_name = 'customer_acceptance_revoked_or_voided' THEN prior = resulting
    WHEN event_name = 'production_readiness_confirmed' THEN prior = 'customer_accepted' AND resulting = 'production_readiness_confirmed'
    WHEN event_name = 'operational_release_approved' THEN prior = 'production_readiness_confirmed' AND resulting = 'release_approved_pending_provisioning'
    WHEN event_name = 'operationally_released' THEN prior = 'release_approved_pending_provisioning' AND resulting = 'operationally_released'
    WHEN event_name = 'project_activated' THEN prior = 'operationally_released' AND resulting = 'active_project'
    WHEN event_name = 'release_blocked' THEN resulting = 'blocked'
    WHEN event_name = 'change_approved' THEN prior = resulting
    WHEN event_name = 'project_completed' THEN prior = 'active_project' AND resulting = 'completed'
    WHEN event_name = 'postmortem_started' THEN prior = 'completed' AND resulting = 'postmortem_review'
    WHEN event_name = 'postmortem_approved' THEN prior IN ('completed','postmortem_review') AND resulting = 'closed'
    WHEN event_name = 'workspace_created' THEN prior = 'intake' AND resulting = 'intake'
    WHEN event_name = 'workspace_archived' THEN prior <> 'archived' AND resulting = 'archived'
    ELSE false
  END
$function$
;
CREATE OR REPLACE FUNCTION public.jsonb_contains_sensitive_material(value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
DECLARE entry record;
DECLARE scalar_value text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR entry IN SELECT key, json_value FROM jsonb_each(value) AS item(key, json_value)
    LOOP
      IF entry.key ~* '(authorization|token|password|secret|api.?key|connection.?string|credential|cookie)' OR
         public.jsonb_contains_sensitive_material(entry.json_value) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR entry IN SELECT json_value FROM jsonb_array_elements(value) AS item(json_value)
    LOOP
      IF public.jsonb_contains_sensitive_material(entry.json_value) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'string' THEN
    scalar_value := value #>> '{}';
    IF scalar_value <> '[REDACTED]' AND scalar_value ~* '(bearer[[:space:]]+[a-z0-9._-]{8,}|postgres(ql)?://|sk-[a-z0-9_-]{8,}|(password|secret|token|credential)[[:space:]]*[:=])' THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_labor_worker_name(worker_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_legacy_quote_revision(p_revision_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.observe_financial_reconciliation_case(p_project_id text, p_as_of_date date, p_category text, p_severity text, p_metric_contract_version text, p_fingerprint text, p_reason text, p_next_action text, p_review_reasons jsonb, p_metric_snapshot jsonb, p_source_snapshot jsonb, p_actor_email text, p_scan_scope_complete boolean DEFAULT false, p_reopen_resolved boolean DEFAULT false)
 RETURNS financial_reconciliation_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Serialize all observations for one project so concurrent scans cannot
  -- race between supersession and the one-active-case constraint.
  PERFORM pg_advisory_xact_lock(hashtextextended('financial_reconciliation:' || p_project_id, 0));

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
        AND fingerprint <> p_fingerprint
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
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_labor_rate_authority_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'labor worker rate authority rows are append-only; revoke the parent import instead';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_labor_worker_cost_policy_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'labor worker cost policies are append-only; add an effective-dated replacement by migration';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_ada_quote_asset_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote evidence is retained; archive it instead.' USING ERRCODE = '55000';
  END IF;
  IF (NEW.archived_at, NEW.archived_by_email) IS DISTINCT FROM (OLD.archived_at, OLD.archived_by_email)
     AND (
       to_regprocedure('public.archive_ada_quote_asset(uuid,uuid,text,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.archive_ada_quote_asset(uuid,uuid,text,text)'::regprocedure))
     ) THEN
    RAISE EXCEPTION 'Quote evidence archive fields may change only through the archive service.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_archived_quote_workspace_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE old_workspace_id uuid;
DECLARE new_workspace_id uuid;
DECLARE old_revision_id uuid;
DECLARE new_revision_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_workspace_id := nullif(to_jsonb(OLD) ->> 'workspace_id', '')::uuid;
    old_revision_id := nullif(to_jsonb(OLD) ->> 'revision_id', '')::uuid;
    IF old_workspace_id IS NULL AND old_revision_id IS NOT NULL THEN
      SELECT workspace_id INTO old_workspace_id
      FROM public.ada_quote_revisions
      WHERE id = old_revision_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_workspace_id := nullif(to_jsonb(NEW) ->> 'workspace_id', '')::uuid;
    new_revision_id := nullif(to_jsonb(NEW) ->> 'revision_id', '')::uuid;
    IF new_workspace_id IS NULL AND new_revision_id IS NOT NULL THEN
      SELECT workspace_id INTO new_workspace_id
      FROM public.ada_quote_revisions
      WHERE id = new_revision_id;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ada_quote_workspaces
    WHERE id IN (old_workspace_id, new_workspace_id) AND lifecycle_status = 'archived'
  ) THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_integration_outbox_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.aggregate_type, NEW.aggregate_id, NEW.destination, NEW.operation, NEW.idempotency_key, NEW.payload_json, NEW.payload_hash)
     IS DISTINCT FROM
     (OLD.aggregate_type, OLD.aggregate_id, OLD.destination, OLD.operation, OLD.idempotency_key, OLD.payload_json, OLD.payload_hash) THEN
    RAISE EXCEPTION 'Integration outbox command identity and payload are immutable.' USING ERRCODE = '55000';
  END IF;
  IF NEW.aggregate_type = 'quote_workspace' AND NEW.destination = 'hubspot' AND NEW.operation = 'publish_quote' THEN
    IF NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
      RAISE EXCEPTION 'Integration outbox publication revision is immutable.' USING ERRCODE = '55000';
    END IF;
    IF OLD.external_identity IS NOT NULL AND NEW.external_identity IS DISTINCT FROM OLD.external_identity THEN
      RAISE EXCEPTION 'Integration outbox external identity is write-once.' USING ERRCODE = '55000';
    END IF;
    IF OLD.external_readback_json IS NOT NULL AND NEW.external_readback_json IS DISTINCT FROM OLD.external_readback_json THEN
      RAISE EXCEPTION 'Integration outbox read-back evidence is write-once.' USING ERRCODE = '55000';
    END IF;
    IF OLD.external_readback_hash IS NOT NULL AND NEW.external_readback_hash IS DISTINCT FROM OLD.external_readback_hash THEN
      RAISE EXCEPTION 'Integration outbox read-back hash is write-once.' USING ERRCODE = '55000';
    END IF;
    IF OLD.reconciliation_status <> 'pending' AND
       (NEW.reconciliation_status, NEW.reconciled_at, NEW.status, NEW.completed_at, NEW.last_error_code, NEW.last_error_message)
       IS DISTINCT FROM
       (OLD.reconciliation_status, OLD.reconciled_at, OLD.status, OLD.completed_at, OLD.last_error_code, OLD.last_error_message) THEN
      RAISE EXCEPTION 'Integration outbox reconciliation is immutable.' USING ERRCODE = '55000';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_locked_quote_revision_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.protect_locked_quote_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.protect_quote_proposal_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote proposals cannot be deleted.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Terminal quote proposals are immutable.' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','disposed_by_email','disposed_at','reason','edited_revision_json','edited_assumptions_json','edited_evidence_json','disposition_manifest_hash','accepted_revision_id','disposition_idempotency_key'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','disposed_by_email','disposed_at','reason','edited_revision_json','edited_assumptions_json','edited_evidence_json','disposition_manifest_hash','accepted_revision_id','disposition_idempotency_key']) THEN
    RAISE EXCEPTION 'Proposal identity and source snapshot are immutable.' USING ERRCODE = '55000';
  END IF;
  IF NEW.status NOT IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'Only pending proposals may be disposed.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_quote_workspace_projection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.status, NEW.lifecycle_status, NEW.current_revision_id, NEW.commercial_approved_revision_id, NEW.hubspot_published_revision_id, NEW.customer_accepted_revision_id, NEW.operationally_released_revision_id)
     IS DISTINCT FROM
     (OLD.status, OLD.lifecycle_status, OLD.current_revision_id, OLD.commercial_approved_revision_id, OLD.hubspot_published_revision_id, OLD.customer_accepted_revision_id, OLD.operationally_released_revision_id)
     AND (
       to_regprocedure('public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text)'::regprocedure))
     )
     AND (
       to_regprocedure('public.record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text)') IS NULL
       OR current_user <> pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text)'::regprocedure))
     ) THEN
    RAISE EXCEPTION 'Quote lifecycle projections may change only through the workflow service.' USING ERRCODE = '42501';
  END IF;
  IF NEW.row_version = OLD.row_version THEN NEW.row_version := OLD.row_version + 1; END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.quote_actor_has_workspace_capability(p_workspace_id uuid, p_actor_email text, p_capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.quote_workspace_members member
    WHERE member.workspace_id = p_workspace_id
      AND member.user_id = auth.uid()
      AND member.email_normalized = lower(btrim(p_actor_email))
      AND member.removed_at IS NULL
      AND (
        (member.workspace_role = 'owner' AND p_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review','archive_workspace')) OR
        (member.workspace_role = 'editor' AND p_capability IN ('create_workspace','attach_evidence','edit_draft','submit_review')) OR
        (member.workspace_role = 'reviewer' AND p_capability IN ('attach_evidence','submit_review','approve_change')) OR
        EXISTS (
          SELECT 1 FROM public.quote_user_capabilities capability
          WHERE capability.user_id = auth.uid()
            AND capability.email_normalized = lower(btrim(p_actor_email))
            AND capability.capability = p_capability
            AND capability.revoked_at IS NULL
        )
      )
  )
$function$
;
CREATE OR REPLACE FUNCTION public.quote_deterministic_uuid(identity_text text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  SELECT (
    substr(md5(identity_text), 1, 8) || '-' ||
    substr(md5(identity_text), 9, 4) || '-' ||
    '5' || substr(md5(identity_text), 14, 3) || '-' ||
    '8' || substr(md5(identity_text), 18, 3) || '-' ||
    substr(md5(identity_text), 21, 12)
  )::uuid
$function$
;
CREATE OR REPLACE FUNCTION public.quote_manifest_sha256(value jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT encode(digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex');
$function$
;
CREATE OR REPLACE FUNCTION public.quote_proposal_validate_snapshot(p_revision jsonb, p_assumptions jsonb, p_evidence jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE item jsonb; evidence_ref jsonb; assumption jsonb;
BEGIN
  IF public.jsonb_contains_sensitive_material(jsonb_build_object('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence)) THEN
    RAISE EXCEPTION 'Proposal snapshots cannot contain credential-shaped material.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_revision) IS DISTINCT FROM 'object' OR jsonb_typeof(p_revision -> 'lineItems') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_revision -> 'lineItems') = 0 THEN
    RAISE EXCEPTION 'Proposal revision must contain a non-empty lineItems array.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_assumptions) IS DISTINCT FROM 'array' OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Proposal assumptions and evidence must be arrays.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_revision -> 'lineItems') > 500 OR jsonb_array_length(p_assumptions) > 200 OR jsonb_array_length(p_evidence) > 500
     OR octet_length(jsonb_build_object('revision', p_revision, 'assumptions', p_assumptions, 'evidence', p_evidence)::text) > 1048576 THEN
    RAISE EXCEPTION 'Proposal snapshot exceeds the technical size bound.' USING ERRCODE = '22023';
  END IF;
  FOR assumption IN SELECT value FROM jsonb_array_elements(p_assumptions) LOOP
    IF jsonb_typeof(assumption) <> 'string' THEN RAISE EXCEPTION 'Proposal assumptions must contain only strings.' USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_revision -> 'lineItems') LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item -> 'itemName') IS DISTINCT FROM 'string' OR nullif(btrim(item ->> 'itemName'), '') IS NULL
       OR jsonb_typeof(item -> 'buildItem') IS DISTINCT FROM 'string' OR nullif(btrim(item ->> 'buildItem'), '') IS NULL
       OR coalesce(item ->> 'lineType', '') NOT IN ('material', 'labor')
       OR jsonb_typeof(item -> 'internalCost') IS DISTINCT FROM 'number' OR (CASE WHEN jsonb_typeof(item -> 'internalCost') = 'number' THEN (item ->> 'internalCost')::numeric ELSE 0 END) < 0
       OR jsonb_typeof(item -> 'clientPrice') IS DISTINCT FROM 'number' OR (CASE WHEN jsonb_typeof(item -> 'clientPrice') = 'number' THEN (item ->> 'clientPrice')::numeric ELSE 0 END) < 0
       OR coalesce(item ->> 'confidence', '') NOT IN ('high', 'medium', 'low')
       OR jsonb_typeof(item -> 'evidenceRefs') IS DISTINCT FROM 'array'
       OR (item ? 'pricingBasis' AND (jsonb_typeof(item -> 'pricingBasis') IS DISTINCT FROM 'string' OR coalesce(item ->> 'pricingBasis', '') NOT IN ('user_input', 'tracker_evidence', 'expert_estimate', 'blended')))
       OR (item ? 'assumption' AND jsonb_typeof(item -> 'assumption') IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION 'Proposal lineItems contain an invalid line schema.' USING ERRCODE = '22023';
    END IF;
    FOR evidence_ref IN SELECT value FROM jsonb_array_elements(item -> 'evidenceRefs') LOOP
      IF jsonb_typeof(evidence_ref) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Proposal evidenceRefs must contain only strings.' USING ERRCODE = '22023'; END IF;
    END LOOP;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.quote_publication_reconciliation_event(p_outbox integration_outbox, p_revision ada_quote_revisions, p_matches boolean, p_approval_current boolean, p_current_lifecycle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE event_key text := 'quote-publication-reconciliation:' || p_outbox.id::text;
DECLARE verified boolean := p_matches AND p_approval_current;
DECLARE event_reason text := CASE
  WHEN verified THEN 'Verified HubSpot publication read-back.'
  WHEN NOT p_approval_current THEN 'Publication read-back matched external evidence, but workspace approval state or revision drifted before reconciliation.'
  ELSE 'HubSpot publication read-back identity or hash drift detected.'
END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.quote_workflow_events WHERE idempotency_key = event_key) THEN
    RETURN;
  END IF;

  PERFORM public.validate_quote_event_evidence(
    CASE WHEN verified THEN 'publication_succeeded' ELSE 'publication_drift_detected' END,
    p_outbox.revision_id,
    event_reason,
    jsonb_build_array(jsonb_build_object('type','integration_outbox','outbox_id',p_outbox.id::text)),
    jsonb_build_object(
      'outbox_id', p_outbox.id,
      'readback_verified', verified,
      'approval_state_current', p_approval_current,
      'manifest_hash', p_revision.manifest_hash,
      'external_identity', p_outbox.external_identity
    )
  );

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_outbox.aggregate_id::uuid, p_outbox.revision_id,
    CASE WHEN verified THEN 'publication_succeeded' ELSE 'publication_drift_detected' END,
    'service_role@internal', 'service', 'verify_publication',
    CASE WHEN verified THEN 'commercial_approved' ELSE p_current_lifecycle END,
    CASE WHEN verified THEN 'published_verified' ELSE p_current_lifecycle END,
    event_reason,
    jsonb_build_array(jsonb_build_object('type','integration_outbox','outbox_id',p_outbox.id::text)),
    jsonb_build_object('outbox_id',p_outbox.id, 'readback_verified',verified, 'approval_state_current',p_approval_current, 'manifest_hash',p_revision.manifest_hash, 'external_identity',p_outbox.external_identity),
    event_key
  );

  IF verified THEN
    UPDATE public.ada_quote_workspaces
    SET lifecycle_status = 'published_verified',
        hubspot_published_revision_id = p_outbox.revision_id,
        row_version = row_version + 1,
        last_activity_at = now()
    WHERE id = p_outbox.aggregate_id::uuid;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_ada_compatibility_event(p_workspace_id uuid, p_concept_id uuid, p_event_type text, p_actor_email text, p_actor_capability text, p_workspace_status text, p_payload_json jsonb, p_idempotency_key text)
 RETURNS ada_quote_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_actor text := lower(btrim(p_actor_email));
  required_capability text;
  existing_event public.ada_quote_events;
  created_event public.ada_quote_events;
  workspace_lifecycle text;
  is_atomic_proposal_chat_event boolean := false;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_idempotency_key), '') IS NULL OR jsonb_typeof(coalesce(p_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'A compatibility event requires an idempotency key and object payload.' USING ERRCODE = '22023';
  END IF;
  IF public.jsonb_contains_sensitive_material(coalesce(p_payload_json, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Compatibility event payload contains credential-shaped material.' USING ERRCODE = '22023';
  END IF;

  required_capability := CASE p_event_type
    WHEN 'asset_uploaded' THEN 'attach_evidence'
    WHEN 'drawing_initial_quote_created' THEN 'edit_draft'
    WHEN 'chat_turn_completed' THEN 'edit_draft'
    ELSE NULL
  END;
  IF required_capability IS NULL OR p_actor_capability <> required_capability OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, required_capability) THEN
    RAISE EXCEPTION 'Compatibility event capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF (p_event_type = 'asset_uploaded' AND p_workspace_status IS DISTINCT FROM 'gathering_inputs') OR
     (p_event_type = 'drawing_initial_quote_created' AND p_workspace_status IS DISTINCT FROM 'in_review') OR
     (p_event_type = 'chat_turn_completed' AND p_workspace_status IS NOT NULL AND p_workspace_status NOT IN ('gathering_inputs','in_review')) THEN
    RAISE EXCEPTION 'Compatibility event requested an invalid workspace status projection.' USING ERRCODE = '22023';
  END IF;
  IF p_concept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ada_quote_concepts WHERE id = p_concept_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Compatibility concept does not belong to this workspace.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO existing_event FROM public.ada_quote_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id OR lower(existing_event.actor_email) <> normalized_actor THEN
      RAISE EXCEPTION 'Idempotency key belongs to another compatibility actor or workspace.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  IF p_event_type = 'chat_turn_completed' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.ada_chat_turns AS turn
      JOIN public.ada_quote_messages AS user_message ON user_message.id = turn.user_message_id
      JOIN public.quote_proposals AS proposal
        ON proposal.workspace_id = turn.workspace_id
       AND proposal.creation_idempotency_key = 'ada-chat-turn:' || turn.id::text
      JOIN public.ada_quote_messages AS assistant_message
        ON assistant_message.workspace_id = turn.workspace_id
       AND assistant_message.id::text = p_payload_json ->> 'assistant_message_id'
      WHERE turn.workspace_id = p_workspace_id
        AND proposal.workspace_id = p_workspace_id
        AND user_message.workspace_id = p_workspace_id
        AND assistant_message.workspace_id = p_workspace_id
        AND turn.status = 'pending'
        AND lower(turn.actor_email) = normalized_actor
        AND lower(proposal.created_by_email) = normalized_actor
        AND lower(assistant_message.created_by_email) = normalized_actor
        AND assistant_message.role = 'assistant'
        AND turn.id::text = p_payload_json ->> 'turn_id'
        AND user_message.id::text = p_payload_json ->> 'user_message_id'
        AND proposal.id::text = p_payload_json ->> 'proposal_id'
        AND assistant_message.structured_payload_json -> 'proposal' ->> 'id' = proposal.id::text
    ) INTO is_atomic_proposal_chat_event;
  END IF;

  INSERT INTO public.ada_quote_events (
    workspace_id, concept_id, event_type, payload_json, actor_email, idempotency_key
  ) VALUES (
    p_workspace_id, p_concept_id, p_event_type, coalesce(p_payload_json, '{}'::jsonb), normalized_actor, p_idempotency_key
  ) RETURNING * INTO created_event;

  IF NOT is_atomic_proposal_chat_event THEN
    UPDATE public.ada_quote_workspaces
    SET status = CASE
          WHEN lifecycle_status IN ('intake', 'draft', 'internal_review') THEN coalesce(p_workspace_status, status)
          ELSE status
        END,
        last_activity_at = now()
    WHERE id = p_workspace_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  END IF;

  RETURN created_event;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_quote_normalization_exception(p_revision_id uuid, p_workspace_id uuid, p_source_hash text, p_code text, p_path text, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.quote_revision_normalization_exceptions (
    revision_id, workspace_id, source_manifest_hash, exception_code, exception_path, details_json
  ) VALUES (
    p_revision_id, p_workspace_id, p_source_hash, p_code, p_path, coalesce(p_details, '{}'::jsonb)
  ) ON CONFLICT DO NOTHING;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_quote_publication_readback(p_outbox_id uuid, p_lease_owner text, p_external_identity text, p_readback_json jsonb, p_readback_sha256 text)
 RETURNS integration_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE row public.integration_outbox; result public.integration_outbox; revision_row public.ada_quote_revisions; workspace_row public.ada_quote_workspaces; matches boolean; approval_current boolean; verified boolean;
BEGIN
  IF p_outbox_id IS NULL OR p_lease_owner IS NULL OR p_external_identity IS NULL OR p_readback_json IS NULL OR p_readback_sha256 IS NULL OR
     nullif(btrim(p_lease_owner), '') IS NULL OR nullif(btrim(p_external_identity), '') IS NULL OR
     p_readback_sha256 IS DISTINCT FROM lower(p_readback_sha256) OR p_readback_sha256 IS DISTINCT FROM btrim(p_readback_sha256) OR
     p_readback_sha256 !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_readback_json) IS DISTINCT FROM 'object' OR
     public.jsonb_contains_sensitive_material(p_readback_json) THEN
    RAISE EXCEPTION 'Publication read-back is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO row FROM public.integration_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Integration outbox command not found.' USING ERRCODE = 'P0002'; END IF;
  IF row.aggregate_type <> 'quote_workspace' OR row.destination <> 'hubspot' OR row.operation <> 'publish_quote' THEN RAISE EXCEPTION 'Outbox command is not a quote publication.' USING ERRCODE = '22023'; END IF;
  IF row.status IN ('succeeded','terminal_failed') AND row.external_readback_json IS NOT NULL THEN
    IF row.external_identity = p_external_identity AND row.external_readback_json = p_readback_json AND row.external_readback_hash = p_readback_sha256 THEN RETURN row; END IF;
    RAISE EXCEPTION 'Publication read-back evidence conflicts with completed evidence.' USING ERRCODE = '23505';
  END IF;
  IF row.status <> 'processing' OR row.lease_owner IS NULL OR row.lease_owner <> p_lease_owner OR row.lease_expires_at IS NULL OR row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Publication lease is not held by the supplied worker.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO workspace_row FROM public.ada_quote_workspaces WHERE id = row.aggregate_id::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO revision_row FROM public.ada_quote_revisions WHERE id = row.revision_id;
  approval_current := workspace_row.lifecycle_status = 'commercial_approved' AND workspace_row.commercial_approved_revision_id = row.revision_id;
  matches := (row.payload_json ->> 'dealId') IS NOT DISTINCT FROM p_external_identity AND row.payload_hash IS NOT DISTINCT FROM p_readback_sha256;
  verified := matches AND approval_current;
  UPDATE public.integration_outbox SET
    external_identity = p_external_identity, external_readback_json = p_readback_json, external_readback_hash = p_readback_sha256,
    reconciliation_status = CASE WHEN verified THEN 'verified' ELSE 'drifted' END, reconciled_at = now(),
    status = CASE WHEN verified THEN 'succeeded' ELSE 'terminal_failed' END, lease_owner = NULL, lease_expires_at = NULL,
    completed_at = CASE WHEN verified THEN now() ELSE NULL END, next_attempt_at = NULL,
    last_error_code = CASE WHEN verified THEN NULL WHEN NOT approval_current THEN 'PUBLICATION_APPROVAL_STATE_DRIFT' WHEN (row.payload_json ->> 'dealId') IS DISTINCT FROM p_external_identity THEN 'PUBLICATION_READBACK_IDENTITY_MISMATCH' ELSE 'PUBLICATION_READBACK_HASH_MISMATCH' END,
    last_error_message = CASE WHEN verified THEN NULL WHEN NOT approval_current THEN 'Publication read-back matched external evidence, but workspace approval state or revision drifted before reconciliation.' ELSE 'Publication read-back did not match the prepared command identity or payload hash.' END
  WHERE id = p_outbox_id RETURNING * INTO result;
  PERFORM public.quote_publication_reconciliation_event(result, revision_row, matches, approval_current, workspace_row.lifecycle_status);
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_append_only_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only.', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_quote_proposal(p_workspace_id uuid, p_proposal_id uuid, p_actor_email text, p_expected_row_version bigint, p_reason text, p_disposition_idempotency_key text)
 RETURNS quote_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w public.ada_quote_workspaces; p public.quote_proposals; existing public.quote_proposals; actor text := lower(btrim(p_actor_email)); member_role text; normalized_reason text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO p FROM public.quote_proposals WHERE id = p_proposal_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote proposal not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT workspace_role INTO member_role FROM public.quote_workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND workspace_role IN ('owner','editor') AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active editor membership required.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(p_disposition_idempotency_key), '') IS NULL OR char_length(btrim(p_disposition_idempotency_key)) > 200 THEN RAISE EXCEPTION 'Disposition idempotency key is required and bounded.' USING ERRCODE = '22023'; END IF;
  normalized_reason := nullif(btrim(p_reason), '');
  IF normalized_reason IS NULL OR char_length(normalized_reason) > 2000 THEN RAISE EXCEPTION 'Rejection reason is required and bounded.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO existing FROM public.quote_proposals WHERE workspace_id = p_workspace_id AND disposition_idempotency_key = btrim(p_disposition_idempotency_key);
  IF FOUND THEN
    IF existing.id = p_proposal_id AND existing.disposed_by_email = actor AND existing.status = 'rejected' AND existing.reason = normalized_reason THEN RETURN existing; END IF;
    RAISE EXCEPTION 'Disposition idempotency key was reused with a different request.' USING ERRCODE = '23505';
  END IF;
  IF w.archived_at IS NOT NULL OR w.lifecycle_status = 'archived' THEN RAISE EXCEPTION 'Archived Quote Workspace is immutable.' USING ERRCODE = '55000'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Quote proposal is already terminal.' USING ERRCODE = '55000'; END IF;
  IF w.row_version <> p_expected_row_version OR p.expected_row_version <> p_expected_row_version THEN RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409'; END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR nullif(btrim(p_disposition_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason and idempotency key are required.' USING ERRCODE = '22023'; END IF;
  UPDATE public.quote_proposals SET status='rejected', disposed_by_email=actor, disposed_at=now(), reason=normalized_reason, disposition_idempotency_key=btrim(p_disposition_idempotency_key) WHERE id=p.id RETURNING * INTO p;
  PERFORM public.append_quote_workflow_event(p_workspace_id, p.source_revision_id, 'proposal_rejected', actor, member_role, 'edit_draft', p_expected_row_version, w.lifecycle_status, p.reason, p.proposed_evidence_json, jsonb_build_object('proposal_id', p.id, 'source_revision_id', p.source_revision_id, 'proposal_manifest_hash', p.proposed_manifest_hash, 'expected_row_version', p_expected_row_version, 'resulting_workspace_row_version', p_expected_row_version + 1, 'workspace_row_version', p_expected_row_version + 1), 'proposal-rejected:' || p.id::text);
  RETURN p;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rename_quote_workspace(p_workspace_id uuid, p_actor_email text, p_title text)
 RETURNS ada_quote_workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_actor text := lower(btrim(p_actor_email));
  workspace_lifecycle text;
  updated_workspace public.ada_quote_workspaces;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor
     OR NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Workspace rename capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Quote title is required.' USING ERRCODE = '22023';
  END IF;

  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.ada_quote_workspaces
  SET title = btrim(p_title), last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO updated_workspace;
  RETURN updated_workspace;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_quote_publication(p_workspace_id uuid, p_revision_id uuid, p_actor_email text, p_expected_row_version bigint, p_prepared_command jsonb, p_payload_hash text, p_idempotency_key text)
 RETURNS integration_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE w public.ada_quote_workspaces; r public.ada_quote_revisions; existing public.integration_outbox; result public.integration_outbox;
DECLARE actor text; actor_role text; event_key text;
BEGIN
  IF p_workspace_id IS NULL OR p_revision_id IS NULL OR p_actor_email IS NULL OR p_expected_row_version IS NULL OR
     p_prepared_command IS NULL OR p_payload_hash IS NULL OR p_idempotency_key IS NULL OR
     nullif(btrim(p_actor_email), '') IS NULL OR nullif(btrim(p_idempotency_key), '') IS NULL OR
     p_payload_hash IS DISTINCT FROM lower(p_payload_hash) OR p_payload_hash IS DISTINCT FROM btrim(p_payload_hash) OR
     p_payload_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_prepared_command) IS DISTINCT FROM 'object' OR
     public.jsonb_contains_sensitive_material(p_prepared_command) THEN
    RAISE EXCEPTION 'Publication command is invalid.' USING ERRCODE = '22023';
  END IF;
  actor := lower(btrim(p_actor_email));
  IF public.current_quote_actor_email() IS DISTINCT FROM actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, actor, 'request_publication') THEN
    RAISE EXCEPTION 'Publication request capability is not authorized.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF w.lifecycle_status <> 'commercial_approved' OR nullif(btrim(w.hubspot_deal_id), '') IS NULL OR w.commercial_approved_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Quote Workspace is not eligible for publication.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO r FROM public.ada_quote_revisions WHERE id = p_revision_id AND workspace_id = p_workspace_id;
  IF NOT FOUND OR r.normalization_status <> 'normalized' OR r.locked_at IS NULL OR nullif(btrim(r.source_manifest_hash), '') IS NULL OR nullif(btrim(r.manifest_hash), '') IS NULL THEN
    RAISE EXCEPTION 'Quote revision is not a stable normalized locked revision.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_prepared_command ->> 'destination') IS DISTINCT FROM 'hubspot' OR
     (p_prepared_command ->> 'operation') IS DISTINCT FROM 'publish_quote' OR
     (p_prepared_command ->> 'workspaceId') IS DISTINCT FROM p_workspace_id::text OR
     (p_prepared_command ->> 'revisionId') IS DISTINCT FROM p_revision_id::text OR
     (p_prepared_command ->> 'dealId') IS DISTINCT FROM w.hubspot_deal_id OR
     (p_prepared_command ->> 'currency') IS DISTINCT FROM 'USD' OR
     jsonb_typeof(p_prepared_command -> 'lines') IS DISTINCT FROM 'array' OR
     coalesce(jsonb_array_length(p_prepared_command -> 'lines'), 0) = 0 OR
     (p_prepared_command ->> 'payloadHash') IS DISTINCT FROM p_payload_hash OR
     (p_prepared_command ->> 'idempotencyKey') IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'Prepared publication command identity is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing FROM public.integration_outbox WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.aggregate_type IS DISTINCT FROM 'quote_workspace' OR existing.aggregate_id IS DISTINCT FROM p_workspace_id::text OR
       existing.destination IS DISTINCT FROM 'hubspot' OR existing.operation IS DISTINCT FROM 'publish_quote' OR
       existing.revision_id IS DISTINCT FROM p_revision_id OR existing.payload_hash IS DISTINCT FROM p_payload_hash OR
       existing.payload_json IS DISTINCT FROM p_prepared_command THEN
      RAISE EXCEPTION 'Publication idempotency key conflicts with an existing command.' USING ERRCODE = '23505';
    END IF;
    IF w.row_version <> p_expected_row_version THEN
      RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409';
    END IF;
    RETURN existing;
  END IF;

  IF w.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409';
  END IF;
  SELECT workspace_role INTO actor_role FROM public.quote_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND email_normalized = actor AND removed_at IS NULL;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501'; END IF;
  event_key := 'quote-publication-request:' || p_workspace_id::text || ':' || p_revision_id::text || ':' || p_idempotency_key;
  INSERT INTO public.integration_outbox (
    aggregate_type, aggregate_id, destination, operation, idempotency_key, revision_id, payload_json, payload_hash, max_attempts
  ) VALUES ('quote_workspace', p_workspace_id::text, 'hubspot', 'publish_quote', p_idempotency_key, p_revision_id, p_prepared_command, p_payload_hash, 8)
  RETURNING * INTO result;
  PERFORM public.append_quote_workflow_event(
    p_workspace_id, p_revision_id, 'publication_requested', actor, actor_role, 'request_publication',
    p_expected_row_version, w.lifecycle_status, 'Quote publication requested', '[]'::jsonb,
    jsonb_build_object('outbox_id', result.id, 'idempotency_key', p_idempotency_key, 'payload_hash', p_payload_hash), event_key
  );
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.required_quote_capability(event_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE event_name
    WHEN 'workspace_created' THEN 'create_workspace'
    WHEN 'evidence_attached' THEN 'attach_evidence'
    WHEN 'proposal_created' THEN 'edit_draft'
    WHEN 'proposal_accepted' THEN 'edit_draft'
    WHEN 'proposal_rejected' THEN 'edit_draft'
    WHEN 'proposal_edited' THEN 'edit_draft'
    WHEN 'revision_created' THEN 'edit_draft'
    WHEN 'revision_submitted_for_review' THEN 'submit_review'
    WHEN 'commercial_approved' THEN 'approve_commercial'
    WHEN 'commercial_approval_revoked' THEN 'approve_commercial'
    WHEN 'publication_requested' THEN 'request_publication'
    WHEN 'publication_succeeded' THEN 'verify_publication'
    WHEN 'publication_failed' THEN 'verify_publication'
    WHEN 'publication_drift_detected' THEN 'verify_publication'
    WHEN 'customer_accepted' THEN 'record_manual_acceptance'
    WHEN 'customer_acceptance_revoked_or_voided' THEN 'record_manual_acceptance'
    WHEN 'production_readiness_confirmed' THEN 'confirm_readiness'
    WHEN 'operational_release_approved' THEN 'approve_release'
    WHEN 'operationally_released' THEN 'execute_release'
    WHEN 'release_blocked' THEN 'block_release'
    WHEN 'change_requested' THEN 'edit_draft'
    WHEN 'change_approved' THEN 'approve_change'
    WHEN 'work_package_corrected' THEN 'approve_change'
    WHEN 'labor_coding_corrected' THEN 'correct_labor_coding'
    WHEN 'project_activated' THEN 'execute_release'
    WHEN 'project_completed' THEN 'execute_release'
    WHEN 'postmortem_started' THEN 'approve_postmortem'
    WHEN 'postmortem_approved' THEN 'approve_postmortem'
    WHEN 'lesson_approved' THEN 'approve_lesson'
    WHEN 'lesson_withdrawn' THEN 'approve_lesson'
    WHEN 'workspace_archived' THEN 'archive_workspace'
    ELSE NULL
  END
$function$
;
CREATE OR REPLACE FUNCTION public.restore_quote_workspace(p_workspace_id uuid, p_actor_email text, p_expected_row_version bigint, p_reason text, p_idempotency_key text)
 RETURNS quote_workflow_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  workspace_row public.ada_quote_workspaces;
  archive_event public.quote_workflow_events;
  existing_event public.quote_workflow_events;
  created_event public.quote_workflow_events;
  normalized_actor text := lower(btrim(p_actor_email));
  authenticated_actor text;
  resolved_actor_role text;
  restored_state text;
  restored_status text;
  capability_authorized boolean;
BEGIN
  authenticated_actor := public.current_quote_actor_email();
  IF authenticated_actor IS NULL OR authenticated_actor <> normalized_actor THEN
    RAISE EXCEPTION 'Authenticated quote actor does not match the requested actor.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Restore reason and idempotency key are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO workspace_row
  FROM public.ada_quote_workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT workspace_role INTO resolved_actor_role
  FROM public.quote_workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
    AND email_normalized = normalized_actor
    AND removed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Quote Workspace membership required.' USING ERRCODE = '42501';
  END IF;

  capability_authorized := resolved_actor_role = 'owner' OR EXISTS (
    SELECT 1
    FROM public.quote_user_capabilities
    WHERE user_id = auth.uid()
      AND email_normalized = normalized_actor
      AND capability = 'archive_workspace'
      AND revoked_at IS NULL
  );
  IF NOT capability_authorized THEN
    RAISE EXCEPTION 'Archive workspace capability required for restore.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event
  FROM public.quote_workflow_events
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.workspace_id <> p_workspace_id
       OR existing_event.actor_email <> normalized_actor
       OR existing_event.event_type <> 'workspace_restored' THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different workflow action.' USING ERRCODE = '23505';
    END IF;
    RETURN existing_event;
  END IF;

  IF workspace_row.lifecycle_status <> 'archived' THEN
    RAISE EXCEPTION 'Only archived Quote Workspaces can be restored.' USING ERRCODE = '55000';
  END IF;
  IF workspace_row.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Stale Quote Workspace row version.' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO archive_event
  FROM public.quote_workflow_events
  WHERE workspace_id = p_workspace_id
    AND event_type = 'workspace_archived'
  ORDER BY occurred_at DESC, event_id DESC
  LIMIT 1;
  IF NOT FOUND OR archive_event.prior_state = 'archived' THEN
    RAISE EXCEPTION 'A valid prior archive event is required for restore.' USING ERRCODE = 'P0001';
  END IF;

  restored_state := archive_event.prior_state;
  restored_status := archive_event.payload_json ->> 'previous_status';
  IF restored_status IS NULL OR restored_status NOT IN ('draft','gathering_inputs','estimating','in_review','accepted','handed_off') THEN
    restored_status := CASE
      WHEN restored_state = 'intake' THEN 'draft'
      WHEN restored_state = 'draft' THEN 'draft'
      WHEN restored_state = 'internal_review' THEN 'in_review'
      WHEN restored_state IN ('commercial_approved','published_verified','customer_accepted') THEN 'accepted'
      ELSE 'handed_off'
    END;
  END IF;

  UPDATE public.ada_quote_workspaces
  SET lifecycle_status = restored_state,
      status = restored_status,
      archived_at = NULL,
      row_version = row_version + 1,
      last_activity_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.quote_workflow_events (
    workspace_id, revision_id, event_type, actor_email, actor_role, actor_capability,
    prior_state, resulting_state, reason, evidence_refs, payload_json, idempotency_key
  ) VALUES (
    p_workspace_id, NULL, 'workspace_restored', normalized_actor, resolved_actor_role, 'archive_workspace',
    'archived', restored_state, btrim(p_reason), '[]'::jsonb,
    jsonb_build_object(
      'archive_event_id', archive_event.event_id,
      'restored_lifecycle_status', restored_state,
      'restored_status', restored_status
    ),
    btrim(p_idempotency_key)
  ) RETURNING * INTO created_event;

  RETURN created_event;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.revoke_labor_rate_import(target_import_id uuid, actor text, reason text)
 RETURNS labor_rate_imports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_ada_feedback_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.supersede_financial_reconciliation_cases(p_project_id text, p_actor_email text, p_reason text DEFAULT 'The latest complete scan found no actionable reconciliation condition.'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case public.financial_reconciliation_cases;
  v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('financial_reconciliation:' || p_project_id, 0));
  FOR v_case IN
    SELECT *
    FROM public.financial_reconciliation_cases
    WHERE project_id = p_project_id
      AND status NOT IN ('resolved', 'superseded')
    FOR UPDATE
  LOOP
    UPDATE public.financial_reconciliation_cases
    SET status = 'superseded',
        resolved_at = now(),
        resolved_by = p_actor_email,
        resolution_code = 'condition_cleared',
        resolution_notes = p_reason,
        row_version = row_version + 1,
        updated_at = now()
    WHERE id = v_case.id;

    INSERT INTO public.financial_reconciliation_case_events
      (case_id, event_type, actor_email, from_status, to_status, fingerprint, payload)
    VALUES
      (v_case.id, 'superseded', p_actor_email, v_case.status, 'superseded', v_case.fingerprint, jsonb_build_object('reason', p_reason));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.transition_financial_reconciliation_case(p_case_id uuid, p_expected_row_version integer, p_actor_email text, p_status text DEFAULT NULL::text, p_owner_email text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_resolution_code text DEFAULT NULL::text, p_resolution_notes text DEFAULT NULL::text, p_comment text DEFAULT NULL::text)
 RETURNS financial_reconciliation_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_category IS NOT NULL AND p_category <> v_case.category THEN
    RAISE EXCEPTION 'Reconciliation category is derived from the metric fingerprint and cannot be changed' USING ERRCODE = '22023';
  END IF;
  IF v_to_status = 'resolved' AND (NULLIF(btrim(COALESCE(p_resolution_code, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_resolution_notes, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'Resolution code and notes are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.financial_reconciliation_cases
  SET status = v_to_status,
      owner_email = CASE WHEN p_owner_email IS NULL THEN owner_email ELSE NULLIF(btrim(p_owner_email), '') END,
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
    WHEN p_comment IS NOT NULL AND v_to_status = v_from_status AND p_owner_email IS NULL THEN 'commented'
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
      'resolution_code', p_resolution_code,
      'resolution_notes', p_resolution_notes,
      'comment', p_comment
    ))
  );

  RETURN v_case;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_ada_quote_workspace_metadata(p_workspace_id uuid, p_actor_email text, p_title text, p_client_name text, p_contact_name text, p_ada_project_id uuid)
 RETURNS ada_quote_workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE updated_workspace public.ada_quote_workspaces;
DECLARE normalized_actor text := lower(btrim(p_actor_email));
DECLARE workspace_lifecycle text;
BEGIN
  IF public.current_quote_actor_email() IS DISTINCT FROM normalized_actor OR
     NOT public.quote_actor_has_workspace_capability(p_workspace_id, normalized_actor, 'edit_draft') THEN
    RAISE EXCEPTION 'Workspace metadata capability is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT lifecycle_status INTO workspace_lifecycle
  FROM public.ada_quote_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  IF workspace_lifecycle = 'archived' THEN
    RAISE EXCEPTION 'Archived Quote Workspaces are immutable.' USING ERRCODE = '55000';
  END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Chat title is required.' USING ERRCODE = '22023';
  END IF;
  IF p_ada_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ada_quote_projects
    WHERE id = p_ada_project_id AND lower(btrim(created_by_email)) = normalized_actor
  ) THEN
    RAISE EXCEPTION 'Ada project assignment is not authorized.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ada_quote_workspaces
  SET title = btrim(p_title), client_name = p_client_name, contact_name = p_contact_name,
      ada_project_id = p_ada_project_id, last_activity_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO updated_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote Workspace not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN updated_workspace;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_quote_event_evidence(p_event_type text, p_revision_id uuid, p_reason text, p_evidence_refs jsonb, p_payload_json jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE revision_row public.ada_quote_revisions;
BEGIN
  IF jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' OR
     jsonb_typeof(coalesce(p_payload_json, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Workflow evidence must use an evidence array and payload object.' USING ERRCODE = '22023';
  END IF;

  IF p_event_type IN (
    'revision_created','revision_submitted_for_review','commercial_approved','commercial_approval_revoked',
    'publication_requested','publication_succeeded','publication_failed','publication_drift_detected',
    'customer_accepted','customer_acceptance_revoked_or_voided','production_readiness_confirmed',
    'operational_release_approved','operationally_released','project_activated'
  ) AND p_revision_id IS NULL THEN
    RAISE EXCEPTION 'This workflow event requires an exact quote revision.' USING ERRCODE = 'P0001';
  END IF;

  IF p_revision_id IS NOT NULL THEN
    SELECT * INTO revision_row FROM public.ada_quote_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quote revision not found.' USING ERRCODE = 'P0002'; END IF;
  END IF;

  IF p_event_type IN (
    'commercial_approved','publication_requested','publication_succeeded','customer_accepted',
    'production_readiness_confirmed','operational_release_approved','operationally_released'
  ) AND (
    revision_row.normalization_status <> 'normalized' OR revision_row.manifest_hash IS NULL OR revision_row.locked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A stable normalized manifest is required for this workflow event.' USING ERRCODE = 'P0001';
  END IF;

  IF p_event_type IN ('commercial_approved','operational_release_approved') AND
     (nullif(btrim(p_reason), '') IS NULL OR jsonb_array_length(p_evidence_refs) = 0) THEN
    RAISE EXCEPTION 'Approval reason and evidence are required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'publication_succeeded' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'readback_verified')::boolean, false) IS NOT TRUE OR
    p_payload_json ->> 'manifest_hash' IS DISTINCT FROM revision_row.manifest_hash
  ) THEN
    RAISE EXCEPTION 'Publication requires matching manifest read-back evidence.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'customer_accepted' AND jsonb_array_length(p_evidence_refs) = 0 THEN
    RAISE EXCEPTION 'Customer acceptance evidence is required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'production_readiness_confirmed' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'checklist_complete')::boolean, false) IS NOT TRUE OR
    coalesce((p_payload_json ->> 'no_blocking_exceptions')::boolean, false) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Completed readiness evidence with no blocking exceptions is required.' USING ERRCODE = 'P0001';
  ELSIF p_event_type = 'operationally_released' AND (
    jsonb_array_length(p_evidence_refs) = 0 OR
    coalesce((p_payload_json ->> 'qbt_verified')::boolean, false) IS NOT TRUE OR
    NOT (
      coalesce((p_payload_json ->> 'bill_verified')::boolean, false) IS TRUE OR
      (coalesce((p_payload_json ->> 'bill_exception')::boolean, false) IS TRUE AND nullif(btrim(p_reason), '') IS NOT NULL)
    )
  ) THEN
    RAISE EXCEPTION 'Verified QBT and BILL evidence or a reasoned BILL exception is required.' USING ERRCODE = 'P0001';
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_quote_proposal_workflow_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  proposal_id uuid;
  p public.quote_proposals;
  event_count integer;
  expected_event_version bigint;
  payload_expected_version bigint;
  payload_resulting_version bigint;
BEGIN
  IF NEW.event_type NOT IN ('proposal_created','proposal_edited','proposal_accepted','proposal_rejected','revision_created') THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type = 'revision_created' AND NEW.payload_json ->> 'proposal_id' IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    proposal_id := (NEW.payload_json ->> 'proposal_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Proposal workflow event requires a valid proposal_id UUID.' USING ERRCODE = '23514';
  END;
  SELECT * INTO p FROM public.quote_proposals WHERE id = proposal_id FOR KEY SHARE;
  IF NOT FOUND OR p.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Proposal workflow event does not match a proposal in the event workspace.' USING ERRCODE = '23514';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM (CASE NEW.event_type
    WHEN 'proposal_created' THEN 'proposal-created:' || proposal_id::text
    WHEN 'proposal_edited' THEN 'proposal-edited:' || proposal_id::text
    WHEN 'proposal_accepted' THEN 'proposal-accepted:' || proposal_id::text
    WHEN 'proposal_rejected' THEN 'proposal-rejected:' || proposal_id::text
    WHEN 'revision_created' THEN 'proposal-revision-created:' || proposal_id::text
  END) THEN
    RAISE EXCEPTION 'Proposal workflow event idempotency key is not deterministic.' USING ERRCODE = '23514';
  END IF;
  expected_event_version := CASE NEW.event_type
    WHEN 'proposal_created' THEN p.expected_row_version - 1
    WHEN 'proposal_rejected' THEN p.expected_row_version
    WHEN 'proposal_edited' THEN p.expected_row_version
    WHEN 'proposal_accepted' THEN p.expected_row_version + CASE
      WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 1 ELSE 0
    END
    WHEN 'revision_created' THEN p.expected_row_version + CASE
      WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 2 ELSE 1
    END
  END;
  IF (SELECT count(*) FROM public.quote_workflow_events
      WHERE workspace_id = NEW.workspace_id AND event_type = NEW.event_type
        AND payload_json ->> 'proposal_id' = proposal_id::text) <> 1 THEN
    RAISE EXCEPTION 'Proposal workflow event is duplicated for this proposal.' USING ERRCODE = '23514';
  END IF;
  BEGIN
    payload_expected_version := (NEW.payload_json ->> 'expected_row_version')::bigint;
    payload_resulting_version := (NEW.payload_json ->> 'resulting_workspace_row_version')::bigint;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Proposal workflow event row-version provenance is invalid.' USING ERRCODE = '23514';
  END;
  IF payload_expected_version IS NULL OR payload_resulting_version IS NULL
     OR payload_resulting_version IS DISTINCT FROM payload_expected_version + 1
     OR payload_expected_version IS DISTINCT FROM expected_event_version THEN
    RAISE EXCEPTION 'Proposal workflow event row-version provenance is inconsistent.' USING ERRCODE = '23514';
  END IF;
  IF NEW.actor_email IS DISTINCT FROM (CASE WHEN NEW.event_type = 'proposal_created' THEN p.created_by_email ELSE p.disposed_by_email END) THEN
    RAISE EXCEPTION 'Proposal workflow event actor does not match proposal provenance.' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_type = 'proposal_created' THEN
    IF NEW.payload_json ->> 'created_from' <> 'ada_proposal'
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text
       OR NEW.payload_json ->> 'proposal_id' IS DISTINCT FROM p.id::text
       OR NEW.revision_id IS DISTINCT FROM p.source_revision_id THEN
      RAISE EXCEPTION 'Proposal creation event provenance does not match the immutable proposal.' USING ERRCODE = '23514';
    END IF;
    IF payload_expected_version IS DISTINCT FROM p.expected_row_version - 1
       OR payload_resulting_version IS DISTINCT FROM p.expected_row_version THEN
      RAISE EXCEPTION 'Proposal creation event row-version provenance is inconsistent.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.event_type = 'proposal_rejected' THEN
    IF p.status <> 'rejected' OR p.accepted_revision_id IS NOT NULL
       OR NEW.revision_id IS DISTINCT FROM p.source_revision_id
       OR NEW.reason IS DISTINCT FROM p.reason
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text THEN
      RAISE EXCEPTION 'Rejected proposal event does not match the final proposal disposition.' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF p.status <> 'accepted' OR p.accepted_revision_id IS NULL
       OR NEW.reason IS DISTINCT FROM p.reason
       OR NEW.payload_json ->> 'proposal_manifest_hash' IS DISTINCT FROM p.proposed_manifest_hash
       OR NEW.payload_json ->> 'accepted_hash' IS DISTINCT FROM p.disposition_manifest_hash
       OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text THEN
      RAISE EXCEPTION 'Accepted proposal event does not match the final proposal disposition.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'proposal_edited' AND (
      p.edited_revision_json IS NULL OR p.edited_assumptions_json IS NULL OR p.edited_evidence_json IS NULL
      OR NEW.payload_json ->> 'edited' IS DISTINCT FROM 'true'
    ) THEN
      RAISE EXCEPTION 'Edited proposal event requires a complete edited snapshot and edited=true.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'proposal_accepted' AND NEW.payload_json ->> 'edited' IS DISTINCT FROM (
      CASE WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 'true' ELSE 'false' END
    ) THEN
      RAISE EXCEPTION 'Accepted proposal event edited provenance does not match the stored snapshot.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type <> 'revision_created' AND NEW.revision_id IS DISTINCT FROM p.source_revision_id THEN
      RAISE EXCEPTION 'Proposal disposition event revision does not match the proposal source.' USING ERRCODE = '23514';
    END IF;
    IF NEW.event_type = 'revision_created' THEN
      IF NEW.revision_id IS DISTINCT FROM p.accepted_revision_id
         OR NEW.payload_json ->> 'source_revision_id' IS DISTINCT FROM p.source_revision_id::text
         OR NEW.payload_json ->> 'normalized_manifest_hash' IS DISTINCT FROM (SELECT manifest_hash FROM public.ada_quote_revisions WHERE id = p.accepted_revision_id)
         OR NEW.payload_json ->> 'edited' IS DISTINCT FROM (
           CASE WHEN p.edited_revision_json IS NOT NULL AND p.edited_assumptions_json IS NOT NULL AND p.edited_evidence_json IS NOT NULL THEN 'true' ELSE 'false' END
         )
         OR (SELECT workspace_id FROM public.ada_quote_revisions WHERE id = p.accepted_revision_id) IS DISTINCT FROM NEW.workspace_id THEN
        RAISE EXCEPTION 'Proposal revision event does not match the accepted revision.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

ALTER TABLE ONLY public.ada_chat_turns ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_chat_turns ALTER COLUMN status SET DEFAULT 'pending'::text;
ALTER TABLE ONLY public.ada_chat_turns ALTER COLUMN claimed_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_chat_turns ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_chat_turns ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_feedback ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_feedback ALTER COLUMN page_path SET DEFAULT '/ada'::text;
ALTER TABLE ONLY public.ada_feedback ALTER COLUMN status SET DEFAULT 'new'::text;
ALTER TABLE ONLY public.ada_feedback ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_feedback ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_assets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_assets ALTER COLUMN analysis_status SET DEFAULT 'uploaded'::text;
ALTER TABLE ONLY public.ada_quote_assets ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_assets ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_concepts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_concepts ALTER COLUMN mode SET DEFAULT 'standard'::text;
ALTER TABLE ONLY public.ada_quote_concepts ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.ada_quote_concepts ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_concepts ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_events ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_messages ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_projects ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_projects ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_projects ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN internal_cost SET DEFAULT 0;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN sell_price SET DEFAULT 0;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN margin_pct SET DEFAULT 0;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN assumptions_json SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN evidence_json SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN revision_kind SET DEFAULT 'baseline'::text;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN normalization_status SET DEFAULT 'pending'::text;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN currency SET DEFAULT 'USD'::text;
ALTER TABLE ONLY public.ada_quote_revisions ALTER COLUMN created_from SET DEFAULT 'human'::text;
ALTER TABLE ONLY public.ada_quote_sheet_changes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_sheet_changes ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.ada_quote_sheet_changes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_sheets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_sheets ALTER COLUMN sync_status SET DEFAULT 'created'::text;
ALTER TABLE ONLY public.ada_quote_sheets ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_sheets ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_sheets ALTER COLUMN sync_conflicts_json SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN last_activity_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN lifecycle_status SET DEFAULT 'intake'::text;
ALTER TABLE ONLY public.ada_quote_workspaces ALTER COLUMN row_version SET DEFAULT 1;
ALTER TABLE ONLY public.app_config ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN id SET DEFAULT 1;
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN jobs_cache SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN vendors_cache SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN last_sync_errors SET DEFAULT 0;
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN last_sync_skipped SET DEFAULT 0;
ALTER TABLE ONLY public.billcom_sync_state ALTER COLUMN last_sync_error_msgs SET DEFAULT '{}'::text[];
ALTER TABLE ONLY public.budget_formula_settings ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.expenses ALTER COLUMN amount_pending SET DEFAULT false;
ALTER TABLE ONLY public.expenses ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.expenses ALTER COLUMN flagged SET DEFAULT false;
ALTER TABLE ONLY public.expenses ALTER COLUMN source SET DEFAULT 'manual'::text;
ALTER TABLE ONLY public.financial_reconciliation_case_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.financial_reconciliation_case_events ALTER COLUMN payload SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.financial_reconciliation_case_events ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN status SET DEFAULT 'new'::text;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN review_reasons SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN source_snapshot SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN first_seen_at SET DEFAULT now();
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN last_seen_at SET DEFAULT now();
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN reopen_count SET DEFAULT 0;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN resolution_notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN row_version SET DEFAULT 1;
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.financial_reconciliation_cases ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.formula_rebaseline_audits ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.formula_rebaseline_audits ALTER COLUMN formula_version SET DEFAULT 'sku-formulas-v1'::text;
ALTER TABLE ONLY public.formula_rebaseline_audits ALTER COLUMN applied_at SET DEFAULT now();
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN status SET DEFAULT 'pending'::text;
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN attempt_count SET DEFAULT 0;
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN max_attempts SET DEFAULT 8;
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.integration_outbox ALTER COLUMN reconciliation_status SET DEFAULT 'pending'::text;
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN exception_rows SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN source_reconciliation SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN reviewer_notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_allocation_je_reviews ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_allocation_mappings ALTER COLUMN active SET DEFAULT true;
ALTER TABLE ONLY public.labor_allocation_mappings ALTER COLUMN notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.labor_allocation_mappings ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_allocation_mappings ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_entries ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_entries ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_rate_imports ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_rate_imports ALTER COLUMN authority_scope SET DEFAULT 'mecca_payroll'::text;
ALTER TABLE ONLY public.labor_rate_imports ALTER COLUMN approved_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_rate_imports ALTER COLUMN imported_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_reclass_drafts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_reclass_drafts ALTER COLUMN memo SET DEFAULT ''::text;
ALTER TABLE ONLY public.labor_reclass_drafts ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.labor_reclass_drafts ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_reclass_drafts ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_worker_classifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_worker_classifications ALTER COLUMN source SET DEFAULT 'maribel_payroll_roster'::text;
ALTER TABLE ONLY public.labor_worker_classifications ALTER COLUMN notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.labor_worker_classifications ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_worker_classifications ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_worker_cost_policies ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_worker_cost_policies ALTER COLUMN approved_at SET DEFAULT now();
ALTER TABLE ONLY public.labor_worker_cost_policies ALTER COLUMN notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.labor_worker_rate_authority ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.labor_worker_rate_authority ALTER COLUMN imported_at SET DEFAULT now();
ALTER TABLE ONLY public.master_schedule_tasks ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.master_schedule_tasks ALTER COLUMN status SET DEFAULT 'active'::text;
ALTER TABLE ONLY public.master_schedule_tasks ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.material_aliases ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.material_aliases ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.material_change_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.material_change_log ALTER COLUMN changed_at SET DEFAULT now();
ALTER TABLE ONLY public.material_import_batches ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.material_import_batches ALTER COLUMN summary SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.material_import_batches ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.material_import_rows ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.material_import_rows ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.material_import_rows ALTER COLUMN review_reasons SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.material_vendor_prices ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.material_vendor_prices ALTER COLUMN is_current SET DEFAULT true;
ALTER TABLE ONLY public.material_vendor_prices ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.material_vendor_prices ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.materials ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.materials ALTER COLUMN active SET DEFAULT true;
ALTER TABLE ONLY public.materials ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.materials ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.production_issue_notes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.production_issue_notes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.production_issue_photos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.production_issue_photos ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.production_issues ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.production_issues ALTER COLUMN severity SET DEFAULT 'medium'::text;
ALTER TABLE ONLY public.production_issues ALTER COLUMN status SET DEFAULT 'open'::text;
ALTER TABLE ONLY public.production_issues ALTER COLUMN reported_date SET DEFAULT CURRENT_DATE;
ALTER TABLE ONLY public.production_issues ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.production_issues ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_activity_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_activity_events ALTER COLUMN event_date SET DEFAULT CURRENT_DATE;
ALTER TABLE ONLY public.project_activity_events ALTER COLUMN event_type SET DEFAULT 'update'::text;
ALTER TABLE ONLY public.project_activity_events ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_actuals ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_completion_reviews ALTER COLUMN checklist SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_completion_reviews ALTER COLUMN exception_notes SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_completion_reviews ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_completion_reviews ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_conversation_threads ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_conversation_threads ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_conversation_threads ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_conversation_threads ALTER COLUMN last_used_at SET DEFAULT now();
ALTER TABLE ONLY public.project_operational_state ALTER COLUMN operational_status SET DEFAULT 'on_track'::text;
ALTER TABLE ONLY public.project_operational_state ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_operational_state ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_portfolio_projects ALTER COLUMN ordinal SET DEFAULT 0;
ALTER TABLE ONLY public.project_portfolio_projects ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_portfolio_projects ALTER COLUMN monitor_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_portfolios ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_portfolios ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_portfolios ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_portfolios ALTER COLUMN automation_json SET DEFAULT '{"rule_type": "manual"}'::jsonb;
ALTER TABLE ONLY public.project_postmortem_lessons ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_postmortem_lessons ALTER COLUMN condition_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_postmortem_lessons ALTER COLUMN evidence_refs SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.project_postmortem_lessons ALTER COLUMN approved_for_ada SET DEFAULT false;
ALTER TABLE ONLY public.project_postmortems ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_postmortems ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.project_postmortems ALTER COLUMN narrative SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_postmortems ALTER COLUMN generated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_subscription_deliveries ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_subscription_runs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_subscription_runs ALTER COLUMN evaluated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_subscription_runs ALTER COLUMN snapshot_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN channel SET DEFAULT 'mdp_tracker'::text;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN target_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN rule_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN status SET DEFAULT 'active'::text;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN cooldown_minutes SET DEFAULT 60;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN scope_type SET DEFAULT 'project'::text;
ALTER TABLE ONLY public.project_subscriptions ALTER COLUMN scope_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.project_tasks ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.project_tasks ALTER COLUMN status SET DEFAULT 'open'::text;
ALTER TABLE ONLY public.project_tasks ALTER COLUMN needs_human_input SET DEFAULT false;
ALTER TABLE ONLY public.project_tasks ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE ONLY public.project_tasks ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.project_tasks ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.projects ALTER COLUMN status SET DEFAULT 'Active'::text;
ALTER TABLE ONLY public.projects ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.projects ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.purchasers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.purchasers ALTER COLUMN active SET DEFAULT true;
ALTER TABLE ONLY public.qbo_labor_entries ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.qbo_labor_entries ALTER COLUMN reg_hours SET DEFAULT 0;
ALTER TABLE ONLY public.qbo_labor_entries ALTER COLUMN ot_hours SET DEFAULT 0;
ALTER TABLE ONLY public.qbo_labor_entries ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE ONLY public.qbo_project_pnl ALTER COLUMN qbo_income SET DEFAULT 0;
ALTER TABLE ONLY public.qbo_project_pnl ALTER COLUMN qbo_expenses SET DEFAULT 0;
ALTER TABLE ONLY public.qbo_project_pnl ALTER COLUMN qbo_net_income SET DEFAULT 0;
ALTER TABLE ONLY public.qbo_project_pnl ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE ONLY public.qbo_project_wip_metrics ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_line_formula_overrides ALTER COLUMN notes SET DEFAULT ''::text;
ALTER TABLE ONLY public.quote_line_formula_overrides ALTER COLUMN reviewed_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_line_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_line_items ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_proposals ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_proposals ALTER COLUMN status SET DEFAULT 'pending'::text;
ALTER TABLE ONLY public.quote_proposals ALTER COLUMN proposed_assumptions_json SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.quote_proposals ALTER COLUMN proposed_evidence_json SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.quote_proposals ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_revision_line_work_packages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_revision_line_work_packages ALTER COLUMN mapping_status SET DEFAULT 'needs_review'::text;
ALTER TABLE ONLY public.quote_revision_line_work_packages ALTER COLUMN source_ref SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN formula_inputs SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN formula_status SET DEFAULT 'needs_input'::text;
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN production_mapping_status SET DEFAULT 'needs_review'::text;
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN source_ref SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_revision_lines ALTER COLUMN evidence_refs SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ALTER COLUMN details_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_revision_work_package_labor ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_revision_work_package_labor ALTER COLUMN source_ref SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_revision_work_packages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_revision_work_packages ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE ONLY public.quote_revision_work_packages ALTER COLUMN source_ref SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_user_capabilities ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_user_capabilities ALTER COLUMN granted_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_workflow_events ALTER COLUMN event_id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_workflow_events ALTER COLUMN occurred_at SET DEFAULT now();
ALTER TABLE ONLY public.quote_workflow_events ALTER COLUMN evidence_refs SET DEFAULT '[]'::jsonb;
ALTER TABLE ONLY public.quote_workflow_events ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.quote_workspace_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.quote_workspace_members ALTER COLUMN added_at SET DEFAULT now();
ALTER TABLE ONLY public.user_roles ALTER COLUMN role SET DEFAULT 'pm'::text;
ALTER TABLE ONLY public.user_roles ALTER COLUMN show_in_filters SET DEFAULT true;
ALTER TABLE ONLY public.user_roles ALTER COLUMN ada_access SET DEFAULT false;
ALTER TABLE ONLY public.vendor_aliases ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.vendor_aliases ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.vendors ALTER COLUMN active SET DEFAULT true;
ALTER TABLE ONLY public.vendors ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.wip_report_snapshot_rows ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.wip_report_snapshot_rows ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.wip_report_snapshots ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.wip_report_snapshots ALTER COLUMN generated_at SET DEFAULT now();
ALTER TABLE ONLY public.wip_report_snapshots ALTER COLUMN filters_json SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.wip_report_snapshots ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.wip_report_snapshots ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE ONLY public.work_packages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.work_packages ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE ONLY public.work_packages ALTER COLUMN classification SET DEFAULT 'fabrication'::text;
ALTER TABLE ONLY public.work_packages ALTER COLUMN status SET DEFAULT 'draft'::text;
ALTER TABLE ONLY public.work_packages ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ONLY public.work_packages ALTER COLUMN source_ref SET DEFAULT '{}'::jsonb;
ALTER TABLE ONLY public.work_types ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.work_types ALTER COLUMN active SET DEFAULT true;
ALTER TABLE ONLY public.work_types ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_feedback ADD CONSTRAINT ada_feedback_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_concepts ADD CONSTRAINT ada_quote_concepts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_events ADD CONSTRAINT ada_quote_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_messages ADD CONSTRAINT ada_quote_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_projects ADD CONSTRAINT ada_quote_projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_sheet_changes ADD CONSTRAINT ada_quote_sheet_changes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_sheets ADD CONSTRAINT ada_quote_sheets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.billcom_sync_state ADD CONSTRAINT billcom_sync_state_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_formula_settings ADD CONSTRAINT budget_formula_settings_pkey PRIMARY KEY (category);
ALTER TABLE ONLY public.cogs_categories ADD CONSTRAINT cogs_categories_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.financial_reconciliation_case_events ADD CONSTRAINT financial_reconciliation_case_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.formula_rebaseline_audits ADD CONSTRAINT formula_rebaseline_audits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_allocation_je_reviews ADD CONSTRAINT labor_allocation_je_reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_allocation_mappings ADD CONSTRAINT labor_allocation_mappings_pkey PRIMARY KEY (service_item);
ALTER TABLE ONLY public.labor_entries ADD CONSTRAINT labor_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_imports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_reclass_draft_entries ADD CONSTRAINT labor_reclass_draft_entries_pkey PRIMARY KEY (draft_id, qbo_entry_id);
ALTER TABLE ONLY public.labor_reclass_drafts ADD CONSTRAINT labor_reclass_drafts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_worker_classifications ADD CONSTRAINT labor_worker_classifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_worker_cost_policies ADD CONSTRAINT labor_worker_cost_policies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.master_schedule_tasks ADD CONSTRAINT master_schedule_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.material_aliases ADD CONSTRAINT material_aliases_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.material_change_log ADD CONSTRAINT material_change_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.material_import_batches ADD CONSTRAINT material_import_batches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.material_import_rows ADD CONSTRAINT material_import_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.material_vendor_prices ADD CONSTRAINT material_vendor_prices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.production_issue_notes ADD CONSTRAINT production_issue_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.production_issue_photos ADD CONSTRAINT production_issue_photos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_activity_events ADD CONSTRAINT project_activity_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_actuals ADD CONSTRAINT project_actuals_pkey PRIMARY KEY (project_id, category);
ALTER TABLE ONLY public.project_completion_reviews ADD CONSTRAINT project_completion_reviews_pkey PRIMARY KEY (project_id);
ALTER TABLE ONLY public.project_conversation_threads ADD CONSTRAINT project_conversation_threads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_operational_state ADD CONSTRAINT project_operational_state_pkey PRIMARY KEY (project_id);
ALTER TABLE ONLY public.project_portfolio_projects ADD CONSTRAINT project_portfolio_projects_pkey PRIMARY KEY (portfolio_id, project_id);
ALTER TABLE ONLY public.project_portfolios ADD CONSTRAINT project_portfolios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_postmortem_lessons ADD CONSTRAINT project_postmortem_lessons_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_postmortems ADD CONSTRAINT project_postmortems_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_subscription_deliveries ADD CONSTRAINT project_subscription_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_subscription_runs ADD CONSTRAINT project_subscription_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_subscriptions ADD CONSTRAINT project_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.project_tasks ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchasers ADD CONSTRAINT purchasers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.qbo_labor_entries ADD CONSTRAINT qbo_labor_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.qbo_project_pnl ADD CONSTRAINT qbo_project_pnl_pkey PRIMARY KEY (project_id);
ALTER TABLE ONLY public.qbo_project_wip_metrics ADD CONSTRAINT qbo_project_wip_metrics_pkey PRIMARY KEY (project_id, as_of_date);
ALTER TABLE ONLY public.quote_line_formula_overrides ADD CONSTRAINT quote_line_formula_overrides_pkey PRIMARY KEY (quote_line_item_id);
ALTER TABLE ONLY public.quote_line_items ADD CONSTRAINT quote_line_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ADD CONSTRAINT quote_revision_normalization_exceptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_pkey PRIMARY KEY (event_id);
ALTER TABLE ONLY public.quote_workspace_members ADD CONSTRAINT quote_workspace_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (email);
ALTER TABLE ONLY public.vendor_aliases ADD CONSTRAINT vendor_aliases_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wip_report_snapshot_rows ADD CONSTRAINT wip_report_snapshot_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wip_report_snapshots ADD CONSTRAINT wip_report_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.work_types ADD CONSTRAINT work_types_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_workspace_id_actor_email_client_request_id_key UNIQUE (workspace_id, actor_email, client_request_id);
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_id_workspace_key UNIQUE (id, workspace_id);
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_workspace_id_revision_number_key UNIQUE (workspace_id, revision_number);
ALTER TABLE ONLY public.ada_quote_sheets ADD CONSTRAINT ada_quote_sheets_revision_id_key UNIQUE (revision_id);
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_workspace_number_key UNIQUE (workspace_number);
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_external_id_unique UNIQUE (external_id);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_idempotency_key UNIQUE (idempotency_key);
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_imports_source_sha256_key UNIQUE (source_sha256);
ALTER TABLE ONLY public.labor_worker_classifications ADD CONSTRAINT labor_worker_classifications_normalized_name_roster_snapsho_key UNIQUE (normalized_name, roster_snapshot_date);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_source_row_unique UNIQUE (import_id, source_row_number, effective_start_date);
ALTER TABLE ONLY public.production_issue_photos ADD CONSTRAINT production_issue_photos_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY public.project_portfolios ADD CONSTRAINT project_portfolios_created_by_email_slug_key UNIQUE (created_by_email, slug);
ALTER TABLE ONLY public.purchasers ADD CONSTRAINT purchasers_initials_key UNIQUE (initials);
ALTER TABLE ONLY public.qbo_labor_entries ADD CONSTRAINT qbo_labor_entries_qbo_entry_id_key UNIQUE (qbo_entry_id);
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_unique_mapping UNIQUE (revision_id, commercial_line_id, revision_work_package_id);
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_id_revision_workspace_key UNIQUE (id, revision_id, workspace_id);
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_revision_sort_key UNIQUE (revision_id, sort_order);
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_id_revision_key UNIQUE (id, revision_id);
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_id_revision_workspace_key UNIQUE (id, revision_id, workspace_id);
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_revision_work_package_key UNIQUE (revision_id, work_package_id);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_idempotency_key UNIQUE (idempotency_key);
ALTER TABLE ONLY public.vendors ADD CONSTRAINT vendors_name_key UNIQUE (name);
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_id_workspace_key UNIQUE (id, workspace_id);
ALTER TABLE ONLY public.work_types ADD CONSTRAINT work_types_code_key UNIQUE (code);
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]));
ALTER TABLE ONLY public.ada_feedback ADD CONSTRAINT ada_feedback_category_check CHECK (category = ANY (ARRAY['bug'::text, 'idea'::text, 'confusing'::text, 'other'::text]));
ALTER TABLE ONLY public.ada_feedback ADD CONSTRAINT ada_feedback_message_check CHECK (char_length(message) >= 1 AND char_length(message) <= 2000);
ALTER TABLE ONLY public.ada_feedback ADD CONSTRAINT ada_feedback_status_check CHECK (status = ANY (ARRAY['new'::text, 'triaged'::text, 'planned'::text, 'resolved'::text]));
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_analysis_status_check CHECK (analysis_status = ANY (ARRAY['uploading'::text, 'uploaded'::text, 'analyzing'::text, 'ready'::text, 'failed'::text]));
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_byte_size_check CHECK (byte_size > 0);
ALTER TABLE ONLY public.ada_quote_concepts ADD CONSTRAINT ada_quote_concepts_mode_check CHECK (mode = ANY (ARRAY['standard'::text, 'fast_pass'::text]));
ALTER TABLE ONLY public.ada_quote_concepts ADD CONSTRAINT ada_quote_concepts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));
ALTER TABLE ONLY public.ada_quote_messages ADD CONSTRAINT ada_quote_messages_role_check CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text]));
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_created_from_check CHECK (created_from = ANY (ARRAY['human'::text, 'ada_proposal'::text, 'workbook_import'::text, 'sheet_sync'::text, 'hubspot_import'::text]));
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_currency_check CHECK (currency = 'USD'::text);
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_normalization_status_check CHECK (normalization_status = ANY (ARRAY['pending'::text, 'normalized'::text, 'needs_review'::text, 'mismatch'::text]));
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_revision_kind_check CHECK (revision_kind = ANY (ARRAY['baseline'::text, 'revision'::text, 'amendment'::text, 'change_order'::text]));
ALTER TABLE ONLY public.ada_quote_sheet_changes ADD CONSTRAINT ada_quote_sheet_changes_status_check CHECK (status = ANY (ARRAY['draft'::text, 'applied'::text, 'rejected'::text, 'failed'::text]));
ALTER TABLE ONLY public.ada_quote_sheets ADD CONSTRAINT ada_quote_sheets_sync_status_check CHECK (sync_status = ANY (ARRAY['created'::text, 'synced'::text, 'needs_review'::text, 'failed'::text]));
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_lifecycle_status_check CHECK (lifecycle_status = ANY (ARRAY['intake'::text, 'draft'::text, 'internal_review'::text, 'commercial_approved'::text, 'published_verified'::text, 'customer_accepted'::text, 'production_readiness_confirmed'::text, 'operational_release_approved'::text, 'release_approved_pending_provisioning'::text, 'operationally_released'::text, 'active_project'::text, 'completed'::text, 'postmortem_review'::text, 'closed'::text, 'archived'::text, 'cancelled'::text, 'expired'::text, 'blocked'::text, 'superseded'::text]));
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_status_check CHECK (status = ANY (ARRAY['draft'::text, 'gathering_inputs'::text, 'estimating'::text, 'in_review'::text, 'accepted'::text, 'handed_off'::text, 'archived'::text]));
ALTER TABLE ONLY public.financial_reconciliation_case_events ADD CONSTRAINT financial_reconciliation_case_events_event_type_check CHECK (event_type = ANY (ARRAY['created'::text, 'observed'::text, 'assigned'::text, 'status_changed'::text, 'commented'::text, 'resolved'::text, 'reopened'::text, 'superseded'::text]));
ALTER TABLE ONLY public.financial_reconciliation_case_events ADD CONSTRAINT financial_reconciliation_case_events_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE ONLY public.financial_reconciliation_case_events ADD CONSTRAINT financial_reconciliation_case_events_payload_check CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_category_check CHECK (category = ANY (ARRAY['stale_qbo_data'::text, 'missing_qbo_actuals'::text, 'missing_tracker_contract'::text, 'missing_labor_rate'::text, 'revenue_variance'::text, 'cost_variance'::text]));
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_check CHECK ((status = ANY (ARRAY['resolved'::text, 'superseded'::text])) AND resolved_at IS NOT NULL OR (status <> ALL (ARRAY['resolved'::text, 'superseded'::text])) AND resolved_at IS NULL);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_metric_snapshot_check CHECK (jsonb_typeof(metric_snapshot) = 'object'::text);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_reopen_count_check CHECK (reopen_count >= 0);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_review_reasons_check CHECK (jsonb_typeof(review_reasons) = 'array'::text);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_row_version_check CHECK (row_version > 0);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_source_snapshot_check CHECK (jsonb_typeof(source_snapshot) = 'object'::text);
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_status_check CHECK (status = ANY (ARRAY['new'::text, 'assigned'::text, 'investigating'::text, 'waiting_on_pm'::text, 'waiting_on_accounting'::text, 'resolved'::text, 'superseded'::text]));
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_attempts_check CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_completion_check CHECK (status = 'succeeded'::text AND completed_at IS NOT NULL OR status <> 'succeeded'::text);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_destination_check CHECK (destination = ANY (ARRAY['hubspot'::text, 'qbt'::text, 'bill'::text, 'google_sheets'::text]));
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_lease_check CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL));
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_no_credentials_check CHECK (NOT jsonb_contains_sensitive_material(payload_json) AND NOT jsonb_contains_sensitive_material(to_jsonb(COALESCE(external_identity, ''::text))) AND NOT jsonb_contains_sensitive_material(to_jsonb(COALESCE(last_error_message, ''::text))));
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_quote_publication_terminal_evidence_check CHECK (NOT (aggregate_type = 'quote_workspace'::text AND destination = 'hubspot'::text AND operation = 'publish_quote'::text) OR reconciliation_status = 'pending'::text AND external_identity IS NULL AND external_readback_json IS NULL AND external_readback_hash IS NULL AND reconciled_at IS NULL OR (reconciliation_status = ANY (ARRAY['verified'::text, 'drifted'::text])) AND NULLIF(btrim(external_identity), ''::text) IS NOT NULL AND jsonb_typeof(external_readback_json) = 'object'::text AND NOT jsonb_contains_sensitive_material(external_readback_json) AND external_readback_hash ~ '^[0-9a-f]{64}$'::text AND reconciled_at IS NOT NULL);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_readback_hash_check CHECK (external_readback_hash IS NULL OR external_readback_hash ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_evidence_check CHECK (reconciliation_status = 'pending'::text AND reconciled_at IS NULL OR (reconciliation_status = ANY (ARRAY['verified'::text, 'drifted'::text])) AND reconciled_at IS NOT NULL);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_reconciliation_status_check CHECK (reconciliation_status = ANY (ARRAY['pending'::text, 'verified'::text, 'drifted'::text]));
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'retryable_failed'::text, 'terminal_failed'::text, 'cancelled'::text]));
ALTER TABLE ONLY public.labor_allocation_je_reviews ADD CONSTRAINT labor_allocation_je_reviews_check CHECK (debit_total = credit_total);
ALTER TABLE ONLY public.labor_allocation_je_reviews ADD CONSTRAINT labor_allocation_je_reviews_status_check CHECK (status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'approved_for_manual_entry'::text, 'rejected'::text, 'posted'::text]));
ALTER TABLE ONLY public.labor_allocation_mappings ADD CONSTRAINT labor_allocation_mappings_labor_bucket_check CHECK (labor_bucket = ANY (ARRAY['Production Labor'::text, 'I&D Labor'::text, 'Contractor Labor'::text]));
ALTER TABLE ONLY public.labor_entries ADD CONSTRAINT labor_entries_labor_type_check CHECK (labor_type = ANY (ARRAY['Production Labor'::text, 'I&D Labor'::text, 'Design Labor'::text]));
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_import_revocation_complete CHECK (revoked_at IS NULL AND revoked_by IS NULL AND revoked_reason IS NULL OR revoked_at IS NOT NULL AND NULLIF(TRIM(BOTH FROM revoked_by), ''::text) IS NOT NULL AND NULLIF(TRIM(BOTH FROM revoked_reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_imports_authority_scope_check CHECK (authority_scope = 'mecca_payroll'::text);
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_imports_source_sha256_check CHECK (source_sha256 ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE ONLY public.labor_reclass_drafts ADD CONSTRAINT labor_reclass_drafts_amount_check CHECK (amount > 0::numeric);
ALTER TABLE ONLY public.labor_reclass_drafts ADD CONSTRAINT labor_reclass_drafts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'approved'::text, 'rejected'::text, 'posted'::text]));
ALTER TABLE ONLY public.labor_worker_classifications ADD CONSTRAINT labor_worker_classifications_classification_check CHECK (classification = ANY (ARRAY['employee'::text, 'contractor'::text]));
ALTER TABLE ONLY public.labor_worker_cost_policies ADD CONSTRAINT labor_worker_cost_policies_cost_basis_check CHECK (cost_basis = ANY (ARRAY['hourly'::text, 'daily'::text, 'excluded'::text]));
ALTER TABLE ONLY public.labor_worker_cost_policies ADD CONSTRAINT labor_worker_cost_policy_date_order CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date);
ALTER TABLE ONLY public.labor_worker_cost_policies ADD CONSTRAINT labor_worker_cost_policy_rate CHECK (cost_basis = 'excluded'::text AND rate_amount IS NULL OR (cost_basis = ANY (ARRAY['hourly'::text, 'daily'::text])) AND rate_amount > 0::numeric);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_base_hourly_rate_check CHECK (base_hourly_rate > 0::numeric);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_classification_check CHECK (classification = ANY (ARRAY['employee'::text, 'contractor'::text]));
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_date_order CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_source_row_number_check CHECK (source_row_number > 0);
ALTER TABLE ONLY public.master_schedule_tasks ADD CONSTRAINT master_schedule_tasks_status_check CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE ONLY public.material_import_batches ADD CONSTRAINT material_import_batches_status_check CHECK (status = ANY (ARRAY['preview'::text, 'committed'::text, 'failed'::text]));
ALTER TABLE ONLY public.material_import_rows ADD CONSTRAINT material_import_rows_status_check CHECK (status = ANY (ARRAY['parsed'::text, 'needs_review'::text, 'skipped'::text, 'imported'::text, 'error'::text]));
ALTER TABLE ONLY public.material_vendor_prices ADD CONSTRAINT material_vendor_prices_source_type_check CHECK (source_type = ANY (ARRAY['spreadsheet'::text, 'invoice'::text, 'bill'::text, 'manual'::text]));
ALTER TABLE ONLY public.production_issue_notes ADD CONSTRAINT production_issue_notes_note_check CHECK (char_length(TRIM(BOTH FROM note)) > 0);
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_category_check CHECK (category = ANY (ARRAY['defect'::text, 'rework'::text, 'safety'::text, 'site'::text, 'vendor'::text, 'labor'::text, 'other'::text]));
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_status_check CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]));
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_title_check CHECK (char_length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE ONLY public.project_postmortem_lessons ADD CONSTRAINT project_postmortem_lessons_confidence_check CHECK (confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]));
ALTER TABLE ONLY public.project_postmortems ADD CONSTRAINT project_postmortems_status_check CHECK (status = ANY (ARRAY['generating'::text, 'draft'::text, 'failed'::text, 'reviewed'::text, 'approved'::text]));
ALTER TABLE ONLY public.project_subscriptions ADD CONSTRAINT project_subscriptions_scope_type_check CHECK (scope_type = ANY (ARRAY['project'::text, 'my_active_projects'::text, 'pm_active_projects'::text, 'all_active_projects'::text, 'saved_portfolio'::text]));
ALTER TABLE ONLY public.project_subscriptions ADD CONSTRAINT project_subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text]));
ALTER TABLE ONLY public.project_subscriptions ADD CONSTRAINT project_subscriptions_subscription_type_check CHECK (subscription_type = ANY (ARRAY['metric_threshold_alert'::text, 'scheduled_digest'::text]));
ALTER TABLE ONLY public.projects ADD CONSTRAINT projects_status_check CHECK (status = ANY (ARRAY['Active'::text, 'Completed'::text, 'On Hold'::text, 'Pending'::text]));
ALTER TABLE ONLY public.quote_line_formula_overrides ADD CONSTRAINT quote_line_formula_overrides_check CHECK (formula_type = 'graphics'::text AND square_feet IS NOT NULL AND square_feet > 0::numeric OR formula_type = 'bematrix'::text AND frame_count IS NOT NULL AND frame_count > 0::numeric);
ALTER TABLE ONLY public.quote_line_formula_overrides ADD CONSTRAINT quote_line_formula_overrides_formula_type_check CHECK (formula_type = ANY (ARRAY['graphics'::text, 'bematrix'::text]));
ALTER TABLE ONLY public.quote_line_items ADD CONSTRAINT quote_line_items_source_check CHECK (source = ANY (ARRAY['hubspot'::text, 'qbo'::text]));
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_assumptions_array_check CHECK (jsonb_typeof(proposed_assumptions_json) = 'array'::text);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_creation_key_check CHECK (char_length(btrim(creation_idempotency_key)) >= 1 AND char_length(btrim(creation_idempotency_key)) <= 200);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_disposition_key_check CHECK (disposition_idempotency_key IS NULL OR char_length(btrim(disposition_idempotency_key)) >= 1 AND char_length(btrim(disposition_idempotency_key)) <= 200);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_email_normalized_check CHECK (created_by_email = lower(btrim(created_by_email)) AND NULLIF(btrim(created_by_email), ''::text) IS NOT NULL AND (disposed_by_email IS NULL OR disposed_by_email = lower(btrim(disposed_by_email))));
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_evidence_array_check CHECK (jsonb_typeof(proposed_evidence_json) = 'array'::text);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_expected_row_version_check CHECK (expected_row_version > 0);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_revision_object_check CHECK (jsonb_typeof(proposed_revision_json) = 'object'::text);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_shape_check CHECK (status = 'pending'::text AND disposed_by_email IS NULL AND disposed_at IS NULL AND accepted_revision_id IS NULL AND reason IS NULL AND edited_revision_json IS NULL AND edited_assumptions_json IS NULL AND edited_evidence_json IS NULL AND disposition_manifest_hash IS NULL AND disposition_idempotency_key IS NULL OR status = 'accepted'::text AND NULLIF(btrim(disposed_by_email), ''::text) IS NOT NULL AND disposed_at IS NOT NULL AND disposition_manifest_hash IS NOT NULL AND accepted_revision_id IS NOT NULL AND disposition_idempotency_key IS NOT NULL AND jsonb_typeof(COALESCE(edited_revision_json, proposed_revision_json)) = 'object'::text AND jsonb_typeof(COALESCE(edited_assumptions_json, proposed_assumptions_json)) = 'array'::text AND jsonb_typeof(COALESCE(edited_evidence_json, proposed_evidence_json)) = 'array'::text OR status = 'rejected'::text AND NULLIF(btrim(disposed_by_email), ''::text) IS NOT NULL AND disposed_at IS NOT NULL AND accepted_revision_id IS NULL AND edited_revision_json IS NULL AND edited_assumptions_json IS NULL AND edited_evidence_json IS NULL AND disposition_manifest_hash IS NULL AND disposition_idempotency_key IS NOT NULL AND NULLIF(btrim(reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]));
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_basis_check CHECK (allocation_basis = ANY (ARRAY['quantity'::text, 'percentage'::text, 'explicit_amount'::text, 'direct'::text]));
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_basis_fields_check CHECK (allocation_basis = 'quantity'::text AND allocated_quantity IS NOT NULL AND allocated_sell_amount IS NULL AND allocation_pct IS NULL OR allocation_basis = 'percentage'::text AND allocation_pct IS NOT NULL AND allocated_quantity IS NULL AND allocated_sell_amount IS NULL OR allocation_basis = 'explicit_amount'::text AND allocated_sell_amount IS NOT NULL AND allocated_quantity IS NULL AND allocation_pct IS NULL OR allocation_basis = 'direct'::text AND allocated_quantity IS NULL AND allocated_sell_amount IS NULL AND allocation_pct IS NULL);
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_nonnegative_check CHECK ((allocated_quantity IS NULL OR allocated_quantity >= 0::numeric) AND (allocated_sell_amount IS NULL OR allocated_sell_amount >= 0::numeric) AND (allocated_hours IS NULL OR allocated_hours >= 0::numeric) AND (allocation_pct IS NULL OR allocation_pct >= 0::numeric AND allocation_pct <= 1::numeric));
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_status_check CHECK (mapping_status = ANY (ARRAY['mapped'::text, 'commercial_only'::text, 'needs_review'::text]));
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_commercial_only_reason_check CHECK (production_mapping_status <> 'commercial_only'::text OR NULLIF(btrim(commercial_only_reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_formula_status_check CHECK (formula_status = ANY (ARRAY['complete'::text, 'needs_input'::text, 'exception'::text]));
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_mapping_status_check CHECK (production_mapping_status = ANY (ARRAY['mapped'::text, 'commercial_only'::text, 'needs_review'::text]));
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_nonnegative_check CHECK ((quantity IS NULL OR quantity >= 0::numeric) AND computed_sell_price >= 0::numeric AND final_sell_price >= 0::numeric AND (unit_sell_price IS NULL OR unit_sell_price >= 0::numeric) AND (sell_price_override IS NULL OR sell_price_override >= 0::numeric) AND (materials_other_budget IS NULL OR materials_other_budget >= 0::numeric) AND (quoted_hours IS NULL OR quoted_hours >= 0::numeric) AND (labor_budget IS NULL OR labor_budget >= 0::numeric) AND (build_budget IS NULL OR build_budget >= 0::numeric));
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_sort_order_check CHECK (sort_order >= 0);
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ADD CONSTRAINT quote_revision_normalization_exception_code_check CHECK (exception_code = ANY (ARRAY['invalid_quote_json'::text, 'missing_line_items'::text, 'missing_commercial_line_identity'::text, 'invalid_money_value'::text, 'duplicate_commercial_line_identity'::text, 'ambiguous_work_package_identity'::text, 'source_hash_mismatch'::text, 'normalization_failure'::text]));
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ADD CONSTRAINT quote_revision_normalization_resolution_check CHECK (resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL OR resolved_at IS NOT NULL AND NULLIF(btrim(resolved_by), ''::text) IS NOT NULL AND NULLIF(btrim(resolution_reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_hours_check CHECK (quoted_hours >= 0::numeric);
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_origin_check CHECK (allocation_origin = ANY (ARRAY['structured_input'::text, 'workbook'::text, 'import'::text, 'reviewed_inference'::text, 'unallocated'::text]));
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_status_check CHECK (allocation_status = ANY (ARRAY['allocated'::text, 'unallocated'::text, 'needs_review'::text]));
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_value_check CHECK (quoted_labor_value IS NULL OR quoted_labor_value >= 0::numeric);
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_nonnegative_check CHECK ((materials_other_budget IS NULL OR materials_other_budget >= 0::numeric) AND (total_quoted_hours IS NULL OR total_quoted_hours >= 0::numeric) AND (labor_budget IS NULL OR labor_budget >= 0::numeric));
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_quantity_check CHECK (quantity > 0::numeric);
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_capability_check CHECK (capability = ANY (ARRAY['create_workspace'::text, 'edit_draft'::text, 'submit_review'::text, 'attach_evidence'::text, 'approve_commercial'::text, 'request_publication'::text, 'verify_publication'::text, 'record_manual_acceptance'::text, 'confirm_readiness'::text, 'approve_release'::text, 'execute_release'::text, 'approve_change'::text, 'classify_operational_cause'::text, 'correct_labor_coding'::text, 'approve_postmortem'::text, 'approve_lesson'::text, 'archive_workspace'::text, 'block_release'::text, 'break_glass'::text]));
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_email_check CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''::text);
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_grant_reason_check CHECK (NULLIF(btrim(grant_reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_revoke_check CHECK (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL OR revoked_at IS NOT NULL AND NULLIF(btrim(revoked_by), ''::text) IS NOT NULL AND NULLIF(btrim(revoke_reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_actor_check CHECK (NULLIF(btrim(actor_email), ''::text) IS NOT NULL AND actor_email = lower(btrim(actor_email)) AND NULLIF(btrim(actor_capability), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_reason_check CHECK (actor_capability <> 'break_glass'::text OR NULLIF(btrim(reason), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_state_check CHECK (NULLIF(btrim(prior_state), ''::text) IS NOT NULL AND NULLIF(btrim(resulting_state), ''::text) IS NOT NULL);
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_type_check CHECK (event_type = ANY (ARRAY['workspace_created'::text, 'evidence_attached'::text, 'proposal_created'::text, 'proposal_accepted'::text, 'proposal_rejected'::text, 'proposal_edited'::text, 'revision_created'::text, 'revision_submitted_for_review'::text, 'commercial_approved'::text, 'commercial_approval_revoked'::text, 'publication_requested'::text, 'publication_succeeded'::text, 'publication_failed'::text, 'publication_drift_detected'::text, 'customer_accepted'::text, 'customer_acceptance_revoked_or_voided'::text, 'production_readiness_confirmed'::text, 'operational_release_approved'::text, 'operationally_released'::text, 'release_blocked'::text, 'change_requested'::text, 'change_approved'::text, 'work_package_corrected'::text, 'labor_coding_corrected'::text, 'project_activated'::text, 'project_completed'::text, 'postmortem_started'::text, 'postmortem_approved'::text, 'lesson_approved'::text, 'lesson_withdrawn'::text, 'workspace_archived'::text, 'workspace_restored'::text]));
ALTER TABLE ONLY public.quote_workspace_members ADD CONSTRAINT quote_workspace_members_email_normalized_check CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized <> ''::text);
ALTER TABLE ONLY public.quote_workspace_members ADD CONSTRAINT quote_workspace_members_role_check CHECK (workspace_role = ANY (ARRAY['owner'::text, 'editor'::text, 'reviewer'::text, 'viewer'::text]));
ALTER TABLE ONLY public.vendor_aliases ADD CONSTRAINT vendor_aliases_source_type_check CHECK (source_type = ANY (ARRAY['spreadsheet'::text, 'invoice'::text, 'bill'::text, 'manual'::text]));
ALTER TABLE ONLY public.wip_report_snapshot_rows ADD CONSTRAINT wip_report_snapshot_rows_estimated_cost_source_check CHECK (estimated_cost_source = ANY (ARRAY['derived'::text, 'manual_override'::text]));
ALTER TABLE ONLY public.wip_report_snapshots ADD CONSTRAINT wip_report_snapshots_status_check CHECK (status = ANY (ARRAY['draft'::text, 'final'::text]));
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_classification_check CHECK (classification = ANY (ARRAY['fabrication'::text, 'graphics'::text, 'resale'::text, 'service'::text, 'project_wide'::text, 'pass_through'::text]));
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_item_number_check CHECK (item_number > 0);
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_quantity_check CHECK (quantity > 0::numeric);
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_status_check CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'released'::text, 'active'::text, 'completed'::text, 'cancelled'::text, 'superseded'::text]));
ALTER TABLE ONLY public.work_types ADD CONSTRAINT work_types_category_check CHECK (category = ANY (ARRAY['shop'::text, 'design'::text, 'install'::text, 'dismantle'::text, 'logistics'::text, 'other'::text]));
ALTER TABLE ONLY public.labor_worker_cost_policies ADD CONSTRAINT labor_worker_cost_policy_no_overlap EXCLUDE USING gist (normalized_name WITH =, daterange(effective_start_date, COALESCE(effective_end_date, 'infinity'::date), '[]'::text) WITH &&);
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_no_overlap EXCLUDE USING gist (import_id WITH =, normalized_name WITH =, daterange(effective_start_date, COALESCE(effective_end_date, 'infinity'::date), '[]'::text) WITH &&);
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_assistant_message_id_fkey FOREIGN KEY (assistant_message_id) REFERENCES ada_quote_messages(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES quote_proposals(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_user_message_id_fkey FOREIGN KEY (user_message_id) REFERENCES ada_quote_messages(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_chat_turns ADD CONSTRAINT ada_chat_turns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_feedback ADD CONSTRAINT ada_feedback_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES ada_quote_concepts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_assets ADD CONSTRAINT ada_quote_assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_concepts ADD CONSTRAINT ada_quote_concepts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_events ADD CONSTRAINT ada_quote_events_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES ada_quote_concepts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_events ADD CONSTRAINT ada_quote_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_messages ADD CONSTRAINT ada_quote_messages_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES ada_quote_concepts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ada_quote_messages ADD CONSTRAINT ada_quote_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_parent_fk FOREIGN KEY (parent_revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_supersedes_fk FOREIGN KEY (supersedes_revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_revisions ADD CONSTRAINT ada_quote_revisions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_sheet_changes ADD CONSTRAINT ada_quote_sheet_changes_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_sheet_changes ADD CONSTRAINT ada_quote_sheet_changes_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES ada_quote_sheets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ada_quote_sheet_changes ADD CONSTRAINT ada_quote_sheet_changes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_sheets ADD CONSTRAINT ada_quote_sheets_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_sheets ADD CONSTRAINT ada_quote_sheets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_accepted_revision_fk FOREIGN KEY (accepted_revision_id) REFERENCES ada_quote_revisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_ada_project_id_fkey FOREIGN KEY (ada_project_id) REFERENCES ada_quote_projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT ada_quote_workspaces_tracker_project_id_fkey FOREIGN KEY (tracker_project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT aqw_commercial_approved_revision_fk FOREIGN KEY (commercial_approved_revision_id, id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT aqw_current_revision_fk FOREIGN KEY (current_revision_id, id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT aqw_customer_accepted_revision_fk FOREIGN KEY (customer_accepted_revision_id, id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT aqw_hubspot_published_revision_fk FOREIGN KEY (hubspot_published_revision_id, id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.ada_quote_workspaces ADD CONSTRAINT aqw_operationally_released_revision_fk FOREIGN KEY (operationally_released_revision_id, id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_cogs_code_fkey FOREIGN KEY (cogs_code) REFERENCES cogs_categories(code);
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.financial_reconciliation_case_events ADD CONSTRAINT financial_reconciliation_case_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES financial_reconciliation_cases(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.financial_reconciliation_cases ADD CONSTRAINT financial_reconciliation_cases_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.formula_rebaseline_audits ADD CONSTRAINT formula_rebaseline_audits_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ONLY public.integration_outbox ADD CONSTRAINT integration_outbox_revision_fk FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.labor_entries ADD CONSTRAINT labor_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.labor_rate_imports ADD CONSTRAINT labor_rate_imports_supersedes_import_id_fkey FOREIGN KEY (supersedes_import_id) REFERENCES labor_rate_imports(id);
ALTER TABLE ONLY public.labor_reclass_draft_entries ADD CONSTRAINT labor_reclass_draft_entries_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES labor_reclass_drafts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.labor_reclass_draft_entries ADD CONSTRAINT labor_reclass_draft_entries_qbo_entry_id_fkey FOREIGN KEY (qbo_entry_id) REFERENCES qbo_labor_entries(qbo_entry_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.labor_reclass_drafts ADD CONSTRAINT labor_reclass_drafts_source_project_id_fkey FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.labor_reclass_drafts ADD CONSTRAINT labor_reclass_drafts_target_project_id_fkey FOREIGN KEY (target_project_id) REFERENCES projects(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.labor_worker_rate_authority ADD CONSTRAINT labor_worker_rate_authority_import_id_fkey FOREIGN KEY (import_id) REFERENCES labor_rate_imports(id);
ALTER TABLE ONLY public.material_aliases ADD CONSTRAINT material_aliases_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.material_change_log ADD CONSTRAINT material_change_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES material_import_batches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.material_change_log ADD CONSTRAINT material_change_log_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.material_import_rows ADD CONSTRAINT material_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES material_import_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.material_vendor_prices ADD CONSTRAINT material_vendor_prices_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.material_vendor_prices ADD CONSTRAINT material_vendor_prices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_default_vendor_id_fkey FOREIGN KEY (default_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.production_issue_notes ADD CONSTRAINT production_issue_notes_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES production_issues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.production_issue_photos ADD CONSTRAINT production_issue_photos_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES production_issues(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.production_issues ADD CONSTRAINT production_issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_activity_events ADD CONSTRAINT project_activity_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_actuals ADD CONSTRAINT project_actuals_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_completion_reviews ADD CONSTRAINT project_completion_reviews_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_conversation_threads ADD CONSTRAINT project_conversation_threads_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_operational_state ADD CONSTRAINT project_operational_state_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_portfolio_projects ADD CONSTRAINT project_portfolio_projects_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES project_portfolios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_portfolio_projects ADD CONSTRAINT project_portfolio_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_postmortem_lessons ADD CONSTRAINT project_postmortem_lessons_postmortem_id_fkey FOREIGN KEY (postmortem_id) REFERENCES project_postmortems(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_postmortem_lessons ADD CONSTRAINT project_postmortem_lessons_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_postmortems ADD CONSTRAINT project_postmortems_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_subscription_deliveries ADD CONSTRAINT project_subscription_deliveries_subscription_run_id_fkey FOREIGN KEY (subscription_run_id) REFERENCES project_subscription_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_subscription_runs ADD CONSTRAINT project_subscription_runs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES project_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_subscriptions ADD CONSTRAINT project_subscriptions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.project_tasks ADD CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.qbo_labor_entries ADD CONSTRAINT qbo_labor_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.qbo_project_wip_metrics ADD CONSTRAINT qbo_project_wip_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.quote_line_formula_overrides ADD CONSTRAINT quote_line_formula_overrides_quote_line_item_id_fkey FOREIGN KEY (quote_line_item_id) REFERENCES quote_line_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.quote_line_items ADD CONSTRAINT quote_line_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_accepted_workspace_fk FOREIGN KEY (accepted_revision_id, workspace_id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_source_workspace_fk FOREIGN KEY (source_revision_id, workspace_id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_proposals ADD CONSTRAINT quote_proposals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_line_fk FOREIGN KEY (commercial_line_id, revision_id, workspace_id) REFERENCES quote_revision_lines(id, revision_id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_line_work_packages ADD CONSTRAINT quote_revision_line_work_packages_package_fk FOREIGN KEY (revision_work_package_id, revision_id, workspace_id) REFERENCES quote_revision_work_packages(id, revision_id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_lines ADD CONSTRAINT quote_revision_lines_revision_aggregate_fk FOREIGN KEY (revision_id, workspace_id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ADD CONSTRAINT quote_revision_normalization_exceptions_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_normalization_exceptions ADD CONSTRAINT quote_revision_normalization_exceptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_package_fk FOREIGN KEY (revision_work_package_id, revision_id) REFERENCES quote_revision_work_packages(id, revision_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_package_labor ADD CONSTRAINT quote_revision_work_package_labor_work_type_id_fkey FOREIGN KEY (work_type_id) REFERENCES work_types(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_package_workspace_fk FOREIGN KEY (work_package_id, workspace_id) REFERENCES work_packages(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_revision_workspace_fk FOREIGN KEY (revision_id, workspace_id) REFERENCES ada_quote_revisions(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_revision_work_packages ADD CONSTRAINT quote_revision_work_packages_work_package_id_fkey FOREIGN KEY (work_package_id) REFERENCES work_packages(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_user_capabilities ADD CONSTRAINT quote_user_capabilities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES ada_quote_revisions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_workflow_events ADD CONSTRAINT quote_workflow_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_workspace_members ADD CONSTRAINT quote_workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.quote_workspace_members ADD CONSTRAINT quote_workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.vendor_aliases ADD CONSTRAINT vendor_aliases_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wip_report_snapshot_rows ADD CONSTRAINT wip_report_snapshot_rows_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.wip_report_snapshot_rows ADD CONSTRAINT wip_report_snapshot_rows_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES wip_report_snapshots(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_parent_aggregate_fk FOREIGN KEY (parent_work_package_id, workspace_id) REFERENCES work_packages(id, workspace_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.work_packages ADD CONSTRAINT work_packages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES ada_quote_workspaces(id) ON DELETE RESTRICT;

CREATE INDEX idx_ada_chat_turns_workspace_created ON public.ada_chat_turns USING btree (workspace_id, created_at DESC);
CREATE INDEX ada_feedback_status_created_idx ON public.ada_feedback USING btree (status, created_at DESC);
CREATE INDEX ada_feedback_workspace_idx ON public.ada_feedback USING btree (workspace_id, created_at DESC) WHERE (workspace_id IS NOT NULL);
CREATE INDEX idx_ada_quote_assets_concept_created ON public.ada_quote_assets USING btree (concept_id, created_at);
CREATE INDEX idx_ada_quote_assets_workspace_active ON public.ada_quote_assets USING btree (workspace_id, created_at) WHERE (archived_at IS NULL);
CREATE INDEX idx_ada_quote_assets_workspace_created ON public.ada_quote_assets USING btree (workspace_id, created_at);
CREATE INDEX idx_ada_quote_concepts_workspace_created ON public.ada_quote_concepts USING btree (workspace_id, created_at);
CREATE UNIQUE INDEX idx_ada_quote_concepts_workspace_label ON public.ada_quote_concepts USING btree (workspace_id, lower(label));
CREATE UNIQUE INDEX idx_ada_quote_events_idempotency ON public.ada_quote_events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_ada_quote_events_workspace_created ON public.ada_quote_events USING btree (workspace_id, created_at DESC);
CREATE INDEX idx_ada_quote_messages_concept_created ON public.ada_quote_messages USING btree (concept_id, created_at);
CREATE INDEX idx_ada_quote_projects_owner_recent ON public.ada_quote_projects USING btree (created_by_email, updated_at DESC);
CREATE INDEX idx_ada_quote_projects_recent ON public.ada_quote_projects USING btree (updated_at DESC);
CREATE INDEX idx_ada_quote_revisions_workspace_number ON public.ada_quote_revisions USING btree (workspace_id, revision_number DESC);
CREATE INDEX idx_ada_quote_sheet_changes_sheet ON public.ada_quote_sheet_changes USING btree (sheet_id, created_at DESC);
CREATE INDEX idx_ada_quote_sheets_workspace ON public.ada_quote_sheets USING btree (workspace_id, created_at DESC);
CREATE INDEX idx_ada_quote_workspaces_client_name ON public.ada_quote_workspaces USING btree (client_name);
CREATE INDEX idx_ada_quote_workspaces_owner_recent ON public.ada_quote_workspaces USING btree (created_by_email, last_activity_at DESC);
CREATE INDEX idx_ada_quote_workspaces_project_recent ON public.ada_quote_workspaces USING btree (ada_project_id, last_activity_at DESC);
CREATE INDEX idx_ada_quote_workspaces_recent ON public.ada_quote_workspaces USING btree (pinned_at DESC NULLS LAST, last_activity_at DESC);
CREATE INDEX idx_ada_quote_workspaces_status ON public.ada_quote_workspaces USING btree (status, last_activity_at DESC);
CREATE INDEX idx_expenses_category ON public.expenses USING btree (category);
CREATE INDEX idx_expenses_date ON public.expenses USING btree (date);
CREATE UNIQUE INDEX idx_expenses_external_id ON public.expenses USING btree (external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_expenses_flagged ON public.expenses USING btree (flagged) WHERE (flagged = true);
CREATE INDEX idx_expenses_project_id ON public.expenses USING btree (project_id);
CREATE INDEX financial_reconciliation_case_events_case_idx ON public.financial_reconciliation_case_events USING btree (case_id, created_at DESC);
CREATE UNIQUE INDEX financial_reconciliation_cases_active_project_uidx ON public.financial_reconciliation_cases USING btree (project_id) WHERE (status <> ALL (ARRAY['resolved'::text, 'superseded'::text]));
CREATE UNIQUE INDEX financial_reconciliation_cases_fingerprint_uidx ON public.financial_reconciliation_cases USING btree (fingerprint);
CREATE INDEX financial_reconciliation_cases_project_idx ON public.financial_reconciliation_cases USING btree (project_id, as_of_date DESC);
CREATE INDEX financial_reconciliation_cases_queue_idx ON public.financial_reconciliation_cases USING btree (status, severity, last_seen_at DESC);
CREATE INDEX idx_formula_rebaseline_audits_project ON public.formula_rebaseline_audits USING btree (project_id, applied_at DESC);
CREATE INDEX idx_integration_outbox_claim ON public.integration_outbox USING btree (status, next_attempt_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'retryable_failed'::text]));
CREATE INDEX idx_integration_outbox_lease ON public.integration_outbox USING btree (lease_expires_at) WHERE (status = 'processing'::text);
CREATE INDEX idx_integration_outbox_publication_revision ON public.integration_outbox USING btree (revision_id) WHERE (revision_id IS NOT NULL);
CREATE INDEX idx_labor_allocation_je_reviews_period ON public.labor_allocation_je_reviews USING btree (period_start, period_end);
CREATE INDEX idx_labor_entries_person ON public.labor_entries USING btree (person);
CREATE INDEX idx_labor_entries_project_id ON public.labor_entries USING btree (project_id);
CREATE UNIQUE INDEX idx_labor_rate_imports_one_active_scope ON public.labor_rate_imports USING btree (authority_scope) WHERE (revoked_at IS NULL);
CREATE INDEX idx_labor_reclass_draft_entries_entry ON public.labor_reclass_draft_entries USING btree (qbo_entry_id);
CREATE INDEX idx_labor_reclass_drafts_period ON public.labor_reclass_drafts USING btree (period_start, period_end);
CREATE INDEX idx_labor_worker_classifications_snapshot ON public.labor_worker_classifications USING btree (roster_snapshot_date, normalized_name);
CREATE INDEX idx_labor_worker_cost_policy_lookup ON public.labor_worker_cost_policies USING btree (normalized_name, effective_start_date, effective_end_date);
CREATE INDEX idx_labor_worker_rate_authority_lookup ON public.labor_worker_rate_authority USING btree (import_id, normalized_name, effective_start_date, effective_end_date);
CREATE INDEX idx_mst_assigned_to ON public.master_schedule_tasks USING btree (assigned_to);
CREATE INDEX idx_mst_dates ON public.master_schedule_tasks USING btree (start_date, end_date);
CREATE INDEX idx_mst_job_number ON public.master_schedule_tasks USING btree (job_number);
CREATE INDEX idx_mst_status ON public.master_schedule_tasks USING btree (status);
CREATE UNIQUE INDEX material_aliases_material_normalized_alias_key ON public.material_aliases USING btree (material_id, normalized_alias_text);
CREATE INDEX material_change_log_material_changed_at_idx ON public.material_change_log USING btree (material_id, changed_at DESC);
CREATE INDEX material_import_rows_batch_status_idx ON public.material_import_rows USING btree (batch_id, status);
CREATE INDEX material_vendor_prices_material_current_idx ON public.material_vendor_prices USING btree (material_id, is_current);
CREATE INDEX material_vendor_prices_source_type_idx ON public.material_vendor_prices USING btree (source_type);
CREATE INDEX material_vendor_prices_vendor_current_idx ON public.material_vendor_prices USING btree (vendor_id, is_current);
CREATE INDEX materials_active_idx ON public.materials USING btree (active);
CREATE INDEX materials_category_idx ON public.materials USING btree (category);
CREATE INDEX materials_category_name_idx ON public.materials USING btree (category, canonical_name);
CREATE INDEX materials_search_fts ON public.materials USING gin (to_tsvector('english'::regconfig, search_text));
CREATE INDEX idx_production_issue_notes_issue_id ON public.production_issue_notes USING btree (issue_id);
CREATE INDEX idx_production_issue_photos_issue_id ON public.production_issue_photos USING btree (issue_id);
CREATE INDEX idx_production_issues_category ON public.production_issues USING btree (category);
CREATE INDEX idx_production_issues_project_id ON public.production_issues USING btree (project_id);
CREATE INDEX idx_production_issues_reported_date ON public.production_issues USING btree (reported_date DESC);
CREATE INDEX idx_production_issues_severity ON public.production_issues USING btree (severity);
CREATE INDEX idx_production_issues_status ON public.production_issues USING btree (status);
CREATE INDEX idx_project_activity_events_event_date ON public.project_activity_events USING btree (event_date DESC);
CREATE INDEX idx_project_activity_events_project_date ON public.project_activity_events USING btree (project_id, event_date DESC);
CREATE INDEX project_completion_reviews_updated_at_idx ON public.project_completion_reviews USING btree (updated_at DESC);
CREATE INDEX idx_project_conversation_threads_project_id ON public.project_conversation_threads USING btree (project_id);
CREATE UNIQUE INDEX idx_project_conversation_threads_unique ON public.project_conversation_threads USING btree (slack_team_id, channel_id, thread_ts);
CREATE INDEX idx_project_portfolio_projects_project_id ON public.project_portfolio_projects USING btree (project_id);
CREATE INDEX idx_project_portfolios_created_by_email ON public.project_portfolios USING btree (created_by_email);
CREATE INDEX idx_postmortem_lessons_ada ON public.project_postmortem_lessons USING btree (project_id) WHERE approved_for_ada;
CREATE INDEX idx_project_postmortems_project ON public.project_postmortems USING btree (project_id, generated_at DESC);
CREATE INDEX idx_project_subscription_deliveries_run_id ON public.project_subscription_deliveries USING btree (subscription_run_id);
CREATE INDEX idx_project_subscription_runs_subscription_id ON public.project_subscription_runs USING btree (subscription_id);
CREATE INDEX idx_project_subscriptions_project_id ON public.project_subscriptions USING btree (project_id);
CREATE INDEX idx_project_subscriptions_scope_json_gin ON public.project_subscriptions USING gin (scope_json);
CREATE INDEX idx_project_subscriptions_scope_type ON public.project_subscriptions USING btree (scope_type);
CREATE INDEX idx_project_subscriptions_status ON public.project_subscriptions USING btree (status);
CREATE INDEX idx_project_tasks_due_date ON public.project_tasks USING btree (due_date);
CREATE INDEX idx_project_tasks_project_id_status ON public.project_tasks USING btree (project_id, status);
CREATE INDEX idx_projects_pm ON public.projects USING btree (pm);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);
CREATE INDEX idx_qbo_labor_date ON public.qbo_labor_entries USING btree (date);
CREATE INDEX idx_qbo_labor_entries_qbo_time_user ON public.qbo_labor_entries USING btree (qbo_time_user_id) WHERE (qbo_entry_id ~~ 'ts_%'::text);
CREATE INDEX idx_qbo_labor_entries_rate_coverage ON public.qbo_labor_entries USING btree (project_id, rate_source) WHERE (qbo_entry_id ~~ 'ts_%'::text);
CREATE INDEX idx_qbo_labor_entries_service_item ON public.qbo_labor_entries USING btree (service_item) WHERE (service_item IS NOT NULL);
CREATE INDEX idx_qbo_labor_project ON public.qbo_labor_entries USING btree (project_id);
CREATE INDEX quote_line_items_fts ON public.quote_line_items USING gin (to_tsvector('english'::regconfig, raw_text));
CREATE INDEX quote_line_items_project_id ON public.quote_line_items USING btree (project_id);
CREATE INDEX quote_line_items_source ON public.quote_line_items USING btree (source);
CREATE INDEX quote_line_items_source_date ON public.quote_line_items USING btree (source_date);
CREATE UNIQUE INDEX quote_line_items_upsert_key ON public.quote_line_items USING btree (source, source_id, line_key);
CREATE UNIQUE INDEX quote_proposals_accepted_revision_uq ON public.quote_proposals USING btree (accepted_revision_id) WHERE (accepted_revision_id IS NOT NULL);
CREATE UNIQUE INDEX quote_proposals_creation_key_uq ON public.quote_proposals USING btree (workspace_id, creation_idempotency_key);
CREATE UNIQUE INDEX quote_proposals_disposition_key_uq ON public.quote_proposals USING btree (workspace_id, disposition_idempotency_key) WHERE (disposition_idempotency_key IS NOT NULL);
CREATE INDEX quote_proposals_workspace_status_idx ON public.quote_proposals USING btree (workspace_id, status, created_at);
CREATE INDEX idx_quote_revision_line_work_packages_revision ON public.quote_revision_line_work_packages USING btree (revision_id);
CREATE INDEX idx_quote_revision_lines_workspace_revision ON public.quote_revision_lines USING btree (workspace_id, revision_id, sort_order);
CREATE UNIQUE INDEX idx_quote_normalization_exceptions_unresolved ON public.quote_revision_normalization_exceptions USING btree (revision_id, source_manifest_hash, exception_code, COALESCE(exception_path, ''::text)) WHERE (resolved_at IS NULL);
CREATE INDEX idx_quote_normalization_exceptions_workspace ON public.quote_revision_normalization_exceptions USING btree (workspace_id, created_at) WHERE (resolved_at IS NULL);
CREATE INDEX idx_quote_revision_work_package_labor_revision ON public.quote_revision_work_package_labor USING btree (revision_id);
CREATE INDEX idx_quote_revision_work_packages_revision ON public.quote_revision_work_packages USING btree (revision_id, sort_order);
CREATE UNIQUE INDEX idx_quote_user_capabilities_active_email ON public.quote_user_capabilities USING btree (email_normalized, capability) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX idx_quote_user_capabilities_active_user ON public.quote_user_capabilities USING btree (user_id, capability) WHERE ((revoked_at IS NULL) AND (user_id IS NOT NULL));
CREATE INDEX idx_quote_workflow_events_revision_time ON public.quote_workflow_events USING btree (revision_id, occurred_at, event_id) WHERE (revision_id IS NOT NULL);
CREATE INDEX idx_quote_workflow_events_workspace_time ON public.quote_workflow_events USING btree (workspace_id, occurred_at, event_id);
CREATE UNIQUE INDEX idx_quote_workspace_members_active_email ON public.quote_workspace_members USING btree (workspace_id, email_normalized) WHERE (removed_at IS NULL);
CREATE UNIQUE INDEX idx_quote_workspace_members_active_user ON public.quote_workspace_members USING btree (workspace_id, user_id) WHERE ((removed_at IS NULL) AND (user_id IS NOT NULL));
CREATE INDEX idx_quote_workspace_members_email ON public.quote_workspace_members USING btree (email_normalized, workspace_id) WHERE (removed_at IS NULL);
CREATE UNIQUE INDEX vendor_aliases_normalized_alias_key ON public.vendor_aliases USING btree (normalized_alias_text);
CREATE INDEX idx_wip_report_snapshot_rows_project_id ON public.wip_report_snapshot_rows USING btree (project_id);
CREATE INDEX idx_wip_report_snapshot_rows_snapshot_id ON public.wip_report_snapshot_rows USING btree (snapshot_id);
CREATE INDEX idx_wip_report_snapshots_snapshot_date ON public.wip_report_snapshots USING btree (snapshot_date DESC);
CREATE INDEX idx_wip_report_snapshots_status ON public.wip_report_snapshots USING btree (status);
CREATE UNIQUE INDEX idx_work_packages_project_item_active ON public.work_packages USING btree (project_id, item_number) WHERE ((project_id IS NOT NULL) AND (archived_at IS NULL) AND (status <> ALL (ARRAY['cancelled'::text, 'superseded'::text])));
CREATE UNIQUE INDEX idx_work_packages_workspace_item_active ON public.work_packages USING btree (workspace_id, item_number) WHERE ((archived_at IS NULL) AND (status <> ALL (ARRAY['cancelled'::text, 'superseded'::text])));

CREATE VIEW public.project_labor_reconciliation_summary WITH (security_invoker=true) AS
 WITH resolved AS (
         SELECT labor.id,
            labor.project_id,
            labor.employee_name,
            labor.date,
            labor.reg_hours,
            labor.ot_hours,
            labor.hourly_rate,
            labor.qbo_entry_id,
            labor.synced_at,
            labor.service_item,
            labor.rate_source,
            labor.rate_verified_at,
            labor.qbo_time_user_id,
            labor.qbo_time_salaried,
            normalize_labor_worker_name(labor.employee_name) AS normalized_worker_name,
            policy.cost_basis,
            policy.rate_amount AS policy_rate,
            policy.source AS policy_source,
            authority.base_hourly_rate AS payroll_hourly_rate
           FROM qbo_labor_entries labor
             LEFT JOIN LATERAL ( SELECT worker_policy.cost_basis,
                    worker_policy.rate_amount,
                    worker_policy.source
                   FROM labor_worker_cost_policies worker_policy
                  WHERE worker_policy.normalized_name = normalize_labor_worker_name(labor.employee_name) AND labor.date >= worker_policy.effective_start_date AND (worker_policy.effective_end_date IS NULL OR labor.date <= worker_policy.effective_end_date)
                  ORDER BY worker_policy.effective_start_date DESC
                 LIMIT 1) policy ON true
             LEFT JOIN LATERAL ( SELECT rate.base_hourly_rate
                   FROM labor_worker_rate_authority rate
                     JOIN labor_rate_imports rate_import ON rate_import.id = rate.import_id
                  WHERE rate_import.approved_at IS NOT NULL AND rate_import.revoked_at IS NULL AND rate.normalized_name = normalize_labor_worker_name(labor.employee_name) AND labor.date >= rate.effective_start_date AND (rate.effective_end_date IS NULL OR labor.date <= rate.effective_end_date)
                  ORDER BY rate.effective_start_date DESC
                 LIMIT 1) authority ON true
          WHERE labor.qbo_entry_id ~~ 'ts_%'::text
        ), valued AS (
         SELECT resolved.id,
            resolved.project_id,
            resolved.employee_name,
            resolved.date,
            resolved.reg_hours,
            resolved.ot_hours,
            resolved.hourly_rate,
            resolved.qbo_entry_id,
            resolved.synced_at,
            resolved.service_item,
            resolved.rate_source,
            resolved.rate_verified_at,
            resolved.qbo_time_user_id,
            resolved.qbo_time_salaried,
            resolved.normalized_worker_name,
            resolved.cost_basis,
            resolved.policy_rate,
            resolved.policy_source,
            resolved.payroll_hourly_rate,
                CASE
                    WHEN resolved.cost_basis = 'excluded'::text THEN 'salary_below_gross_profit'::text
                    WHEN resolved.cost_basis = 'hourly'::text AND resolved.policy_rate > 0::numeric THEN resolved.policy_source
                    WHEN resolved.cost_basis = 'daily'::text AND resolved.policy_rate > 0::numeric THEN resolved.policy_source
                    WHEN resolved.payroll_hourly_rate > 0::numeric THEN 'payroll_rate_sheet'::text
                    WHEN COALESCE(resolved.hourly_rate, 0::numeric) > 0::numeric AND (COALESCE(resolved.rate_source, ''::text) = ANY (ARRAY['qbo_time_users'::text, 'qbo_time_users_matched'::text])) THEN resolved.rate_source
                    ELSE NULL::text
                END AS effective_rate_source,
                CASE
                    WHEN resolved.cost_basis = 'hourly'::text AND resolved.policy_rate > 0::numeric THEN resolved.policy_rate
                    WHEN resolved.cost_basis = ANY (ARRAY['daily'::text, 'excluded'::text]) THEN NULL::numeric
                    WHEN resolved.payroll_hourly_rate > 0::numeric THEN resolved.payroll_hourly_rate
                    WHEN COALESCE(resolved.hourly_rate, 0::numeric) > 0::numeric AND (COALESCE(resolved.rate_source, ''::text) = ANY (ARRAY['qbo_time_users'::text, 'qbo_time_users_matched'::text])) THEN resolved.hourly_rate
                    ELSE NULL::numeric
                END AS effective_hourly_rate,
                CASE
                    WHEN resolved.cost_basis = 'daily'::text THEN row_number() OVER (PARTITION BY resolved.project_id, resolved.normalized_worker_name, resolved.date ORDER BY resolved.id)
                    ELSE NULL::bigint
                END AS daily_cost_row
           FROM resolved
        ), costed AS (
         SELECT valued.id,
            valued.project_id,
            valued.employee_name,
            valued.date,
            valued.reg_hours,
            valued.ot_hours,
            valued.hourly_rate,
            valued.qbo_entry_id,
            valued.synced_at,
            valued.service_item,
            valued.rate_source,
            valued.rate_verified_at,
            valued.qbo_time_user_id,
            valued.qbo_time_salaried,
            valued.normalized_worker_name,
            valued.cost_basis,
            valued.policy_rate,
            valued.policy_source,
            valued.payroll_hourly_rate,
            valued.effective_rate_source,
            valued.effective_hourly_rate,
            valued.daily_cost_row,
                CASE
                    WHEN valued.cost_basis = 'excluded'::text THEN 0::numeric
                    WHEN valued.cost_basis = 'daily'::text AND valued.daily_cost_row = 1 THEN valued.policy_rate
                    WHEN valued.cost_basis = 'daily'::text THEN 0::numeric
                    WHEN COALESCE(valued.effective_hourly_rate, 0::numeric) > 0::numeric THEN (COALESCE(valued.reg_hours, 0::numeric) + COALESCE(valued.ot_hours, 0::numeric)) * valued.effective_hourly_rate
                    ELSE NULL::numeric
                END AS effective_labor_cost
           FROM valued
        )
 SELECT project_id,
    round(sum(COALESCE(reg_hours, 0::numeric) + COALESCE(ot_hours, 0::numeric)), 2) AS total_hours,
    round(sum(COALESCE(reg_hours, 0::numeric) + COALESCE(ot_hours, 0::numeric)) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND (effective_rate_source = ANY (ARRAY['qbo_time_users'::text, 'qbo_time_users_matched'::text, 'payroll_rate_sheet'::text, 'fixed_design_rate'::text, 'approved_daily_rate'::text]))), 2) AS verified_rate_hours,
    round(sum(COALESCE(reg_hours, 0::numeric) + COALESCE(ot_hours, 0::numeric)) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND effective_rate_source IS NULL), 2) AS missing_rate_hours,
    round(sum(effective_labor_cost) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND (effective_rate_source = ANY (ARRAY['qbo_time_users'::text, 'qbo_time_users_matched'::text, 'payroll_rate_sheet'::text, 'fixed_design_rate'::text, 'approved_daily_rate'::text]))), 2) AS verified_direct_wages,
    count(*) AS source_row_count,
    count(*) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND (effective_rate_source = ANY (ARRAY['qbo_time_users'::text, 'qbo_time_users_matched'::text, 'payroll_rate_sheet'::text, 'fixed_design_rate'::text, 'approved_daily_rate'::text]))) AS verified_rate_row_count,
    count(*) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND effective_rate_source IS NULL) AS missing_rate_row_count,
    max(synced_at) AS labor_synced_at,
    count(DISTINCT employee_name) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND effective_rate_source IS NULL) AS missing_rate_worker_count,
    COALESCE(array_agg(DISTINCT employee_name ORDER BY employee_name) FILTER (WHERE cost_basis IS DISTINCT FROM 'excluded'::text AND effective_rate_source IS NULL), ARRAY[]::text[]) AS missing_rate_workers,
    round(sum(COALESCE(reg_hours, 0::numeric) + COALESCE(ot_hours, 0::numeric)) FILTER (WHERE cost_basis = 'excluded'::text), 2) AS excluded_project_cost_hours
   FROM costed
  GROUP BY project_id;
CREATE VIEW public.project_summary AS
 SELECT p.id,
    p.name,
    p.client,
    p.pm,
    p.job_number,
    p.status,
    p.close_date,
    p.due_date,
    p.contract_amount,
    p.wip_class,
    p.sales_tax_included,
    p.estimated_cost_override,
    p.wip_notes,
    p.wip_updated_at,
    p.wip_updated_by,
    p.notes,
    p.hubspot_deal_id,
    p.hubspot_deal_url,
    p.qbo_project_id,
    p.qbo_project_url,
    p.budget_hrs,
    p.budget_design,
    p.budget_pm,
    p.budget_shipping,
    p.budget_id_labor,
    p.budget_travel,
    p.budget_storage,
    p.budget_props,
    p.budget_equipment,
    p.budget_rental,
    p.budget_crating,
    p.budget_flooring,
    p.budget_materials,
    p.project_type,
    p.created_at,
    p.updated_at,
    p.quote_labor,
    p.quote_materials,
    p.quote_design,
    p.quote_pm,
    p.quote_shipping,
    p.quote_id_labor,
    p.quote_travel,
    p.quote_storage,
    p.quote_props,
    p.quote_equipment,
    p.quote_rental,
    p.quote_crating,
    p.quote_flooring,
    p.pct_labor,
    p.pct_materials,
    p.pct_design,
    p.pct_pm,
    p.pct_shipping,
    p.pct_id_labor,
    p.pct_travel,
    p.pct_storage,
    p.pct_props,
    p.pct_equipment,
    p.pct_rental,
    p.pct_crating,
    p.pct_flooring,
    COALESCE(ql.total_reg_hours, 0::numeric) + COALESCE(l.total_hours, 0::numeric) AS total_hrs_used,
    COALESCE(e.total_spent, 0::numeric) AS total_spent,
    COALESCE(e.pending_amount, 0::numeric) AS pending_amount,
    COALESCE(p.budget_hrs * 30::numeric, 0::numeric) AS budget_labor_dollars,
        CASE
            WHEN p.budget_hrs > 0::numeric THEN round((COALESCE(ql.total_reg_hours, 0::numeric) + COALESCE(ql.total_ot_hours, 0::numeric) + COALESCE(l.total_hours, 0::numeric)) / p.budget_hrs * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_hrs_used,
    COALESCE(p.budget_design, 0::numeric) + COALESCE(p.budget_pm, 0::numeric) + COALESCE(p.budget_shipping, 0::numeric) + COALESCE(p.budget_id_labor, 0::numeric) + COALESCE(p.budget_travel, 0::numeric) + COALESCE(p.budget_storage, 0::numeric) + COALESCE(p.budget_props, 0::numeric) + COALESCE(p.budget_equipment, 0::numeric) + COALESCE(p.budget_rental, 0::numeric) + COALESCE(p.budget_crating, 0::numeric) + COALESCE(p.budget_flooring, 0::numeric) + COALESCE(p.budget_materials, 0::numeric) + COALESCE(p.budget_hrs * 30::numeric, 0::numeric) AS total_budget,
        CASE
            WHEN (COALESCE(p.budget_design, 0::numeric) + COALESCE(p.budget_pm, 0::numeric) + COALESCE(p.budget_shipping, 0::numeric) + COALESCE(p.budget_id_labor, 0::numeric) + COALESCE(p.budget_travel, 0::numeric) + COALESCE(p.budget_storage, 0::numeric) + COALESCE(p.budget_props, 0::numeric) + COALESCE(p.budget_equipment, 0::numeric) + COALESCE(p.budget_rental, 0::numeric) + COALESCE(p.budget_crating, 0::numeric) + COALESCE(p.budget_flooring, 0::numeric) + COALESCE(p.budget_materials, 0::numeric) + COALESCE(p.budget_hrs * 30::numeric, 0::numeric)) > 0::numeric THEN round(COALESCE(e.total_spent, 0::numeric) / (COALESCE(p.budget_design, 0::numeric) + COALESCE(p.budget_pm, 0::numeric) + COALESCE(p.budget_shipping, 0::numeric) + COALESCE(p.budget_id_labor, 0::numeric) + COALESCE(p.budget_travel, 0::numeric) + COALESCE(p.budget_storage, 0::numeric) + COALESCE(p.budget_props, 0::numeric) + COALESCE(p.budget_equipment, 0::numeric) + COALESCE(p.budget_rental, 0::numeric) + COALESCE(p.budget_crating, 0::numeric) + COALESCE(p.budget_flooring, 0::numeric) + COALESCE(p.budget_materials, 0::numeric) + COALESCE(p.budget_hrs * 30::numeric, 0::numeric)) * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_budget_used,
    COALESCE(ql.total_reg_hours, 0::numeric) + COALESCE(ql.total_ot_hours, 0::numeric) AS qbo_total_hours,
    COALESCE(ql.total_labor_cost, 0::numeric) AS qbo_labor_cost,
    ql.last_synced_at AS qbo_last_synced
   FROM projects p
     LEFT JOIN ( SELECT labor_entries.project_id,
            sum(labor_entries.hours) AS total_hours
           FROM labor_entries
          GROUP BY labor_entries.project_id) l ON l.project_id = p.id
     LEFT JOIN ( SELECT qbo_labor_entries.project_id,
            sum(qbo_labor_entries.reg_hours) AS total_reg_hours,
            sum(qbo_labor_entries.ot_hours) AS total_ot_hours,
            sum((qbo_labor_entries.reg_hours + qbo_labor_entries.ot_hours) * qbo_labor_entries.hourly_rate) AS total_labor_cost,
            max(qbo_labor_entries.synced_at) AS last_synced_at
           FROM qbo_labor_entries
          WHERE qbo_labor_entries.qbo_entry_id ~~ 'ts_%'::text AND qbo_labor_entries.hourly_rate > 0::numeric
          GROUP BY qbo_labor_entries.project_id) ql ON ql.project_id = p.id
     LEFT JOIN ( SELECT expenses.project_id,
            sum(expenses.amount) AS total_spent,
            sum(
                CASE
                    WHEN expenses.amount_pending THEN expenses.amount
                    ELSE 0::numeric
                END) AS pending_amount
           FROM expenses
          GROUP BY expenses.project_id) e ON e.project_id = p.id;
CREATE VIEW public.project_pricing_index AS
 SELECT id,
    name,
    client,
    project_type,
    close_date,
    due_date,
    contract_amount,
    status,
    pm,
    hubspot_deal_id,
    hubspot_deal_url,
    quote_labor,
    quote_materials,
    quote_design,
    quote_pm,
    quote_shipping,
    quote_crating,
    quote_id_labor,
    quote_travel,
    quote_storage,
    quote_props,
    quote_equipment,
    quote_rental,
    quote_flooring,
    budget_hrs,
    budget_materials,
    budget_design,
    budget_pm,
    budget_shipping,
    budget_crating,
    budget_id_labor,
    budget_travel,
    budget_storage,
    budget_props,
    budget_equipment,
    budget_rental,
    budget_flooring,
    total_spent,
    qbo_total_hours,
    qbo_labor_cost,
        CASE
            WHEN contract_amount > 0::numeric AND quote_materials IS NOT NULL THEN round(quote_materials / contract_amount * 100::numeric, 1)
            ELSE NULL::numeric
        END AS quote_materials_pct_of_contract,
        CASE
            WHEN contract_amount > 0::numeric AND total_spent IS NOT NULL THEN round(total_spent / contract_amount * 100::numeric, 1)
            ELSE NULL::numeric
        END AS actual_spend_pct_of_contract
   FROM project_summary p
  WHERE hubspot_deal_id IS NOT NULL AND quote_materials IS NOT NULL;

ALTER TABLE public.ada_chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_sheet_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_quote_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billcom_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_formula_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogs_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reconciliation_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_rebaseline_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_allocation_je_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_allocation_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_rate_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_reclass_draft_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_reclass_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_worker_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_worker_cost_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_worker_rate_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_vendor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issue_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issue_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_completion_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_operational_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_portfolio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_postmortem_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_postmortems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subscription_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subscription_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchasers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_project_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qbo_project_wip_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_formula_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_line_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_normalization_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_work_package_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_revision_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_user_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wip_report_snapshot_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wip_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_event_member_read ON public.ada_quote_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY quote_revision_member_read ON public.ada_quote_revisions AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY quote_workspace_member_read ON public.ada_quote_workspaces AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(id));
CREATE POLICY "authenticated users can read app_config" ON public.app_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_all_budget_formula_settings ON public.budget_formula_settings AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read cogs_categories" ON public.cogs_categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can do everything on expenses" ON public.expenses AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service role manages formula rebaseline audits" ON public.formula_rebaseline_audits AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Authenticated users can do everything on labor_entries" ON public.labor_entries AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on master_schedule_tasks" ON public.master_schedule_tasks AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_material_aliases ON public.material_aliases AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_material_change_log ON public.material_change_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_material_import_batches ON public.material_import_batches AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_material_import_rows ON public.material_import_rows AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_material_vendor_prices ON public.material_vendor_prices AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_materials ON public.materials AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read production issue notes" ON public.production_issue_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read production issue photos" ON public.production_issue_photos AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read production issues" ON public.production_issues AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can do everything on project_activity_event" ON public.project_activity_events AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all ON public.project_actuals AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_project_actuals ON public.project_actuals AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read completion reviews" ON public.project_completion_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can do everything on project_conversation_t" ON public.project_conversation_threads AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_operational_st" ON public.project_operational_state AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_portfolio_proj" ON public.project_portfolio_projects AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_portfolios" ON public.project_portfolios AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service role manages postmortem lessons" ON public.project_postmortem_lessons AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "service role manages postmortems" ON public.project_postmortems AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Authenticated users can do everything on project_subscription_d" ON public.project_subscription_deliveries AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_subscription_r" ON public.project_subscription_runs AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_subscriptions" ON public.project_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on project_tasks" ON public.project_tasks AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY admin_manage_purchasers ON public.purchasers AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.email = (auth.jwt() ->> 'email'::text)) AND (user_roles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.email = (auth.jwt() ->> 'email'::text)) AND (user_roles.role = 'admin'::text)))));
CREATE POLICY auth_read_purchasers ON public.purchasers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_read_qbo_labor_entries ON public.qbo_labor_entries AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_all_qbo_project_pnl ON public.qbo_project_pnl AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can read qbo_project_pnl" ON public.qbo_project_pnl AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_all_qbo_project_wip_metrics ON public.qbo_project_wip_metrics AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service role manages quote formula overrides" ON public.quote_line_formula_overrides AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY authenticated_read_quote_line_items ON public.quote_line_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY quote_proposal_member_read ON public.quote_proposals AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY line_work_package_member_read ON public.quote_revision_line_work_packages AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY quote_line_member_read ON public.quote_revision_lines AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY quote_normalization_exception_member_read ON public.quote_revision_normalization_exceptions AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY revision_labor_member_read ON public.quote_revision_work_package_labor AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ada_quote_revisions r
  WHERE ((r.id = quote_revision_work_package_labor.revision_id) AND has_quote_workspace_access(r.workspace_id)))));
CREATE POLICY revision_work_package_member_read ON public.quote_revision_work_packages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ada_quote_revisions r
  WHERE ((r.id = quote_revision_work_packages.revision_id) AND has_quote_workspace_access(r.workspace_id)))));
CREATE POLICY quote_user_capabilities_self_read ON public.quote_user_capabilities AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (email_normalized = current_quote_actor_email()) AND (revoked_at IS NULL)));
CREATE POLICY quote_workflow_event_member_read ON public.quote_workflow_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY quote_workspace_members_self_read ON public.quote_workspace_members AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (email_normalized = current_quote_actor_email()) AND (removed_at IS NULL)));
CREATE POLICY read_user_roles ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY write_user_roles ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY authenticated_read_vendor_aliases ON public.vendor_aliases AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_manage_vendors ON public.vendors AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.email = (auth.jwt() ->> 'email'::text)) AND (user_roles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.email = (auth.jwt() ->> 'email'::text)) AND (user_roles.role = 'admin'::text)))));
CREATE POLICY auth_read_vendors ON public.vendors AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can do everything on wip_report_snapshot_ro" ON public.wip_report_snapshot_rows AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can do everything on wip_report_snapshots" ON public.wip_report_snapshots AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY work_package_member_read ON public.work_packages AS PERMISSIVE FOR SELECT TO authenticated USING (has_quote_workspace_access(workspace_id));
CREATE POLICY work_type_authenticated_read ON public.work_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE TRIGGER ada_chat_turns_updated_at BEFORE UPDATE ON ada_chat_turns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_archived_ada_chat_turns BEFORE INSERT OR DELETE OR UPDATE ON ada_chat_turns FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER ada_feedback_updated_at BEFORE UPDATE ON ada_feedback FOR EACH ROW EXECUTE FUNCTION set_ada_feedback_updated_at();
CREATE TRIGGER protect_archived_ada_feedback BEFORE INSERT OR DELETE OR UPDATE ON ada_feedback FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER ada_quote_assets_updated_at BEFORE UPDATE ON ada_quote_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER prevent_ada_quote_asset_delete BEFORE DELETE OR UPDATE ON ada_quote_assets FOR EACH ROW EXECUTE FUNCTION protect_ada_quote_asset_history();
CREATE TRIGGER protect_archived_ada_quote_assets BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_assets FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER ada_quote_concepts_updated_at BEFORE UPDATE ON ada_quote_concepts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_archived_ada_quote_concepts BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_concepts FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_archived_ada_quote_events BEFORE INSERT ON ada_quote_events FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER reject_ada_quote_event_mutation BEFORE DELETE OR UPDATE ON ada_quote_events FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER protect_archived_ada_quote_messages BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_messages FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER ada_quote_projects_updated_at BEFORE UPDATE ON ada_quote_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_archived_ada_quote_revisions BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_revisions FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_locked_quote_revision BEFORE DELETE OR UPDATE ON ada_quote_revisions FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision();
CREATE TRIGGER protect_archived_ada_quote_sheet_changes BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_sheet_changes FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_archived_ada_quote_sheets BEFORE INSERT OR DELETE OR UPDATE ON ada_quote_sheets FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER ada_quote_workspaces_updated_at BEFORE UPDATE ON ada_quote_workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_quote_workspace_projection BEFORE UPDATE ON ada_quote_workspaces FOR EACH ROW EXECUTE FUNCTION protect_quote_workspace_projection();
CREATE TRIGGER expense_auto_id BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION generate_expense_id();
CREATE TRIGGER protect_integration_outbox_identity BEFORE UPDATE ON integration_outbox FOR EACH ROW EXECUTE FUNCTION protect_integration_outbox_identity();
CREATE TRIGGER labor_worker_cost_policy_immutable BEFORE DELETE OR UPDATE ON labor_worker_cost_policies FOR EACH ROW EXECUTE FUNCTION prevent_labor_worker_cost_policy_mutation();
CREATE TRIGGER labor_worker_rate_authority_immutable BEFORE DELETE OR UPDATE ON labor_worker_rate_authority FOR EACH ROW EXECUTE FUNCTION prevent_labor_rate_authority_mutation();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_archived_quote_proposals BEFORE INSERT OR DELETE OR UPDATE ON quote_proposals FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_quote_proposal_immutability BEFORE INSERT OR DELETE OR UPDATE ON quote_proposals FOR EACH ROW EXECUTE FUNCTION protect_quote_proposal_immutability();
CREATE TRIGGER prevent_insert_into_locked_quote_revision BEFORE INSERT ON quote_revision_line_work_packages FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_revision_line_work_packages BEFORE INSERT OR DELETE OR UPDATE ON quote_revision_line_work_packages FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_locked_quote_revision_child BEFORE DELETE OR UPDATE ON quote_revision_line_work_packages FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER prevent_insert_into_locked_quote_revision BEFORE INSERT ON quote_revision_lines FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_revision_lines BEFORE INSERT OR DELETE OR UPDATE ON quote_revision_lines FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_locked_quote_revision_child BEFORE DELETE OR UPDATE ON quote_revision_lines FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_revision_normalization_exceptions BEFORE INSERT OR DELETE OR UPDATE ON quote_revision_normalization_exceptions FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER prevent_insert_into_locked_quote_revision BEFORE INSERT ON quote_revision_work_package_labor FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_revision_work_package_labor BEFORE INSERT OR DELETE OR UPDATE ON quote_revision_work_package_labor FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_locked_quote_revision_child BEFORE DELETE OR UPDATE ON quote_revision_work_package_labor FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER prevent_insert_into_locked_quote_revision BEFORE INSERT ON quote_revision_work_packages FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_revision_work_packages BEFORE INSERT OR DELETE OR UPDATE ON quote_revision_work_packages FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER protect_locked_quote_revision_child BEFORE DELETE OR UPDATE ON quote_revision_work_packages FOR EACH ROW EXECUTE FUNCTION protect_locked_quote_revision_child();
CREATE TRIGGER protect_archived_quote_workflow_events BEFORE INSERT ON quote_workflow_events FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();
CREATE TRIGGER reject_quote_workflow_event_mutation BEFORE DELETE OR UPDATE ON quote_workflow_events FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE CONSTRAINT TRIGGER validate_quote_proposal_workflow_event AFTER INSERT ON quote_workflow_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_quote_proposal_workflow_event();
CREATE TRIGGER wip_report_snapshots_updated_at BEFORE UPDATE ON wip_report_snapshots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER protect_archived_work_packages BEFORE INSERT OR DELETE OR UPDATE ON work_packages FOR EACH ROW EXECUTE FUNCTION protect_archived_quote_workspace_child();

REVOKE ALL ON FUNCTION accept_ada_quote_revision(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION archive_ada_quote_asset(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_ada_chat_turn(uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_integration_outbox(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_ada_proposal_chat_turn(uuid,uuid,uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_ada_quote_revision(uuid,text,jsonb,numeric,numeric,numeric,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_quote_workspace(text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION current_quote_actor_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION ensure_ada_proposal_chat_user_message(uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_ada_chat_turn(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_expense_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION has_quote_workspace_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION import_labor_rate_authority(text,text,text,timestamp with time zone,date,text,jsonb,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION is_quote_transition_allowed(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jsonb_contains_sensitive_material(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION normalize_labor_worker_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION normalize_legacy_quote_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION observe_financial_reconciliation_case(text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,boolean,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_labor_rate_authority_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_labor_worker_cost_policy_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_ada_quote_asset_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_archived_quote_workspace_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_integration_outbox_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_locked_quote_revision_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_locked_quote_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_quote_proposal_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_quote_workspace_projection() FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_actor_has_workspace_capability(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_deterministic_uuid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_manifest_sha256(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_proposal_validate_snapshot(jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION quote_publication_reconciliation_event(integration_outbox,ada_quote_revisions,boolean,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_quote_publication_readback(uuid,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_append_only_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_quote_proposal(uuid,uuid,text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION rename_quote_workspace(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION request_quote_publication(uuid,uuid,text,bigint,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION required_quote_capability(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION restore_quote_workspace(uuid,text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_labor_rate_import(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION set_ada_feedback_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION supersede_financial_reconciliation_cases(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_financial_reconciliation_case(uuid,integer,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_ada_quote_workspace_metadata(uuid,text,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_quote_proposal_workflow_event() FROM PUBLIC;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_chat_turns TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_chat_turns TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_chat_turns TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_chat_turns TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_feedback TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_feedback TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_feedback TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_feedback TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_assets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_assets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_assets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_assets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_concepts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_concepts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_concepts TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_concepts TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_events TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_events TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_messages TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_projects TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_projects TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_projects TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_projects TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_revisions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_revisions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_revisions TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_revisions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheet_changes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheet_changes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheet_changes TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheet_changes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_sheets TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_workspaces TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.ada_quote_workspaces TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_workspaces TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ada_quote_workspaces TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_config TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_config TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_config TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_config TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billcom_sync_state TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billcom_sync_state TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billcom_sync_state TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billcom_sync_state TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_formula_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_formula_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_formula_settings TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.budget_formula_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cogs_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cogs_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cogs_categories TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cogs_categories TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.expense_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.expense_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.expense_id_seq TO postgres;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.expense_id_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_reconciliation_case_events TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_reconciliation_case_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_reconciliation_cases TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_reconciliation_cases TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.formula_rebaseline_audits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.formula_rebaseline_audits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.formula_rebaseline_audits TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.formula_rebaseline_audits TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_outbox TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_je_reviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_je_reviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_je_reviews TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_je_reviews TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_mappings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_mappings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_mappings TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_allocation_mappings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_entries TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_rate_imports TO postgres;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.labor_rate_imports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_draft_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_draft_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_draft_entries TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_draft_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_drafts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_drafts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_drafts TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_reclass_drafts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_classifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_classifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_classifications TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_classifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_cost_policies TO postgres;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.labor_worker_cost_policies TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.labor_worker_rate_authority TO postgres;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.labor_worker_rate_authority TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.master_schedule_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.master_schedule_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.master_schedule_tasks TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.master_schedule_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_aliases TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_aliases TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_aliases TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_aliases TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_change_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_change_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_change_log TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_change_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_batches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_batches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_batches TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_batches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_rows TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_rows TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_rows TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_import_rows TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_vendor_prices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_vendor_prices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_vendor_prices TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.material_vendor_prices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materials TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.materials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_notes TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_notes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_photos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_photos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_photos TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issue_photos TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issues TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issues TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issues TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_issues TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_activity_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_activity_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_activity_events TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_activity_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_actuals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_actuals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_actuals TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_actuals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_completion_reviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_completion_reviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_completion_reviews TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_completion_reviews TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_conversation_threads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_conversation_threads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_conversation_threads TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_conversation_threads TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_labor_reconciliation_summary TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_labor_reconciliation_summary TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_operational_state TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_operational_state TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_operational_state TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_operational_state TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolio_projects TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolio_projects TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolio_projects TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolio_projects TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolios TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolios TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolios TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_portfolios TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortem_lessons TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortem_lessons TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortem_lessons TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortem_lessons TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortems TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortems TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortems TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_postmortems TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_pricing_index TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_pricing_index TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_pricing_index TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_deliveries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_deliveries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_deliveries TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_deliveries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_runs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_runs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_runs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscription_runs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscriptions TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_summary TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_summary TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_summary TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_tasks TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.project_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.projects TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.projects TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.projects TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.projects TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.purchasers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.purchasers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.purchasers TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.purchasers TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.qbo_labor_entries TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.qbo_labor_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_labor_entries TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_labor_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_pnl TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_pnl TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_pnl TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_pnl TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_wip_metrics TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_wip_metrics TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_wip_metrics TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.qbo_project_wip_metrics TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_formula_overrides TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_formula_overrides TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_formula_overrides TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_formula_overrides TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_items TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_line_items TO service_role;
GRANT SELECT ON TABLE public.quote_proposals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_proposals TO postgres;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_line_work_packages TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_line_work_packages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_line_work_packages TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_line_work_packages TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_lines TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_lines TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_lines TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_lines TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_normalization_exceptions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_normalization_exceptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_normalization_exceptions TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_normalization_exceptions TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_work_package_labor TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_work_package_labor TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_work_package_labor TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_work_package_labor TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_work_packages TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_revision_work_packages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_work_packages TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_revision_work_packages TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_user_capabilities TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_user_capabilities TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_user_capabilities TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_user_capabilities TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_workflow_events TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_workflow_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_workflow_events TO postgres;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_workflow_events TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_workspace_members TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.quote_workspace_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_workspace_members TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quote_workspace_members TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.user_roles TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.user_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendor_aliases TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendor_aliases TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendor_aliases TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendor_aliases TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendors TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendors TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendors TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vendors TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshot_rows TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshot_rows TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshot_rows TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshot_rows TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshots TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshots TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshots TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wip_report_snapshots TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.work_packages TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.work_packages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_packages TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_packages TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.work_types TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.work_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_types TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_types TO service_role;
GRANT EXECUTE ON FUNCTION accept_ada_quote_revision(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_ada_quote_revision(uuid,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_quote_proposal(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION append_quote_workflow_event(uuid,uuid,text,text,text,text,bigint,text,text,jsonb,jsonb,text) TO postgres;
GRANT EXECUTE ON FUNCTION archive_ada_quote_asset(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_ada_quote_asset(uuid,uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION claim_ada_chat_turn(uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_ada_chat_turn(uuid,text,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION claim_integration_outbox(text,integer) TO postgres;
GRANT EXECUTE ON FUNCTION claim_integration_outbox(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION complete_ada_proposal_chat_turn(uuid,uuid,uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_ada_proposal_chat_turn(uuid,uuid,uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,text) TO postgres;
GRANT EXECUTE ON FUNCTION create_ada_quote_revision(uuid,text,jsonb,numeric,numeric,numeric,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION create_ada_quote_revision(uuid,text,jsonb,numeric,numeric,numeric,jsonb,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_quote_proposal(uuid,text,bigint,uuid,jsonb,jsonb,jsonb,text) TO postgres;
GRANT EXECUTE ON FUNCTION create_quote_workspace(text,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_quote_workspace(text,uuid,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION current_quote_actor_email() TO PUBLIC;
GRANT EXECUTE ON FUNCTION current_quote_actor_email() TO anon;
GRANT EXECUTE ON FUNCTION current_quote_actor_email() TO authenticated;
GRANT EXECUTE ON FUNCTION current_quote_actor_email() TO postgres;
GRANT EXECUTE ON FUNCTION current_quote_actor_email() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_ada_proposal_chat_user_message(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_ada_proposal_chat_user_message(uuid,uuid,uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION fail_ada_chat_turn(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fail_ada_chat_turn(uuid,uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION generate_expense_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION generate_expense_id() TO anon;
GRANT EXECUTE ON FUNCTION generate_expense_id() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_expense_id() TO postgres;
GRANT EXECUTE ON FUNCTION generate_expense_id() TO service_role;
GRANT EXECUTE ON FUNCTION has_quote_workspace_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_quote_workspace_access(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION has_quote_workspace_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION import_labor_rate_authority(text,text,text,timestamp with time zone,date,text,jsonb,jsonb,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION import_labor_rate_authority(text,text,text,timestamp with time zone,date,text,jsonb,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION is_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO postgres;
GRANT EXECUTE ON FUNCTION is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION is_quote_transition_allowed(text,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION is_quote_transition_allowed(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION is_quote_transition_allowed(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION is_quote_transition_allowed(text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION is_quote_transition_allowed(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION jsonb_contains_sensitive_material(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION jsonb_contains_sensitive_material(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION jsonb_contains_sensitive_material(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jsonb_contains_sensitive_material(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION jsonb_contains_sensitive_material(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION normalize_labor_worker_name(text) TO postgres;
GRANT EXECUTE ON FUNCTION normalize_labor_worker_name(text) TO service_role;
GRANT EXECUTE ON FUNCTION normalize_legacy_quote_revision(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION observe_financial_reconciliation_case(text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,boolean,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION observe_financial_reconciliation_case(text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION prevent_labor_rate_authority_mutation() TO PUBLIC;
GRANT EXECUTE ON FUNCTION prevent_labor_rate_authority_mutation() TO anon;
GRANT EXECUTE ON FUNCTION prevent_labor_rate_authority_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION prevent_labor_rate_authority_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION prevent_labor_rate_authority_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION prevent_labor_worker_cost_policy_mutation() TO PUBLIC;
GRANT EXECUTE ON FUNCTION prevent_labor_worker_cost_policy_mutation() TO anon;
GRANT EXECUTE ON FUNCTION prevent_labor_worker_cost_policy_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION prevent_labor_worker_cost_policy_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION prevent_labor_worker_cost_policy_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION protect_ada_quote_asset_history() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_ada_quote_asset_history() TO anon;
GRANT EXECUTE ON FUNCTION protect_ada_quote_asset_history() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_ada_quote_asset_history() TO postgres;
GRANT EXECUTE ON FUNCTION protect_ada_quote_asset_history() TO service_role;
GRANT EXECUTE ON FUNCTION protect_archived_quote_workspace_child() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_archived_quote_workspace_child() TO anon;
GRANT EXECUTE ON FUNCTION protect_archived_quote_workspace_child() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_archived_quote_workspace_child() TO postgres;
GRANT EXECUTE ON FUNCTION protect_archived_quote_workspace_child() TO service_role;
GRANT EXECUTE ON FUNCTION protect_integration_outbox_identity() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_integration_outbox_identity() TO anon;
GRANT EXECUTE ON FUNCTION protect_integration_outbox_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_integration_outbox_identity() TO postgres;
GRANT EXECUTE ON FUNCTION protect_integration_outbox_identity() TO service_role;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision_child() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision_child() TO anon;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision_child() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision_child() TO postgres;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision_child() TO service_role;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision() TO anon;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision() TO postgres;
GRANT EXECUTE ON FUNCTION protect_locked_quote_revision() TO service_role;
GRANT EXECUTE ON FUNCTION protect_quote_proposal_immutability() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_quote_proposal_immutability() TO anon;
GRANT EXECUTE ON FUNCTION protect_quote_proposal_immutability() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_quote_proposal_immutability() TO postgres;
GRANT EXECUTE ON FUNCTION protect_quote_proposal_immutability() TO service_role;
GRANT EXECUTE ON FUNCTION protect_quote_workspace_projection() TO PUBLIC;
GRANT EXECUTE ON FUNCTION protect_quote_workspace_projection() TO anon;
GRANT EXECUTE ON FUNCTION protect_quote_workspace_projection() TO authenticated;
GRANT EXECUTE ON FUNCTION protect_quote_workspace_projection() TO postgres;
GRANT EXECUTE ON FUNCTION protect_quote_workspace_projection() TO service_role;
GRANT EXECUTE ON FUNCTION quote_actor_has_workspace_capability(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION quote_deterministic_uuid(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION quote_deterministic_uuid(text) TO anon;
GRANT EXECUTE ON FUNCTION quote_deterministic_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION quote_deterministic_uuid(text) TO postgres;
GRANT EXECUTE ON FUNCTION quote_deterministic_uuid(text) TO service_role;
GRANT EXECUTE ON FUNCTION quote_manifest_sha256(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION quote_manifest_sha256(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION quote_manifest_sha256(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION quote_manifest_sha256(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION quote_manifest_sha256(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION quote_proposal_validate_snapshot(jsonb,jsonb,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION quote_publication_reconciliation_event(integration_outbox,ada_quote_revisions,boolean,boolean,text) TO postgres;
GRANT EXECUTE ON FUNCTION record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ada_compatibility_event(uuid,uuid,text,text,text,text,jsonb,text) TO postgres;
GRANT EXECUTE ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION record_quote_normalization_exception(uuid,uuid,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION record_quote_publication_readback(uuid,text,text,jsonb,text) TO postgres;
GRANT EXECUTE ON FUNCTION record_quote_publication_readback(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION reject_append_only_mutation() TO PUBLIC;
GRANT EXECUTE ON FUNCTION reject_append_only_mutation() TO anon;
GRANT EXECUTE ON FUNCTION reject_append_only_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION reject_append_only_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION reject_append_only_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION reject_quote_proposal(uuid,uuid,text,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_quote_proposal(uuid,uuid,text,bigint,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION rename_quote_workspace(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION rename_quote_workspace(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION request_quote_publication(uuid,uuid,text,bigint,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION request_quote_publication(uuid,uuid,text,bigint,jsonb,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION required_quote_capability(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION required_quote_capability(text) TO anon;
GRANT EXECUTE ON FUNCTION required_quote_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION required_quote_capability(text) TO postgres;
GRANT EXECUTE ON FUNCTION required_quote_capability(text) TO service_role;
GRANT EXECUTE ON FUNCTION restore_quote_workspace(uuid,text,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_quote_workspace(uuid,text,bigint,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION revoke_labor_rate_import(uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION revoke_labor_rate_import(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO anon;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO authenticated;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO postgres;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO service_role;
GRANT EXECUTE ON FUNCTION set_ada_feedback_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_ada_feedback_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION set_ada_feedback_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION set_ada_feedback_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION set_ada_feedback_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION supersede_financial_reconciliation_cases(text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION supersede_financial_reconciliation_cases(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION transition_financial_reconciliation_case(uuid,integer,text,text,text,text,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION transition_financial_reconciliation_case(uuid,integer,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION update_ada_quote_workspace_metadata(uuid,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_ada_quote_workspace_metadata(uuid,text,text,text,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION update_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION update_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION update_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION update_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION validate_quote_event_evidence(text,uuid,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION validate_quote_proposal_workflow_event() TO postgres;

-- End schema bootstrap.
