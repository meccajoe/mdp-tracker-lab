import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialReconciliationRow,
  buildReconciliationFingerprint,
} from "./financial-reconciliation";

const baseInput = {
  asOfDate: "2026-09-15",
  project: {
    projectId: "26154",
    projectName: "Omnicom Group - Fossil Activation",
    jobNumber: "26154",
    client: "Omnicom Group",
    owner: "PM",
    projectStatus: "Active",
    contractAmount: 142755,
    trackerExpenses: 14379.11,
    trackerEvidenceUpdatedAt: "2026-09-15T12:00:00.000Z",
  },
  labor: {
    totalHours: 534.03,
    verifiedRateHours: 512.75,
    missingRateHours: 21.28,
    verifiedDirectWages: 13789.19,
    missingRateWorkers: ["Joshua Beam (deleted)", "Tremaine Fung (deleted)"],
  },
  qbo: {
    asOfDate: "2026-09-15",
    totalBilledToDate: 142755,
    totalCostToDate: 77016.36,
    currentYearBillings: 142755,
    currentYearCosts: 77016.36,
    syncedAt: "2026-09-15T04:44:51.074Z",
    billingSource: "qbo_project_profitability_summary",
    costSource: "qbo_project_profitability_summary",
  },
};

test("separates QBO accounting actuals from Tracker operational evidence", () => {
  const row = buildFinancialReconciliationRow(baseInput);

  assert.equal(row.qbo.totalCostToDate, 77016.36);
  assert.equal(row.tracker.verifiedDirectWages, 13789.19);
  assert.equal(row.tracker.operationalCost, 28168.30);
  assert.equal(row.costVariance.amount, 48848.06);
  assert.equal(row.revenueVariance.amount, 0);
  assert.equal(row.qbo.sourceLabel, "QBO Project Profitability Summary");
  assert.equal(row.tracker.sourceLabel, "Tracker operational evidence");
});

test("keeps missing-rate labor explicit instead of valuing it at zero", () => {
  const row = buildFinancialReconciliationRow(baseInput);

  assert.equal(row.laborCoverage.totalHours, 534.03);
  assert.equal(row.laborCoverage.verifiedRateHours, 512.75);
  assert.equal(row.laborCoverage.missingRateHours, 21.28);
  assert.deepEqual(row.laborCoverage.missingRateWorkers, ["Joshua Beam (deleted)", "Tremaine Fung (deleted)"]);
  assert.equal(row.laborCoverage.status, "missing_rate");
  assert.ok(row.reviewReasons.some((reason) => reason.code === "missing_labor_rate"));
  assert.match(row.nextAction, /authoritative.*project labor cost/i);
});

test("keeps approved daily and fixed-rate labor in project cost while excluding salaried leadership hours", () => {
  const row = buildFinancialReconciliationRow({
    ...baseInput,
    labor: {
      ...baseInput.labor,
      verifiedDirectWages: 14914.19,
      excludedProjectCostHours: 22.58,
      missingRateHours: 0,
      verifiedRateHours: 511.45,
    },
  });

  assert.equal(row.tracker.projectLaborCost, 14914.19);
  assert.equal(row.tracker.projectCost, 29293.30);
  assert.equal(row.laborCoverage.excludedProjectCostHours, 22.58);
  assert.equal(row.laborCoverage.status, "complete");
});

test("does not turn missing QBO actuals into a zero variance", () => {
  const row = buildFinancialReconciliationRow({ ...baseInput, qbo: null });

  assert.equal(row.qbo.totalCostToDate, null);
  assert.equal(row.costVariance.amount, null);
  assert.equal(row.revenueVariance.amount, null);
  assert.equal(row.category, "missing_qbo_actuals");
  assert.equal(row.queueStatus, "waiting_for_fresh_qbo");
  assert.match(row.reason, /no saved actuals/i);
});

test("requires a refresh before interpreting stale QBO values", () => {
  const row = buildFinancialReconciliationRow({
    ...baseInput,
    asOfDate: "2026-09-17",
  });

  assert.equal(row.freshness.status, "stale");
  assert.equal(row.category, "stale_qbo_data");
  assert.equal(row.queueStatus, "waiting_for_fresh_qbo");
  assert.match(row.nextAction, /refresh.*before/i);
});

test("reports revenue and cost variances independently", () => {
  const row = buildFinancialReconciliationRow({
    ...baseInput,
    labor: { ...baseInput.labor, missingRateHours: 0, verifiedRateHours: 534.03 },
    qbo: {
      ...baseInput.qbo,
      totalBilledToDate: 150000,
      totalCostToDate: 20000,
    },
  });

  assert.equal(row.revenueVariance.amount, 7245);
  assert.equal(row.costVariance.amount, -8168.30);
  assert.equal(row.category, "cost_variance");
  assert.match(row.reason, /QBO cost.*below Tracker/i);
});

test("marks a fresh complete row within tolerance as ready", () => {
  const trackerOperationalCost = baseInput.project.trackerExpenses + baseInput.labor.verifiedDirectWages;
  const row = buildFinancialReconciliationRow({
    ...baseInput,
    labor: { ...baseInput.labor, missingRateHours: 0, verifiedRateHours: 534.03 },
    qbo: {
      ...baseInput.qbo,
      totalCostToDate: trackerOperationalCost + 100,
      totalBilledToDate: baseInput.project.contractAmount + 100,
    },
  });

  assert.equal(row.category, "within_tolerance");
  assert.equal(row.queueStatus, "ready");
  assert.equal(row.severity, "low");
  assert.equal(row.nextAction, "No action needed.");
});

test("fingerprint ignores source timestamps but changes with material metrics", () => {
  const row = buildFinancialReconciliationRow(baseInput);
  const first = buildReconciliationFingerprint(row);
  const timestampOnly = buildReconciliationFingerprint({
    ...row,
    qbo: { ...row.qbo, syncedAt: "2026-09-15T18:00:00.000Z" },
    tracker: { ...row.tracker, evidenceUpdatedAt: "2026-09-15T19:00:00.000Z" },
  });
  const reviewDateOnly = buildReconciliationFingerprint({
    ...row,
    asOfDate: "2026-09-16",
    freshness: { ...row.freshness, qboAsOfDate: "2026-09-16" },
  });
  const changed = buildReconciliationFingerprint({
    ...row,
    qbo: { ...row.qbo, totalCostToDate: (row.qbo.totalCostToDate ?? 0) + 1000 },
    costVariance: { ...row.costVariance, amount: (row.costVariance.amount ?? 0) + 1000 },
  });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(timestampOnly, first);
  assert.equal(reviewDateOnly, first);
  assert.notEqual(changed, first);
});
