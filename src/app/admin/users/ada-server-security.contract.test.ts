import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const usersPage = readFileSync(join(root, "src/app/admin/users/page.tsx"), "utf8");
const adminServerPath = join(root, "src/lib/admin-server.ts");
const collectionRoutePath = join(root, "src/app/api/admin/users/route.ts");
const memberRoutePath = join(root, "src/app/api/admin/users/[email]/route.ts");

test("all user-role mutations require a bearer-aware server-side admin", () => {
  assert.equal(existsSync(adminServerPath), true);
  const adminServer = readFileSync(adminServerPath, "utf8");
  assert.match(adminServer, /authorization/);
  assert.match(adminServer, /auth\.getUser\(bearerToken\)/);
  assert.match(adminServer, /roleRow\?\.role !== "admin"/);
  assert.match(adminServer, /status:\s*403/);
  assert.equal(existsSync(collectionRoutePath), true);
  assert.equal(existsSync(memberRoutePath), true);
  const collectionRoute = readFileSync(collectionRoutePath, "utf8");
  const memberRoute = readFileSync(memberRoutePath, "utf8");
  assert.match(collectionRoute, /requireAdminActor\(\)/);
  assert.match(collectionRoute, /export async function POST/);
  assert.match(memberRoute, /requireAdminActor\(\)/);
  assert.match(memberRoute, /export async function PATCH/);
  assert.match(memberRoute, /export async function DELETE/);
});

test("Admin Users sends every mutation through the protected API", () => {
  assert.match(usersPage, /authenticatedFetch/);
  assert.match(usersPage, /\/api\/admin\/users/);
  assert.doesNotMatch(usersPage, /from\("user_roles"\)\.(insert|update|delete)/);
});

test("authenticated browsers cannot write user_roles directly", () => {
  const migrationName = readdirSync(join(root, "supabase/migrations")).find((name) => name.endsWith("_lock_user_roles_mutations.sql"));
  assert.ok(migrationName);
  const migration = readFileSync(join(root, "supabase/migrations", migrationName!), "utf8");
  assert.match(migration, /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.user_roles\s+from\s+anon\s*,\s*authenticated/i);
});
