import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(process.cwd(), "supabase/migrations/20260721180000_production_issues.sql");

test("production issue tracker migration defines project-linked issues, evidence, and safe constraints", () => {
  assert.ok(existsSync(migrationPath), "production issues migration should exist");
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.production_issues/i);
  assert.match(sql, /project_id\s+text\s+NOT NULL\s+REFERENCES public\.projects\(id\)/i);
  assert.match(sql, /CHECK \(category IN \('defect', 'rework', 'safety', 'site', 'vendor', 'labor', 'other'\)\)/i);
  assert.match(sql, /CHECK \(severity IN \('low', 'medium', 'high', 'critical'\)\)/i);
  assert.match(sql, /CHECK \(status IN \('open', 'in_progress', 'resolved', 'closed'\)\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.production_issue_notes/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.production_issue_photos/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_production_issues_project_id/i);
  assert.match(sql, /ALTER TABLE public\.production_issues ENABLE ROW LEVEL SECURITY/i);
});
