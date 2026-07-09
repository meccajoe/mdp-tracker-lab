import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url);

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function findMigration(fragment) {
  const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
  const names = fs.readdirSync(migrationsDir).sort();
  const match = names.find((name) => name.includes(fragment));
  assert.ok(match, `expected migration containing ${fragment}`);
  return fs.readFileSync(path.join(migrationsDir.pathname, match), 'utf8');
}

test('wip reporting migration removes job nickname from report-facing schema and keeps refreshed project_summary semantics', () => {
  const sql = findMigration('remove_job_nickname_from_wip');

  assert.match(sql, /ALTER TABLE projects DROP COLUMN IF EXISTS job_nickname;/);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows DROP COLUMN IF EXISTS job_nickname;/);
  assert.doesNotMatch(sql, /p\.job_nickname,/);
  assert.match(sql, /COALESCE\(p\.budget_rental, 0\) \+/);
  assert.match(sql, /COALESCE\(p\.budget_crating, 0\) \+/);
  assert.match(sql, /COALESCE\(p\.budget_materials, 0\) \+/);
});

test('wip reporting migration adds remaining WIP fields, snapshot tables, and refreshed project_summary semantics', () => {
  const sql = findMigration('wip_reporting');

  assert.doesNotMatch(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_nickname text;/);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS wip_class text;/);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS sales_tax_included text;/);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_cost_override numeric\(12,2\);/);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS wip_report_snapshots/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS wip_report_snapshot_rows/i);
  assert.match(sql, /status text NOT NULL/i);
  assert.match(sql, /CHECK \(status IN \('draft', 'final'\)\)/i);

  assert.doesNotMatch(sql, /p\.job_nickname,/);
  assert.match(sql, /p\.wip_class,/);
  assert.match(sql, /p\.sales_tax_included,/);
  assert.match(sql, /p\.estimated_cost_override,/);
  assert.match(sql, /COALESCE\(p\.budget_rental, 0\) \+/);
  assert.match(sql, /COALESCE\(p\.budget_crating, 0\) \+/);
  assert.match(sql, /COALESCE\(p\.budget_materials, 0\) \+/);
});

test('project types expose WIP reporting fields and snapshot interfaces', () => {
  const source = read('../src/lib/types.ts');

  assert.doesNotMatch(source, /job_nickname: string \| null;/);
  assert.match(source, /wip_class: string \| null;/);
  assert.match(source, /sales_tax_included: string \| null;/);
  assert.match(source, /estimated_cost_override: number \| null;/);
  assert.match(source, /export interface WipReportSnapshot/);
  assert.match(source, /export interface WipReportSnapshotRow/);
  assert.match(source, /updated_contract_amount: number \| null;/);
  assert.match(source, /updated_est_cost: number \| null;/);
  assert.match(source, /updated_est_gross_profit: number \| null;/);
  assert.match(source, /est_gpm_pct: number \| null;/);
  assert.match(source, /total_billed_to_date: number \| null;/);
  assert.match(source, /total_cost_to_date: number \| null;/);
  assert.match(source, /cost_pct_complete: number \| null;/);
  assert.match(source, /revenue_earned: number \| null;/);
  assert.match(source, /job_profit_earned: number \| null;/);
  assert.match(source, /job_profit_pct_earned: number \| null;/);
  assert.match(source, /billings_in_excess_of_costs: number \| null;/);
  assert.match(source, /costs_in_excess_of_billings: number \| null;/);
  assert.match(source, /current_year_total_billings: number \| null;/);
  assert.match(source, /current_year_total_retainage: number \| null;/);
  assert.match(source, /current_year_costs: number \| null;/);
  assert.doesNotMatch(source, /job_nickname: string \| null;/);
});

