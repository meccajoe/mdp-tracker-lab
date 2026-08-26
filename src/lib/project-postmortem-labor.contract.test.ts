import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = join(root, "supabase/migrations/20260825220000_labor_rate_provenance.sql");
const generateRoute = readFileSync(join(root, "src/app/api/projects/[id]/postmortem/generate/route.ts"), "utf8");
const sourceRoute = readFileSync(join(root, "src/app/api/projects/[id]/postmortem/source/route.ts"), "utf8");
const syncRoute = readFileSync(join(root, "src/app/api/tsheets/sync-labor/route.ts"), "utf8");

test("post-mortems consume canonical labor with explicit pay-rate provenance", () => {
  assert.equal(existsSync(migrationPath), true, "labor-rate provenance migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /rate_source/);
  assert.match(migration, /rate_verified_at/);
  for (const route of [generateRoute, sourceRoute]) {
    assert.match(route, /employee_name/);
    assert.match(route, /rate_source/);
    assert.match(route, /rate_verified_at/);
    assert.match(route, /\.like\("qbo_entry_id",\s*"ts_%"\)/);
  }
  assert.doesNotMatch(syncRoute, /pay_rate\s*\|\|\s*30/);
  assert.match(syncRoute, /rate_source/);
  assert.match(syncRoute, /rate_verified_at/);
});
