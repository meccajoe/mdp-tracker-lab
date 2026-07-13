import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("storage budget migration adds project columns, default formula setting, and project_summary support", () => {
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const migrationName = readdirSync(migrationsDir).find((name) => name.includes("storage_budget_category"));
  assert.ok(migrationName, "expected a storage budget category migration file");

  const source = readFileSync(join(migrationsDir, migrationName!), "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS budget_storage/i, "migration should add budget_storage");
  assert.match(source, /ADD COLUMN IF NOT EXISTS quote_storage/i, "migration should add quote_storage");
  assert.match(source, /ADD COLUMN IF NOT EXISTS pct_storage/i, "migration should add pct_storage");
  assert.match(source, /INSERT INTO budget_formula_settings[\s\S]*storage[\s\S]*Storage/i, "migration should seed a storage default percentage");
  assert.match(source, /project_summary/i, "migration should refresh project_summary to include storage");
});
