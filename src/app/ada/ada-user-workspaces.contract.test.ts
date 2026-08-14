import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const migrations = join(root, "supabase/migrations");
const access = join(root, "src/lib/ada-server.ts");
const workspaces = join(root, "src/app/api/ada/workspaces/route.ts");
test("Ada grants explicit access and scopes workspace listings to the active owner", () => {
  const file = readdirSync(migrations).find((name) => name.endsWith("_ada_user_workspaces.sql"));
  assert.ok(file);
  const sql = readFileSync(join(migrations, file!), "utf8");
  assert.match(sql, /add column if not exists ada_access boolean/i);
  assert.match(sql, /created_by_email/i);
  assert.match(readFileSync(access, "utf8"), /ada_access/);
  const source = readFileSync(workspaces, "utf8");
  assert.match(source, /eq\("created_by_email", admin\.actorEmail\)/);
});
