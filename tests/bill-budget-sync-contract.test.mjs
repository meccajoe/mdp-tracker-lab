import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const helperSource = fs.readFileSync(path.resolve('src/lib/billcom-budget.ts'), 'utf8');
const webhookSource = fs.readFileSync(path.resolve('src/app/api/webhooks/hubspot/route.ts'), 'utf8');
const manualRouteSource = fs.readFileSync(path.resolve('src/app/api/projects/[id]/bill-budget/route.ts'), 'utf8');
const projectPageSource = fs.readFileSync(path.resolve('src/app/projects/[id]/page.tsx'), 'utf8');
const editPageSource = fs.readFileSync(path.resolve('src/app/projects/[id]/edit/page.tsx'), 'utf8');

test('BILL budget helper can patch an existing BILL budget to current travel/props totals', () => {
  assert.match(helperSource, /export async function updateBillBudgetForProject\(/, 'helper should expose update path for existing budgets');
  assert.match(helperSource, /method: "PATCH"/, 'existing BILL budgets should sync with PATCH');
  assert.match(helperSource, /\/v3\/spend\/budgets\/\$\{budgetUuid\}/, 'helper should target the existing BILL budget endpoint');
  assert.match(helperSource, /description = buildBillBudgetDescription\(/, 'update should rebuild the BILL description from current travel/props totals');
  assert.match(helperSource, /limit: total/, 'update should patch the BILL budget limit to the current total');
});

test('webhook resync updates existing BILL budgets instead of only marking them already seeded', () => {
  assert.match(webhookSource, /updateBillBudgetForProject\(/, 'webhook should sync existing BILL budgets when project budgets change');
  assert.match(webhookSource, /if \(existingBillBudgetUuid\) \{[\s\S]*const syncResult = await updateBillBudgetForProject\(/, 'existing-budget webhook path should patch the live BILL budget');
});

test('manual BILL budget route syncs existing budgets instead of hard failing when one already exists', () => {
  assert.match(manualRouteSource, /updateBillBudgetForProject\(/, 'manual route should be able to sync existing budgets');
  assert.doesNotMatch(manualRouteSource, /BILL budget already exists for this project/, 'manual route should no longer hard-stop when an existing BILL budget needs syncing');
});

test('project budget edit flows sync BILL when a linked BILL budget already exists', () => {
  assert.match(projectPageSource, /fetch\(`\/api\/projects\/\$\{project\.id\}\/bill-budget`, \{ method: "POST" \}\)/, 'project detail save should trigger BILL sync for linked budgets');
  assert.match(editPageSource, /fetch\(`\/api\/projects\/\$\{projectId\}\/bill-budget`, \{ method: "POST" \}\)/, 'project edit page save should trigger BILL sync for linked budgets');
});
