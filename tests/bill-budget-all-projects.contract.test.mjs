import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

const helperSource = read('src/lib/billcom-budget.ts');
const newProjectSource = read('src/app/projects/new/page.tsx');
const dataEntrySource = read('src/app/admin/data-entry/page.tsx');
const backfillPath = path.resolve('scripts/backfill-bill-budgets.ts');

const { buildBillBudgetMemberEmails, buildBillBudgetOwnerEmails, shouldSeedBillBudget } = await import(path.resolve('src/lib/billcom-budget.ts'));

test('every project without a BILL UUID is eligible even when travel and props are zero', () => {
  assert.equal(shouldSeedBillBudget({ bill_budget_uuid: null, budget_travel: 0, budget_props: 0 }), true);
  assert.equal(shouldSeedBillBudget({ bill_budget_uuid: null, budget_travel: 1200, budget_props: 500 }), true);
  assert.equal(shouldSeedBillBudget({ bill_budget_uuid: 'existing', budget_travel: 0, budget_props: 0 }), false);
  assert.doesNotMatch(helperSource, /if \(total <= 0\)[\s\S]{0,160}no_bill_managed_budget_default/);
});

test('BILL create reconciles exact deterministic names before POST and fails closed when lookup fails', () => {
  assert.match(helperSource, /findBillBudgetByExactName/);
  assert.match(helperSource, /\/v3\/spend\/budgets/);
  assert.match(helperSource, /BILL_SPEND_BUDGETS_PAGE_LIMIT/);
  assert.match(helperSource, /attached/);
  const lookupIndex = helperSource.indexOf('findBillBudgetByExactName');
  const postIndex = helperSource.indexOf('method: "POST"', lookupIndex);
  assert.ok(lookupIndex >= 0 && postIndex > lookupIndex, 'exact-name lookup must precede POST create');
  assert.match(helperSource, /billcom_budgets_lookup_failed/);
});

test('every created or attached budget uses Paul and Emily as owners with PM, David, and Rooster as members', () => {
  assert.deepEqual(buildBillBudgetOwnerEmails(), ['paul@meccadesign.com', 'emily@meccadesign.com']);
  assert.deepEqual(buildBillBudgetMemberEmails('nick@meccadesign.com'), [
    'production@meccadesign.com',
    'rooster@meccadesign.com',
    'nick@meccadesign.com',
  ]);
  assert.match(helperSource, /owners:\s*ownerUuids/);
  assert.match(helperSource, /reconcileBillBudgetOwners/);
  assert.match(helperSource, /billcom_budget_owner_missing_after_assign/);
});

test('both browser project creation paths request BILL creation after the project insert', () => {
  for (const source of [newProjectSource, dataEntrySource]) {
    assert.match(source, /ensureBillBudgetForProject/);
    assert.match(source, /from\("projects"\)\.insert/);
  }
  assert.ok(
    newProjectSource.lastIndexOf('ensureBillBudgetForProject') > newProjectSource.indexOf('.from("projects").insert'),
    'new project page must seed only after insert succeeds',
  );
  assert.ok(
    dataEntrySource.lastIndexOf('ensureBillBudgetForProject') > dataEntrySource.indexOf('.from("projects").insert'),
    'data entry must seed only after insert succeeds',
  );
});

test('backfill is dry-run by default, paginates Tracker projects, and persists exact outcomes only in apply mode', () => {
  assert.ok(fs.existsSync(backfillPath), 'scripts/backfill-bill-budgets.ts should exist');
  const source = read('scripts/backfill-bill-budgets.ts');
  assert.match(source, /--apply/);
  assert.match(source, /dryRun/);
  assert.match(source, /\.range\(/);
  assert.match(source, /status\s*===\s*"Active"/);
  assert.match(source, /bill_budget_uuid/);
  assert.match(source, /seedBillBudgetForProject/);
  assert.match(source, /bill_budget_seed_source:\s*"existing_project_backfill"/);
  assert.match(source, /created|attached/);
  assert.match(source, /JSON\.stringify\(summary/);
});
