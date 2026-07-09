import assert from "node:assert/strict";
import test from "node:test";

import { buildWipSummaryMetrics } from "./wip-report-formulas.ts";

test("buildWipSummaryMetrics computes visible-summary profitability fields from contract, estimate, billed, and cost actuals", () => {
  const metrics = buildWipSummaryMetrics({
    updated_contract_amount: 1000,
    updated_est_cost: 800,
    total_billed_to_date: 700,
    total_cost_to_date: 400,
    current_year_total_billings: null,
    current_year_total_retainage: null,
    current_year_costs: null,
  });

  assert.equal(metrics.updated_est_gross_profit, 200);
  assert.equal(metrics.est_gpm_pct, 0.2);
  assert.equal(metrics.cost_pct_complete, 0.5);
  assert.equal(metrics.revenue_earned, 500);
  assert.equal(metrics.job_profit_earned, 100);
  assert.equal(metrics.job_profit_pct_earned, 0.2);
  assert.equal(metrics.billings_in_excess_of_costs, 200);
  assert.equal(metrics.costs_in_excess_of_billings, 0);
});

test("buildWipSummaryMetrics keeps cost percent uncapped while capping revenue earned at contract amount", () => {
  const metrics = buildWipSummaryMetrics({
    updated_contract_amount: 1000,
    updated_est_cost: 800,
    total_billed_to_date: 900,
    total_cost_to_date: 1000,
    current_year_total_billings: null,
    current_year_total_retainage: null,
    current_year_costs: null,
  });

  assert.equal(metrics.cost_pct_complete, 1.25);
  assert.equal(metrics.revenue_earned, 1000);
  assert.equal(metrics.job_profit_earned, 0);
  assert.equal(metrics.job_profit_pct_earned, 0);
  assert.equal(metrics.billings_in_excess_of_costs, 0);
  assert.equal(metrics.costs_in_excess_of_billings, 100);
});

test("buildWipSummaryMetrics returns zeroed ratios when contract or estimate are missing or zero", () => {
  const metrics = buildWipSummaryMetrics({
    updated_contract_amount: 0,
    updated_est_cost: 0,
    total_billed_to_date: 50,
    total_cost_to_date: 25,
    current_year_total_billings: null,
    current_year_total_retainage: null,
    current_year_costs: null,
  });

  assert.equal(metrics.updated_est_gross_profit, 0);
  assert.equal(metrics.est_gpm_pct, 0);
  assert.equal(metrics.cost_pct_complete, 0);
  assert.equal(metrics.revenue_earned, 0);
  assert.equal(metrics.job_profit_earned, -25);
  assert.equal(metrics.job_profit_pct_earned, 0);
  assert.equal(metrics.billings_in_excess_of_costs, 50);
  assert.equal(metrics.costs_in_excess_of_billings, 0);
});
