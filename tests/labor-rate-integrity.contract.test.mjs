import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve("supabase/migrations/20260918100000_labor_rate_integrity.sql");
const syncRoute = readFileSync(resolve("src/app/api/tsheets/sync-labor/route.ts"), "utf8");
const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"));

test("canonical reconciliation labor requires approved rate provenance", () => {
  assert.equal(existsSync(migration), true, "labor-rate integrity migration should exist");
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_rate_imports/i);
  assert.match(sql, /source_sha256 text NOT NULL CHECK \(source_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.match(sql, /supersedes_import_id uuid/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_worker_rate_authority/i);
  assert.match(sql, /import_id uuid NOT NULL REFERENCES public\.labor_rate_imports/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.qbo_labor_entries FROM anon, authenticated/i);
  assert.match(sql, /DROP POLICY IF EXISTS "auth_all_qbo_labor_entries"/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.labor_worker_rate_authority FROM service_role/i);
  assert.match(sql, /import_labor_rate_authority/i);
  assert.doesNotMatch(sql, /GRANT[^;]*INSERT[^;]*ON TABLE public\.labor_worker_rate_authority/i);
  assert.match(sql, /revoke_labor_rate_import/i);
  assert.match(sql, /normalize_labor_worker_name/i);
  assert.match(sql, /LEFT JOIN LATERAL/i);
  assert.ok(
    sql.indexOf("WHEN payroll_hourly_rate > 0 THEN 'payroll_rate_sheet'") < sql.indexOf("WHEN COALESCE(hourly_rate, 0) > 0"),
    "effective-dated payroll authority should take precedence over a current QBO Time profile rate",
  );
  assert.match(sql, /'payroll_rate_sheet'/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.labor_worker_cost_policies/i);
  assert.match(sql, /'fixed_design_rate'/i);
  assert.match(sql, /\('rodrigo l',\s*'Rodrigo L',\s*'hourly',\s*41/i);
  assert.match(sql, /\('marcelo t',\s*'Marcelo T',\s*'hourly',\s*41/i);
  assert.match(sql, /\('mariam h',\s*'Mariam H',\s*'hourly',\s*41/i);
  assert.match(sql, /\('adam gonzalez',\s*'Adam Gonzalez',\s*'daily',\s*375/i);
  assert.match(sql, /\('paul m mecca',\s*'Paul M\. Mecca',\s*'excluded',\s*NULL/i);
  assert.match(sql, /\('emily d kuhl',\s*'Emily D Kuhl',\s*'excluded',\s*NULL/i);
  assert.match(sql, /ROW_NUMBER\(\) OVER[\s\S]*project_id[\s\S]*normalized_worker_name[\s\S]*date/i);
  assert.match(sql, /WHEN cost_basis = 'daily' AND daily_cost_row = 1 THEN policy_rate/i);
  assert.match(sql, /WHEN cost_basis = 'excluded' THEN 0/i);
  assert.match(sql, /IN\s*\('qbo_time_users',\s*'qbo_time_users_matched',\s*'payroll_rate_sheet',\s*'fixed_design_rate',\s*'approved_daily_rate'\)/i);
  assert.match(sql, /missing_rate_worker_count/i);
  assert.match(sql, /missing_rate_workers/i);
  assert.ok(sql.indexOf("AS labor_synced_at") < sql.indexOf("AS missing_rate_worker_count"), "new view columns must append after the existing labor_synced_at column");
});

test("TSheets sync retains worker identity and resolves rate updates against stored provenance", () => {
  assert.match(syncRoute, /qbo_time_user_id/);
  assert.match(syncRoute, /qbo_time_salaried/);
  assert.match(syncRoute, /resolveLaborRateForSync/);
  assert.match(syncRoute, /existingByEntryId/);
});

test("only one Vercel labor sync runs each night", () => {
  const laborCrons = vercel.crons.filter((cron) => /sync-(?:qbo|tsheets)-labor/.test(cron.path));
  assert.deepEqual(laborCrons, [{ path: "/api/cron/sync-tsheets-labor", schedule: "0 6 * * *" }]);
});