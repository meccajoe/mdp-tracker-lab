import assert from "node:assert/strict";
import test from "node:test";

import { buildCachedQboProjectWipMetricRow, buildProjectProfitabilitySummaryUrl, buildQboProjectWipMetrics, canServeHistoricalWipCache } from "./qbo-project-wip.ts";

test("buildProjectProfitabilitySummaryUrl builds a date-scoped ProjectProfitabilitySummary report URL", () => {
  const url = buildProjectProfitabilitySummaryUrl({
    realmId: "realm-1",
    startDate: "2026-01-01",
    endDate: "2026-07-09",
  });

  assert.equal(
    url,
    "https://quickbooks.api.intuit.com/v3/company/realm-1/reports/ProjectProfitabilitySummary?minorversion=70&start_date=2026-01-01&end_date=2026-07-09",
  );
});

test("buildQboProjectWipMetrics maps all-time and current-year profitability rows into WIP actuals", () => {
  const metrics = buildQboProjectWipMetrics({
    allTimeRow: {
      jobNumber: "26144",
      projectName: "26144 - Demo",
      customerName: "Netflix, Inc.",
      income: 1225,
      costs: 300,
      profit: 925,
      profitMargin: "75.51 %",
    },
    currentYearRow: {
      jobNumber: "26144",
      projectName: "26144 - Demo",
      customerName: "Netflix, Inc.",
      income: 225,
      costs: 50,
      profit: 175,
      profitMargin: "77.78 %",
    },
  });

  assert.deepEqual(metrics, {
    total_billed_to_date: 1225,
    total_cost_to_date: 300,
    current_year_total_billings: 225,
    current_year_total_retainage: null,
    current_year_costs: 50,
  });
});

test("buildQboProjectWipMetrics leaves retainage null and handles missing rows safely", () => {
  const metrics = buildQboProjectWipMetrics({
    allTimeRow: null,
    currentYearRow: null,
  });

  assert.deepEqual(metrics, {
    total_billed_to_date: null,
    total_cost_to_date: null,
    current_year_total_billings: null,
    current_year_total_retainage: null,
    current_year_costs: null,
  });
});

test("buildCachedQboProjectWipMetricRow packages cacheable metrics with source metadata", () => {
  const row = buildCachedQboProjectWipMetricRow({
    projectId: "26144",
    asOfDate: "2026-07-09",
    metrics: {
      total_billed_to_date: 1225,
      total_cost_to_date: 300,
      current_year_total_billings: 225,
      current_year_total_retainage: null,
      current_year_costs: 50,
    },
  });

  assert.deepEqual(row, {
    project_id: "26144",
    as_of_date: "2026-07-09",
    total_billed_to_date: 1225,
    total_cost_to_date: 300,
    current_year_total_billings: 225,
    current_year_total_retainage: null,
    current_year_costs: 50,
    billing_source: "qbo_project_profitability_summary",
    cost_source: "qbo_project_profitability_summary",
  });
});

test("canServeHistoricalWipCache serves only complete historical caches", () => {
  assert.equal(
    canServeHistoricalWipCache({ asOfDate: "2026-07-08", todayIso: "2026-07-09", cachedRowCount: 10, projectCount: 10 }),
    true,
  );
  assert.equal(
    canServeHistoricalWipCache({ asOfDate: "2026-07-09", todayIso: "2026-07-09", cachedRowCount: 10, projectCount: 10 }),
    false,
  );
  assert.equal(
    canServeHistoricalWipCache({ asOfDate: "2026-07-08", todayIso: "2026-07-09", cachedRowCount: 9, projectCount: 10 }),
    false,
  );
});
