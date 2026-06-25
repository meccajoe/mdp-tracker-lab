import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function findMigration(fragment) {
  const migrationsDir = path.resolve('supabase/migrations');
  const names = fs.readdirSync(migrationsDir).sort();
  const match = names.find((name) => name.includes(fragment));
  assert.ok(match, `expected migration containing ${fragment}`);
  return fs.readFileSync(path.join(migrationsDir, match), 'utf8');
}

const helperSource = read('src/lib/billcom-budget.ts');
const typesSource = read('src/lib/types.ts');
const usersPageSource = read('src/app/admin/users/page.tsx');
const webhookRouteSource = read('src/app/api/webhooks/hubspot/route.ts');
const manualRouteSource = read('src/app/api/projects/[id]/bill-budget/route.ts');

test('user_roles schema and shared types support canonical BILL Spend member email mapping', () => {
  const sql = findMigration('bill_spend_email');

  assert.match(sql, /ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS bill_spend_email text;/i);
  assert.match(sql, /UPDATE user_roles\s+SET bill_spend_email = lower\(email\)/i);
  assert.match(typesSource, /bill_spend_email: string \| null;/);
});

test('BILL budget helper exposes canonical PM member email resolver', () => {
  assert.match(helperSource, /export function resolveBillSpendMemberEmail\(/);
  assert.match(helperSource, /bill_spend_email\?: string \| null/);
  assert.match(helperSource, /normalizeEmail\(user\.bill_spend_email\) \?\? normalizeEmail\(user\.email\)/);
});

test('admin users page exposes editable BILL member email mapping', () => {
  assert.match(usersPageSource, /bill_spend_email/);
  assert.match(usersPageSource, /BILL member email/i);
  assert.match(usersPageSource, /setNewBillSpendEmail/);
  assert.match(usersPageSource, /setEditBillSpendEmail/);
  assert.match(usersPageSource, /select\("\*"\)/);
  assert.match(usersPageSource, /bill_spend_email: newBillSpendEmail\.trim\(\)\.toLowerCase\(\) \|\| null/);
  assert.match(usersPageSource, /bill_spend_email: editBillSpendEmail\.trim\(\)\.toLowerCase\(\) \|\| null/);
});

test('automatic and manual BILL budget create paths use canonical BILL member mapping from user_roles', () => {
  assert.match(webhookRouteSource, /select\("email, bill_spend_email"\)/);
  assert.match(webhookRouteSource, /resolveBillSpendMemberEmail\(pmRow\)/);
  assert.match(manualRouteSource, /select\("email, bill_spend_email"\)/);
  assert.match(manualRouteSource, /resolveBillSpendMemberEmail\(pmRow\)/);
});
