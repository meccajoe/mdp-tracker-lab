import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_BUDGET_COST_RATE,
  DESIGN_SELL_RATE,
  buildProjectBudgetLaborSplit,
} from "./project-budget-labor-split.ts";

test("separates designer and shop hours while preserving verified QBO Time actual rates", () => {
  const split = buildProjectBudgetLaborSplit({
    quotedDesignDollars: 2500,
    shopBudgetHours: 40,
    qboEntries: [
      { service_item: "DESIGN LABOR", reg_hours: 8, ot_hours: 1, hourly_rate: 41 },
      { service_item: "SHOP LABOR", reg_hours: 12, ot_hours: 2, hourly_rate: 30 },
      { service_item: "PAINT LABOR", reg_hours: 4, ot_hours: 0, hourly_rate: 25 },
    ],
    manualEntries: [
      { labor_type: "Design Labor", hours: 2 },
      { labor_type: "Production Labor", hours: 3 },
    ],
  });

  assert.equal(DESIGN_SELL_RATE, 125);
  assert.equal(DESIGN_BUDGET_COST_RATE, 25);
  assert.deepEqual(split.design, {
    budgetHours: 20,
    budgetCost: 500,
    actualHours: 11,
    actualCost: 419,
  });
  assert.deepEqual(split.shop, {
    budgetHours: 40,
    budgetCost: 1640,
    actualHours: 21,
    actualCost: 643,
  });
});

test("keeps install, dismantle, and unclassified time out of shop hours", () => {
  const split = buildProjectBudgetLaborSplit({
    quotedDesignDollars: 0,
    shopBudgetHours: null,
    qboEntries: [
      { service_item: " design   labor ", reg_hours: 2, ot_hours: 0, hourly_rate: 35 },
      { service_item: "INSTALL LABOR", reg_hours: 4, ot_hours: 0, hourly_rate: 30 },
      { service_item: "STRIKE LABOR", reg_hours: 5, ot_hours: 0, hourly_rate: 32 },
      { service_item: null, reg_hours: 3, ot_hours: 0, hourly_rate: 20 },
    ],
    manualEntries: [{ labor_type: "I&D Labor", hours: 1 }],
  });

  assert.equal(split.design.actualHours, 2);
  assert.equal(split.shop.actualHours, 0);
  assert.equal(split.install.actualHours, 5);
  assert.equal(split.dismantle.actualHours, 5);
  assert.equal(split.unclassified.actualHours, 3);
  assert.equal(split.shop.budgetHours, 0);
});
