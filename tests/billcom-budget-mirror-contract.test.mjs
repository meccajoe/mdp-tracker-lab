import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function readIfExists(relativePath) {
  const resolved = path.resolve(relativePath);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
}

const routeSource = read('src/app/api/webhooks/hubspot/route.ts');
const typesSource = read('src/lib/types.ts');
const helperSource = read('src/lib/billcom-budget.ts');
const manualRouteSource = readIfExists('src/app/api/projects/[id]/bill-budget/route.ts');
const projectPageSource = read('src/app/projects/[id]/page.tsx');

const {
  BILL_DEFAULT_INCLUDED_BUDGET_KEYS,
  calculateBillManagedBudgetTotal,
  buildBillBudgetDescription,
  shouldSeedBillBudget,
} = await import(path.resolve('src/lib/billcom-budget.ts'));

function findMigration(fragment) {
  const migrationsDir = path.resolve('supabase/migrations');
  const names = fs.readdirSync(migrationsDir).sort();
  const match = names.find((name) => name.includes(fragment));
  assert.ok(match, `expected migration containing ${fragment}`);
  return fs.readFileSync(path.join(migrationsDir, match), 'utf8');
}

test('Bill budget mirror fields are added to projects schema and project typing', () => {
  const sql = findMigration('bill_budget_mirror');

  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_uuid text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_name text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_seeded_at timestamptz;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_seed_source text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_last_sync_status text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_last_sync_error text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_job_name_snapshot text;/i);
  assert.match(sql, /ALTER TABLE projects ADD COLUMN IF NOT EXISTS bill_budget_total_snapshot numeric\(12,2\);/i);

  assert.match(typesSource, /bill_budget_uuid: string \| null;/);
  assert.match(typesSource, /bill_budget_name: string \| null;/);
  assert.match(typesSource, /bill_budget_seeded_at: string \| null;/);
  assert.match(typesSource, /bill_budget_seed_source: string \| null;/);
  assert.match(typesSource, /bill_budget_last_sync_status: string \| null;/);
  assert.match(typesSource, /bill_budget_last_sync_error: string \| null;/);
  assert.match(typesSource, /bill_job_name_snapshot: string \| null;/);
  assert.match(typesSource, /bill_budget_total_snapshot: number \| null;/);
});

test('Bill budget mirror defaults only include travel and props in the subtotal', () => {
  assert.deepEqual(BILL_DEFAULT_INCLUDED_BUDGET_KEYS, ['budget_travel', 'budget_props']);

  const total = calculateBillManagedBudgetTotal({
    budget_travel: 1200,
    budget_props: 500,
    budget_materials: 8000,
    budget_shipping: 3000,
    budget_equipment: 900,
  });

  assert.equal(total, 1700);
});

test('Bill budget description stays compact enough for BILL create requests while preserving the key snapshot', () => {
  const description = buildBillBudgetDescription({
    projectId: '26115',
    jobName: '26115 - Sample Project',
    travel: 1200,
    props: 500,
    total: 1700,
    seededAt: '2026-06-18',
  });

  assert.match(description, /Travel \$1,200/);
  assert.match(description, /Props \$500/);
  assert.match(description, /Total \$1,700/);
  assert.match(description, /MDP seed 2026-06-18/);
  assert.ok(description.length <= 120, `expected compact BILL description, got ${description.length} chars`);
  assert.doesNotMatch(description, /Excluded from BILL default budget:/);
  assert.doesNotMatch(description, /Full project budget/i);
});

test('Bill budget seed helper skips zero budgets and avoids overwrite when a BILL budget already exists', () => {
  assert.equal(
    shouldSeedBillBudget({
      bill_budget_uuid: null,
      budget_travel: 0,
      budget_props: 0,
    }),
    false,
  );

  assert.equal(
    shouldSeedBillBudget({
      bill_budget_uuid: 'bud_123',
      budget_travel: 1200,
      budget_props: 500,
    }),
    false,
  );

  assert.equal(
    shouldSeedBillBudget({
      bill_budget_uuid: null,
      budget_travel: 1200,
      budget_props: 500,
    }),
    true,
  );
});

