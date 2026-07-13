import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("a migration adds monitor metadata to saved portfolio memberships", () => {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
    .join('\n\n');

  assert.match(sql, /ALTER TABLE project_portfolio_projects[\s\S]*ADD COLUMN IF NOT EXISTS monitor_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/, "migrations should add monitor_json to saved portfolio membership rows");
});
