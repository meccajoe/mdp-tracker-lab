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
const usersCreateRouteSource = read('src/app/api/admin/users/route.ts');
const usersUpdateRouteSource = read('src/app/api/admin/users/[email]/route.ts');
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

test('admin users page sends editable BILL member email through secured admin APIs', () => {
  assert.match(usersPageSource, /bill_spend_email/);
  assert.match(usersPageSource, /BILL member email/i);
  assert.match(usersPageSource, /setNewBillSpendEmail/);
  assert.match(usersPageSource, /setEditBillSpendEmail/);
  assert.match(usersPageSource, /select\("\*"\)/);
  assert.match(usersPageSource, /authenticatedFetch\("\/api\/admin\/users"/);
  assert.match(usersPageSource, /billSpendEmail: newBillSpendEmail/);
  assert.match(usersPageSource, /billSpendEmail: editBillSpendEmail/);
  assert.match(usersCreateRouteSource, /requireAdminActor\(\)/);
  assert.match(usersCreateRouteSource, /billSpendEmail\.trim\(\)\.toLowerCase\(\) \|\| null/);
  assert.match(usersCreateRouteSource, /bill_spend_email: billSpendEmail/);
  assert.match(usersUpdateRouteSource, /requireAdminActor\(\)/);
  assert.match(usersUpdateRouteSource, /updates\.bill_spend_email = typeof body\.billSpendEmail === "string" \? body\.billSpendEmail\.trim\(\)\.toLowerCase\(\) \|\| null : null/);
});

test('automatic and manual BILL budget create paths use canonical BILL member mapping from user_roles', () => {
  assert.match(webhookRouteSource, /select\("email, bill_spend_email"\)/);
  assert.match(webhookRouteSource, /resolveBillSpendMemberEmail\(pmRow\)/);
  assert.match(manualRouteSource, /select\("email, bill_spend_email"\)/);
  assert.match(manualRouteSource, /resolveBillSpendMemberEmail\(pmRow\)/);
});