test('Closed Won webhook route wires the BILL budget helper and protects existing BILL budgets from auto-overwrite', () => {
  assert.match(routeSource, /from\("projects"\)\s*\.select\("id, bill_budget_uuid/);
  assert.match(routeSource, /calculateBillManagedBudgetTotal/);
  assert.match(routeSource, /buildBillBudgetDescription/);
  assert.match(routeSource, /shouldSeedBillBudget/);
  assert.match(routeSource, /bill_budget_uuid/);
  assert.match(routeSource, /seedBillBudgetForProject/);
});

test('Bill budget helper uses BILL budget description field and initial-create semantics', () => {
  assert.match(helperSource, /description/);
  assert.match(helperSource, /BILLCOM_BUDGET_OWNER_UUID/);
  assert.match(helperSource, /recurringInterval/);
  assert.match(helperSource, /NONE/);
  assert.match(helperSource, /POST/);
  assert.doesNotMatch(helperSource, /PATCH[\s\S]*existing bill budget/i);
});

test('Bill budget helper defaults owner to Paul and supports PM member assignment after create', () => {
  assert.match(helperSource, /paul@meccadesign\.com/);
  assert.match(helperSource, /\/v3\/spend\/users/);
  assert.match(helperSource, /\/v3\/spend\/budgets\/\$\{budgetUuid\}\/members\/\$\{memberUuid\}/);
  assert.match(helperSource, /limit:/);
  assert.match(helperSource, /recurringLimit:/);
});

test('manual BILL budget trigger route requires admin auth and writes manual trigger source', () => {
  assert.match(manualRouteSource, /canManageProjectActions/);
  assert.match(manualRouteSource, /Authentication required/);
  assert.match(manualRouteSource, /Admin access required/);
  assert.match(manualRouteSource, /seedBillBudgetForProject/);
  assert.match(manualRouteSource, /manual_project_trigger/);
  assert.match(manualRouteSource, /no_bill_managed_budget_default/);
});

test('manual BILL budget route validates linked budgets, returns a BILL Spend view URL, and clears stale linkage when BILL record is missing or retired', () => {
  assert.match(manualRouteSource, /export async function GET/);
  assert.match(manualRouteSource, /getBillBudgetByUuid/);
  assert.match(manualRouteSource, /buildBillBudgetViewUrl/);
  assert.match(manualRouteSource, /viewUrl:/);
  assert.match(manualRouteSource, /missing_in_bill/);
  assert.match(manualRouteSource, /bill_budget_uuid: null/);
  assert.match(manualRouteSource, /bill_budget_name: null/);
  assert.match(manualRouteSource, /billcom_budget_missing:/);
});

test('project page exposes BILL budget status plus create/view actions through the validated BILL view URL', () => {
  assert.match(projectPageSource, /BILL Budget/);
  assert.match(projectPageSource, /Create BILL Budget/);
  assert.match(projectPageSource, /Recreate BILL Budget/);
  assert.match(projectPageSource, /View BILL Budget/);
  assert.match(projectPageSource, /\/api\/projects\/\$\{projectId\}\/bill-budget/);
  assert.match(projectPageSource, /billBudgetViewUrl/);
  assert.doesNotMatch(projectPageSource, /buildBillBudgetViewUrl\(project\.bill_budget_uuid\)/);
  assert.match(projectPageSource, /missing_in_bill/);
  assert.match(projectPageSource, /bill_budget_last_sync_status/);
  assert.match(projectPageSource, /bill_budget_uuid/);
});

test('project page merges BILL linkage fields from projects when project_summary omits them', () => {
  assert.match(projectPageSource, /from\("project_summary"\)/);
  assert.match(projectPageSource, /from\("projects"\)/);
  assert.match(projectPageSource, /bill_budget_uuid/);
  assert.match(projectPageSource, /bill_budget_name/);
  assert.match(projectPageSource, /bill_budget_last_sync_status/);
  assert.match(projectPageSource, /bill_job_name_snapshot/);
});

test('Bill budget helper exposes a stable BILL Spend budget record URL builder', () => {
  assert.match(helperSource, /const BILLCOM_SPEND_URL = process\.env\.BILLCOM_SPEND_URL \?\? "https:\/\/spend\.bill\.com";/);
  assert.match(helperSource, /const BILLCOM_SPEND_COMPANY_ID = process\.env\.BILLCOM_SPEND_COMPANY_ID \?\? "Q29tcGFueTo1Njg3MzU=";/);
  assert.match(helperSource, /export function buildBillBudgetViewUrl/);
  assert.match(helperSource, /companies\/\$\{companyId \?\? BILLCOM_SPEND_COMPANY_ID\}\/budgets\/\$\{budgetId\}/);
  assert.doesNotMatch(helperSource, /return buildBillcomUrl\(`\/v3\/spend\/budgets\/\$\{budgetUuid\}`\);/);
});

test('Bill budget helper exposes linked-budget lookup for stale-link validation', () => {
  assert.match(helperSource, /export async function getBillBudgetByUuid/);
  assert.match(helperSource, /billcom_budget_lookup_failed/);
  assert.match(helperSource, /response\.status === 404/);
  assert.match(helperSource, /data\.retired/);
  assert.match(helperSource, /billcom_budget_missing:retired/);
});
