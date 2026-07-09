-- Phase 1A: expand WIP snapshot rows to freeze the visible-summary contract.
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_contract_amount numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_est_cost numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_est_gross_profit numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS est_gpm_pct numeric(12,6);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS total_billed_to_date numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS total_cost_to_date numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS cost_pct_complete numeric(12,6);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS revenue_earned numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS job_profit_earned numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS job_profit_pct_earned numeric(12,6);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS billings_in_excess_of_costs numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS costs_in_excess_of_billings numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_total_billings numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_total_retainage numeric(12,2);
ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_costs numeric(12,2);
