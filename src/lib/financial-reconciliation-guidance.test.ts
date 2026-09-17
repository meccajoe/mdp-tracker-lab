import assert from "node:assert/strict";
import test from "node:test";

import { buildReconciliationGuidance } from "./financial-reconciliation-guidance";
import type { FinancialReconciliationQueueRow } from "./financial-reconciliation-server";

function row(overrides: Partial<FinancialReconciliationQueueRow> = {}): FinancialReconciliationQueueRow {
  return {
    contractVersion: "2026-09-17.v1",
    asOfDate: "2026-09-15",
    project: { id: "26154", name: "Fossil Activation", jobNumber: "26154", client: "Omnicom", owner: "Paul", status: "Active" },
    tracker: { contractAmount: 142755, expenses: 14379.11, verifiedDirectWages: 13789.19, operationalCost: 28168.30, operationalGrossProfit: 114586.70, evidenceUpdatedAt: "2026-09-15T12:00:00Z", sourceLabel: "Tracker operational evidence" },
    qbo: { totalBilledToDate: 142755, totalCostToDate: 75103.79, netIncome: 67651.21, currentYearBillings: 142755, currentYearCosts: 75103.79, syncedAt: "2026-09-15T13:00:00Z", sourceLabel: "QBO Project Profitability Summary", billingSource: "qbo", costSource: "qbo" },
    laborCoverage: { totalHours: 534.03, verifiedRateHours: 512.75, missingRateHours: 0, status: "complete" },
    revenueVariance: { amount: 0, percent: 0, material: false, direction: "even" },
    costVariance: { amount: 46935.49, percent: 166.63, material: true, direction: "qbo_higher" },
    freshness: { status: "fresh", qboAsOfDate: "2026-09-15", qboSyncedAt: "2026-09-15T13:00:00Z" },
    category: "cost_variance",
    queueStatus: "needs_action",
    severity: "critical",
    reviewReasons: [{ code: "cost_variance", message: "QBO cost is higher." }],
    reason: "QBO cost is higher.",
    nextAction: "Review costs.",
    fingerprint: "abc",
    projectOwnerEmail: "paul@example.com",
    caseState: null,
    ...overrides,
  };
}

test("explains a QBO-higher cost difference without claiming an unverified cause", () => {
  const guidance = buildReconciliationGuidance(row());

  assert.equal(guidance.headline, "QBO has $46,935.49 more cost than Tracker shows");
  assert.match(guidance.explanation, /QBO is the accounting total/i);
  assert.match(guidance.explanation, /Tracker is operational evidence/i);
  assert.ok(guidance.likelyCauses.some((cause) => /payroll taxes|burden/i.test(cause)));
  assert.ok(guidance.likelyCauses.some((cause) => /booked directly in QBO/i.test(cause)));
  assert.match(guidance.recommendedAction, /compare the QBO cost detail/i);
  assert.equal(guidance.differenceLabel, "QBO cost is higher by");
});

test("explains a Tracker-higher cost difference as likely timing or mapping work", () => {
  const guidance = buildReconciliationGuidance(row({
    costVariance: { amount: -4200, percent: 14.9, material: true, direction: "tracker_higher" },
    qbo: { ...row().qbo, totalCostToDate: 23968.30 },
  }));

  assert.equal(guidance.headline, "Tracker shows $4,200.00 more cost than QBO");
  assert.ok(guidance.likelyCauses.some((cause) => /not posted to QBO yet/i.test(cause)));
  assert.match(guidance.recommendedAction, /pending or unmapped/i);
});

test("puts incomplete labor rates ahead of a misleading cost conclusion", () => {
  const guidance = buildReconciliationGuidance(row({
    category: "missing_labor_rate",
    laborCoverage: { totalHours: 534.03, verifiedRateHours: 512.75, missingRateHours: 21.28, status: "missing_rate" },
  }));

  assert.equal(guidance.headline, "Tracker labor cost is incomplete");
  assert.match(guidance.explanation, /21\.28 hours/i);
  assert.match(guidance.recommendedAction, /assign verified pay rates/i);
  assert.equal(guidance.differenceLabel, "Cost comparison is provisional");
});

test("explains revenue as contract value versus billing-to-date", () => {
  const guidance = buildReconciliationGuidance(row({
    category: "revenue_variance",
    revenueVariance: { amount: -12500, percent: 8.76, material: true, direction: "tracker_higher" },
    costVariance: { amount: 0, percent: 0, material: false, direction: "even" },
  }));

  assert.equal(guidance.headline, "Tracker contract is $12,500.00 above QBO billings");
  assert.match(guidance.explanation, /contract value/i);
  assert.match(guidance.explanation, /billed to date/i);
  assert.ok(guidance.likelyCauses.some((cause) => /not been billed yet/i.test(cause)));
});

test("stale QBO data blocks interpretation instead of explaining a possibly old variance", () => {
  const guidance = buildReconciliationGuidance(row({ category: "stale_qbo_data", queueStatus: "waiting_for_fresh_qbo", freshness: { status: "stale", qboAsOfDate: "2026-09-14", qboSyncedAt: "2026-09-14T10:00:00Z" } }));

  assert.equal(guidance.headline, "QBO data is not current enough to review");
  assert.equal(guidance.likelyCauses.length, 0);
  assert.match(guidance.recommendedAction, /refresh QBO/i);
});
