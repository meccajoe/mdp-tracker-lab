import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project copilot subscriptions migration creates durable subscription tables and policies", () => {
  const migrationPath = join(process.cwd(), "supabase/migrations/20260710143000_project_subscriptions.sql");
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_subscriptions/i, "migration should create project_subscriptions");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_subscription_runs/i, "migration should create project_subscription_runs");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_subscription_deliveries/i, "migration should create project_subscription_deliveries");
  assert.match(sql, /ALTER TABLE project_subscriptions ENABLE ROW LEVEL SECURITY/i, "migration should enable RLS on project_subscriptions");
  assert.match(sql, /CREATE POLICY[\s\S]*project_subscriptions/i, "migration should add a project_subscriptions policy");
});