test('phase 1A migration expands WIP snapshot rows for the visible summary contract', () => {
  const sql = findMigration('mdp_wip_visible_summary_phase1a');

  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_contract_amount numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_est_cost numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS updated_est_gross_profit numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS est_gpm_pct numeric\(12,6\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS total_billed_to_date numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS total_cost_to_date numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS cost_pct_complete numeric\(12,6\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS revenue_earned numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS job_profit_earned numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS job_profit_pct_earned numeric\(12,6\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS billings_in_excess_of_costs numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS costs_in_excess_of_billings numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_total_billings numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_total_retainage numeric\(12,2\);/i);
  assert.match(sql, /ALTER TABLE wip_report_snapshot_rows ADD COLUMN IF NOT EXISTS current_year_costs numeric\(12,2\);/i);
});

test('phase 1C migration adds cached date-scoped QBO WIP metrics storage', () => {
  const sql = findMigration('mdp_wip_qbo_metrics_cache');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS qbo_project_wip_metrics/i);
  assert.match(sql, /project_id text NOT NULL REFERENCES projects\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /as_of_date date NOT NULL/i);
  assert.match(sql, /total_billed_to_date numeric\(12,2\)/i);
  assert.match(sql, /current_year_total_billings numeric\(12,2\)/i);
  assert.match(sql, /current_year_total_retainage numeric\(12,2\)/i);
  assert.match(sql, /current_year_costs numeric\(12,2\)/i);
  assert.match(sql, /billing_source text NOT NULL/i);
  assert.match(sql, /cost_source text NOT NULL/i);
  assert.match(sql, /PRIMARY KEY \(project_id, as_of_date\)/i);
});

test('sidebar exposes an admin-only Reports section with WIP route', () => {
  const source = read('../src/components/Sidebar.tsx');

  assert.match(source, /SectionHeader label="Reports"/);
  assert.match(source, /href="\/admin\/reports\/wip" label="WIP"/);
});

test('edit project page exposes the remaining WIP reporting metadata fields without job nickname', () => {
  const source = read('../src/app/projects/[id]/edit/page.tsx');

  assert.doesNotMatch(source, /Job Nickname/);
  assert.match(source, /WIP Class/);
  assert.match(source, /Sales Tax Included/);
  assert.match(source, /Estimated Cost Override/);
});

test('wip report page, live route, and helpers support the server-computed visible-summary WIP surface', () => {
  const page = read('../src/app/admin/reports/wip/page.tsx');
  const liveRoute = read('../src/app/api/reports/wip/live/route.ts');
  const helper = read('../src/lib/wip-report.ts');
  const formulas = read('../src/lib/wip-report-formulas.ts');
  const qboWip = read('../src/lib/qbo-project-wip.ts');
  const modal = read('../src/components/wip-project-dialog.tsx');
  const estimatedCostDialog = read('../src/components/wip-estimated-cost-dialog.tsx');

  assert.match(page, /Export CSV/);
  assert.match(page, /Export Excel/);
  assert.match(page, /Create Snapshot/);
  assert.match(page, /Edit Snapshot/);
  assert.match(page, /Delete Snapshot/);
  assert.match(page, /Save Snapshot Changes/);
  assert.match(page, /Draft/);
  assert.match(page, /Final/);
  assert.match(page, /As of Date/);
  assert.match(page, /\/api\/reports\/wip\/live/);
  assert.match(page, /fetch\(/);
  assert.doesNotMatch(page, /Job Nickname/);
  assert.match(page, /from\("wip_report_snapshots"\)/);
  assert.match(page, /from\("wip_report_snapshot_rows"\)/);
  assert.match(page, /\.update\(\{/);
  assert.match(page, /\.delete\(\)/);
  assert.match(page, /confirm\(`Delete snapshot/);
  assert.match(page, /WipProjectDialog/);
  assert.match(page, /WipEstimatedCostDialog/);
  assert.match(page, /Updated Contract Amount/);
  assert.match(page, /Updated Est Cost/);
  assert.match(page, /Updated Est Gross Profit/);
  assert.match(page, /Est GPM%/);
  assert.match(page, /Total Billed to Date/);
  assert.match(page, /Total Cost to Date/);
  assert.match(page, /Cost % Complete/);
  assert.match(page, /Revenue Earned/);
  assert.match(page, /Job Profit Earned/);
  assert.match(page, /Job Profit % Earned/);
  assert.match(page, /Billings in Excess of Costs/);
  assert.match(page, /Costs in Excess of Billings/);
  assert.match(page, /Current Year Total Billings/);
  assert.match(page, /Current Year Total Retainage/);
  assert.match(page, /Current Year Costs/);
  assert.match(page, /triggerLabel=\{row\.project_name\}/);
  assert.match(page, /triggerLabel=\{formatCurrency\(row\.updated_est_cost\)\}/);

  assert.match(liveRoute, /ProjectProfitabilitySummary/);
  assert.match(liveRoute, /buildLiveWipRow/);
  assert.match(liveRoute, /from\("qbo_project_wip_metrics"\)/);
  assert.match(liveRoute, /\.upsert\(/);
  assert.match(liveRoute, /requireMaterialsAdmin|createServerClient|canManageProjectActions/);

  assert.match(modal, /Dialog/);
  assert.match(modal, /from\("project_summary"\)/);
  assert.match(modal, /Open Full Project/);
  assert.match(modal, /href=\{`\/projects\/\$\{row\.project_id\}`\}/);
  assert.match(modal, /View Snapshot Row/);

  assert.match(estimatedCostDialog, /Dialog/);
  assert.match(estimatedCostDialog, /from\("project_summary"\)/);
  assert.match(estimatedCostDialog, /Budget Breakdown/);
  assert.match(estimatedCostDialog, /Category/);
  assert.match(estimatedCostDialog, /Percent/);
  assert.match(estimatedCostDialog, /Budget Dollars/);
  assert.match(estimatedCostDialog, /Labor Hours/);
  assert.match(estimatedCostDialog, /Project Management/);
  assert.match(estimatedCostDialog, /buildWipBudgetBreakdownRows/);
  assert.match(estimatedCostDialog, /BUDGET_CATEGORY_TOOLTIPS/);

  assert.match(helper, /export function buildWipCsv/);
  assert.match(helper, /export function buildWipWorkbook/);
  assert.match(helper, /export function resolveEstimatedCost/);
  assert.match(helper, /export function buildLiveWipRow/);
  assert.doesNotMatch(helper, /job_nickname/);

  assert.match(formulas, /export interface WipFinancialActuals/);
  assert.match(formulas, /export function buildWipSummaryMetrics/);
  assert.match(formulas, /billings_in_excess_of_costs/);
  assert.match(formulas, /costs_in_excess_of_billings/);

  assert.match(qboWip, /export function buildProjectProfitabilitySummaryUrl/);
  assert.match(qboWip, /export function buildQboProjectWipMetrics/);
  assert.match(qboWip, /export function buildCachedQboProjectWipMetricRow/);
  assert.match(qboWip, /export function canServeHistoricalWipCache/);
  assert.match(qboWip, /current_year_total_billings/);
  assert.match(qboWip, /current_year_total_retainage/);
});

test('package.json includes xlsx for native Excel export', () => {
  const pkg = read('../package.json');
  assert.match(pkg, /"xlsx"\s*:/);
});
