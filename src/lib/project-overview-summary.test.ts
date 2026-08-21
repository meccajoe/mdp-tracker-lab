import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectOverviewSummary } from "./project-overview-summary.ts";

test("buildProjectOverviewSummary keeps labor, non-labor, and all-in costs on matching bases", () => {
  const summary = buildProjectOverviewSummary({
    allocation: {
      labor_hours: 80,
      labor_budget: 3280,
      material_budget: 4200,
      non_lm_budget: 1520,
    },
    labor_actual_hours: 36,
    labor_actual_cost: 1674,
    material_actual: 1200,
    non_lm_actual: 300,
  });

  assert.deepEqual(summary, {
    labor: { actual: 36, budget: 80, percent: 45 },
    non_labor: { actual: 1500, budget: 5720, percent: 26.223776223776223 },
    total_cost: { actual: 3174, budget: 9000, percent: 35.266666666666666 },
  });
});

test("buildProjectOverviewSummary reports zero percentages for a zero allocation budget", () => {
  const summary = buildProjectOverviewSummary({
    allocation: { labor_hours: 0, labor_budget: 0, material_budget: 0, non_lm_budget: 0 },
    labor_actual_hours: 10,
    labor_actual_cost: 410,
    material_actual: 0,
    non_lm_actual: 0,
  });

  assert.equal(summary.labor.percent, 0);
  assert.equal(summary.non_labor.percent, 0);
  assert.equal(summary.total_cost.percent, 0);
});
