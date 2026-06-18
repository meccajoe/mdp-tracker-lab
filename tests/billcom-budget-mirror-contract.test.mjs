import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve('src/app/api/webhooks/hubspot/route.ts');
const routeSource = fs.readFileSync(routePath, 'utf8');
const typesPath = path.resolve('src/lib/types.ts');
const typesSource = fs.readFileSync(typesPath, 'utf8');
const helperPath = path.resolve('src/lib/billcom-budget.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');

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
