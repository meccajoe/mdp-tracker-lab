import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("portfolio automation migration adds automation_json to saved portfolios", () => {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const filenames = readdirSync(migrationsDir).filter((name) => name.includes("portfolio_automation_rules"));
  assert.ok(filenames.length > 0, "should add a migration for configurable portfolio automation rules");

  const source = filenames.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");
  assert.match(source, /ALTER TABLE project_portfolios/i, "migration should modify project_portfolios");
  assert.match(source, /automation_json/i, "migration should add automation_json storage");
  assert.match(source, /jsonb/i, "automation_json should be jsonb-backed");
});
