import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  const absolute = join(process.cwd(), path);
  assert.ok(existsSync(absolute), `missing required file: ${path}`);
  return readFileSync(absolute, "utf8");
}

test("admin reconciliation APIs enforce project-admin authentication and avoid the obsolete P&L cache", () => {
  const server = source("src/lib/financial-reconciliation-server.ts");
  const queue = source("src/app/api/admin/reconciliation/route.ts");
  const scan = source("src/app/api/admin/reconciliation/scan/route.ts");
  const cases = source("src/app/api/admin/reconciliation/cases/[caseId]/route.ts");
  const combined = [server, queue, scan, cases].join("\n");

  for (const route of [queue, scan, cases]) {
    assert.match(route, /requireProjectAdmin\(request\)/);
  }
  assert.match(server, /qbo_project_wip_metrics/);
  assert.match(server, /project_labor_reconciliation_summary/);
  assert.match(server, /buildFinancialReconciliationRow/);
  assert.doesNotMatch(combined, /qbo_project_pnl/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(scan, /observe_financial_reconciliation_case/);
  assert.match(scan, /supersede_financial_reconciliation_cases/);
  assert.match(cases, /transition_financial_reconciliation_case/);
});

test("operator page is an authenticated action queue with responsive detail", () => {
  const page = source("src/app/admin/reconciliation/page.tsx");

  for (const required of [
    "Accounting Review",
    "QBO accounting actuals",
    "Tracker operational evidence",
    "Revenue variance",
    "Cost variance",
    "Missing-rate hours",
    "Next action",
    "Owner",
    "Review status",
    "Freshness",
    'data-slot="reconciliation-mobile-list"',
    "Back to queue",
    "Refresh QBO & review",
    'credentials: "include"',
    'Authorization: "Bearer " + session.access_token',
  ]) assert.ok(page.includes(required), `missing page contract: ${required}`);

  assert.match(page, /useRef\(/);
  assert.match(page, /requestId/);
  assert.match(page, /hidden lg:block/);
  assert.match(page, /lg:hidden/);
  assert.match(page, /min-w-0/);
  assert.doesNotMatch(page, /Under Development/);
  assert.doesNotMatch(page, /qbo_project_pnl/);
  assert.doesNotMatch(page, /Tracker GP/);
  assert.doesNotMatch(page, /delta_pct/);
});

test("queue API provides filters, source freshness, case state, and event history", () => {
  const server = source("src/lib/financial-reconciliation-server.ts");
  const queue = source("src/app/api/admin/reconciliation/route.ts");
  const cases = source("src/app/api/admin/reconciliation/cases/[caseId]/route.ts");

  for (const required of [
    "generatedAt",
    "asOfDate",
    "sourceFreshness",
    "counts",
    "rows",
    "caseState",
  ]) assert.ok(`${server}\n${queue}`.includes(required), `missing queue payload: ${required}`);
  assert.match(cases, /financial_reconciliation_case_events/);
  assert.match(queue, /searchParams/);
  assert.match(queue, /projectStatus/);
  assert.match(queue, /queueStatus/);
  assert.match(queue, /category/);
});
