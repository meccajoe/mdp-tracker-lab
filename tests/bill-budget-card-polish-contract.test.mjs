import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pageSource = fs.readFileSync(path.resolve('src/app/projects/[id]/page.tsx'), 'utf8');
const routeSource = fs.readFileSync(path.resolve('src/app/api/projects/[id]/bill-budget/route.ts'), 'utf8');
const helperSource = fs.readFileSync(path.resolve('src/lib/billcom-budget.ts'), 'utf8');

test('BILL budget card wraps actions and uses readable missing-budget copy', () => {
  assert.match(pageSource, /CardHeader[\s\S]*flex-wrap/, 'card header should allow wrapping so action buttons do not clip');
  assert.match(pageSource, /Recreate BILL Budget/, 'card should explicitly expose recreate wording');
  assert.match(pageSource, /couldn\'t find the previously linked BILL budget/i, 'card should use readable missing-budget note instead of raw status/error text');
  assert.match(pageSource, /getReadableBillBudgetNote\(project\)/, 'render path should use readable helper note');
  assert.doesNotMatch(pageSource, /\{project\.bill_budget_last_sync_error\}/, 'card should not dump raw integration error text directly');
});

test('missing PM email is treated as non-actionable for BILL budget creation', () => {
  assert.match(helperSource, /case "missing_pm_email":/, 'helper should explicitly handle missing PM email');
  assert.match(helperSource, /case "missing_pm_email":[\s\S]*return null;/, 'missing PM email should not produce a user-facing warning string');
  assert.doesNotMatch(pageSource, /no PM email is set for this project yet/i, 'project page should not blame missing project PM email in BILL note copy');
});

test('project page keeps Notes compact in an on-demand dialog', () => {
  const notesIndex = pageSource.indexOf('project.notes && (');

  assert.ok(notesIndex >= 0, 'notes control should exist');
  assert.match(pageSource, /<Dialog>[\s\S]*aria-label="Open project notes"/);
  assert.match(pageSource, /<DialogTitle>Project notes<\/DialogTitle>/);
  assert.doesNotMatch(pageSource, /<details[^>]*>[\s\S]*Notes/, 'the superseded disclosure should remain removed');
});

test('BILL budget route supports stale-link recovery state', () => {
  assert.match(routeSource, /missing_in_bill/, 'route should support missing_in_bill status');
  assert.match(routeSource, /bill_budget_uuid = null|bill_budget_uuid:\s*null/, 'route should clear stale BILL budget linkage when missing');
});
