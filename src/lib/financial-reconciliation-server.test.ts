import assert from "node:assert/strict";
import test from "node:test";

import { assembleFinancialReconciliationPayload } from "./financial-reconciliation-server";

const project = {
  id: "26154",
  name: "Fossil Activation",
  job_number: "26154",
  client: "Omnicom",
  pm: "PM",
  status: "Active",
  contract_amount: 142755,
  total_spent: 14379.11,
  updated_at: "2026-09-15T12:00:00Z",
};

const qbo = {
  project_id: "26154",
  as_of_date: "2026-09-15",
  total_billed_to_date: 142755,
  total_cost_to_date: 77016.36,
  current_year_total_billings: 142755,
  current_year_costs: 77016.36,
  billing_source: "qbo_project_profitability_summary",
  cost_source: "qbo_project_profitability_summary",
  synced_at: "2026-09-15T04:44:51Z",
};

const labor = {
  project_id: "26154",
  total_hours: 534.03,
  verified_rate_hours: 512.75,
  missing_rate_hours: 21.28,
  verified_direct_wages: 13789.19,
};

test("assembles accounting actuals, operational evidence, owner names, and case state", () => {
  const payload = assembleFinancialReconciliationPayload({
    asOfDate: "2026-09-15",
    projects: [project],
    qboMetrics: [qbo],
    laborSummaries: [labor],
    roleRows: [{ pm_initials: "PM", full_name: "Paul Manager", email: "paul@meccadesign.com" }],
    cases: [{
      id: "case-1",
      project_id: "26154",
      category: "missing_labor_rate",
      severity: "high",
      status: "assigned",
      owner_email: "paul@meccadesign.com",
      reason: "Missing rates",
      next_action: "Resolve rates",
      row_version: 2,
      fingerprint: "a".repeat(64),
      last_seen_at: "2026-09-15T13:00:00Z",
      resolution_code: null,
      resolution_notes: "",
    }],
  });

  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].project.owner, "Paul Manager");
  assert.equal(payload.rows[0].qbo.totalCostToDate, 77016.36);
  assert.equal(payload.rows[0].tracker.operationalCost, 28168.30);
  assert.equal(payload.rows[0].caseState?.status, "assigned");
  assert.equal(payload.sourceFreshness.latestQboSyncAt, "2026-09-15T04:44:51Z");
  assert.equal(payload.counts.needsAction, 1);
  assert.equal(payload.counts.missingRate, 1);
});

test("keeps projects without QBO or labor rows visible as explicit exceptions", () => {
  const payload = assembleFinancialReconciliationPayload({
    asOfDate: "2026-09-15",
    projects: [{ ...project, id: "missing", job_number: "missing", contract_amount: null, pm: null }],
    qboMetrics: [],
    laborSummaries: [],
    roleRows: [],
    cases: [],
  });

  assert.equal(payload.rows[0].category, "missing_qbo_actuals");
  assert.equal(payload.rows[0].qbo.totalCostToDate, null);
  assert.equal(payload.rows[0].laborCoverage.totalHours, 0);
  assert.equal(payload.counts.waitingForFreshQbo, 1);
});
