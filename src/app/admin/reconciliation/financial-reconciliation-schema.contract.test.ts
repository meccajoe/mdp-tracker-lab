import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(process.cwd(), "supabase/migrations/20260917123000_financial_reconciliation_cases.sql");

function sql() {
  return readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();
}

test("migration creates governed reconciliation cases and append-only events", () => {
  const source = sql();
  for (const required of [
    "create table if not exists public.financial_reconciliation_cases",
    "create table if not exists public.financial_reconciliation_case_events",
    "fingerprint text not null",
    "check (fingerprint ~ '^[0-9a-f]{64}$')",
    "status in ('new', 'assigned', 'investigating', 'waiting_on_pm', 'waiting_on_accounting', 'resolved', 'superseded')",
    "category in ('stale_qbo_data', 'missing_qbo_actuals', 'missing_tracker_contract', 'missing_labor_rate', 'revenue_variance', 'cost_variance')",
    "create unique index if not exists financial_reconciliation_cases_fingerprint_uidx",
    "alter table public.financial_reconciliation_cases enable row level security",
    "alter table public.financial_reconciliation_case_events enable row level security",
    "revoke all on table public.financial_reconciliation_cases from anon, authenticated",
    "revoke all on table public.financial_reconciliation_case_events from anon, authenticated",
  ]) assert.ok(source.includes(required), `missing schema contract: ${required}`);
});

test("migration exposes canonical labor completeness without treating missing rates as zero-cost labor", () => {
  const source = sql();
  for (const required of [
    "create or replace view public.project_labor_reconciliation_summary",
    "qbo_entry_id like 'ts_%'",
    "filter (where hourly_rate > 0)",
    "filter (where coalesce(hourly_rate, 0) <= 0)",
    "missing_rate_hours",
    "verified_direct_wages",
  ]) assert.ok(source.includes(required), `missing labor contract: ${required}`);
});

test("migration makes scan observation and operator transitions transactional", () => {
  const source = sql();
  for (const required of [
    "create or replace function public.observe_financial_reconciliation_case",
    "p_fingerprint text",
    "p_reopen_resolved boolean default false",
    "for update",
    "reopen_count = reopen_count + 1",
    "create or replace function public.transition_financial_reconciliation_case",
    "p_expected_row_version integer",
    "row_version = row_version + 1",
    "insert into public.financial_reconciliation_case_events",
    "revoke all on function public.observe_financial_reconciliation_case",
    "revoke all on function public.transition_financial_reconciliation_case",
    "grant execute on function public.observe_financial_reconciliation_case",
    "grant execute on function public.transition_financial_reconciliation_case",
  ]) assert.ok(source.includes(required), `missing RPC contract: ${required}`);
});

test("migration prevents partial scans from superseding unrelated active cases", () => {
  const source = sql();
  assert.ok(source.includes("p_scan_scope_complete boolean default false"));
  assert.ok(source.includes("if p_scan_scope_complete then"));
  assert.ok(source.includes("status = 'superseded'"));
});
