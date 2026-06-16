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
  assert.doesNotMatch(source, /job_nickname: string \| null;/);
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

test('wip report page and helper support live view, snapshots, exports, snapshot editing/deletion, and omit job nickname', () => {
  const page = read('../src/app/admin/reports/wip/page.tsx');
  const helper = read('../src/lib/wip-report.ts');

  assert.match(page, /Export CSV/);
  assert.match(page, /Export Excel/);
  assert.match(page, /Create Snapshot/);
  assert.match(page, /Edit Snapshot/);
  assert.match(page, /Delete Snapshot/);
  assert.match(page, /Save Snapshot Changes/);
  assert.match(page, /Draft/);
  assert.match(page, /Final/);
  assert.match(page, /Contract Date/);
  assert.match(page, /Completion Date/);
  assert.doesNotMatch(page, /Job Nickname/);
  assert.match(page, /from\("project_summary"\)/);
  assert.match(page, /from\("wip_report_snapshots"\)/);
  assert.match(page, /from\("wip_report_snapshot_rows"\)/);
  assert.match(page, /\.update\(\{/);
  assert.match(page, /\.delete\(\)/);
  assert.match(page, /confirm\(`Delete snapshot/);

  assert.match(helper, /export function buildWipCsv/);
  assert.match(helper, /export function buildWipWorkbook/);
  assert.match(helper, /export function resolveEstimatedCost/);
  assert.doesNotMatch(helper, /job_nickname/);
});

test('package.json includes xlsx for native Excel export', () => {
  const pkg = read('../package.json');
  assert.match(pkg, /"xlsx"\s*:/);
});
