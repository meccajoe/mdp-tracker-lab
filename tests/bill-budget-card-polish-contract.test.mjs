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

test('project page shows Notes above timeline and BILL cards, collapsed by default', () => {
  const notesIndex = pageSource.indexOf('project.notes && (');
  const timelineIndex = pageSource.indexOf('CardTitle className="text-base">Timeline');
  const billIndex = pageSource.indexOf('CardTitle className="text-base">BILL Budget');

  assert.ok(notesIndex >= 0, 'notes disclosure should exist');
  assert.ok(timelineIndex >= 0, 'timeline card should exist');
  assert.ok(billIndex >= 0, 'BILL budget card should exist');
  assert.ok(notesIndex < timelineIndex, 'notes should render above the timeline card row');
  assert.ok(notesIndex < billIndex, 'notes should render above the BILL budget card row');
  assert.match(pageSource, /<details className="[^"]*group[^"]*">/, 'notes should use a disclosure element');
  assert.doesNotMatch(pageSource, /<details[^>]*open[^>]*>[\s\S]*<span className="font-medium">Notes<\/span>/, 'notes should stay collapsed by default');
});

test('BILL budget route supports stale-link recovery state', () => {
  assert.match(routeSource, /missing_in_bill/, 'route should support missing_in_bill status');
  assert.match(routeSource, /bill_budget_uuid = null|bill_budget_uuid:\s*null/, 'route should clear stale BILL budget linkage when missing');
});
