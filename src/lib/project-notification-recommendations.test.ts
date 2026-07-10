import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectNotificationRecommendation } from "./project-notification-recommendations.ts";

test("buildProjectNotificationRecommendation recommends budget-aware labor hour thresholds", () => {
  const result = buildProjectNotificationRecommendation({
    requestText: "notify me when labor gets too high",
    project: {
      id: "26144",
      name: "Nissan Texas Letters Repair",
      budget_hrs: 100,
      qbo_total_hours: 62,
      total_budget: 85000,
      total_spent: 21400,
      budget_materials: 40000,
      budget_design: null,
      budget_pm: null,
      budget_shipping: null,
      budget_id_labor: null,
      budget_travel: null,
      budget_props: null,
      budget_equipment: null,
      budget_rental: null,
      budget_crating: null,
      budget_flooring: null,
    },
    categoryActuals: {},
  });

  assert.equal(result.type, "threshold");
  if (result.type !== "threshold") return;
  assert.equal(result.metricKey, "qbo_total_hours");
  assert.equal(result.scopeKey, "budget_hrs");
  assert.equal(result.unit, "hours");
  assert.equal(result.currentValue, 62);
  assert.equal(result.spotlight.id, "warning");
  assert.equal(result.spotlight.threshold, 95);
  assert.deepEqual(
    result.options.map((option) => option.threshold),
    [80, 95, 100, 110]
  );
});

test("buildProjectNotificationRecommendation recommends category spend thresholds from the relevant budget", () => {
  const result = buildProjectNotificationRecommendation({
    requestText: "notify me if fabrication gets too high",
    project: {
      id: "26144",
      name: "Nissan Texas Letters Repair",
      budget_hrs: 100,
      qbo_total_hours: 62,
      total_budget: 85000,
      total_spent: 21400,
      budget_materials: 40000,
      budget_design: null,
      budget_pm: null,
      budget_shipping: null,
      budget_id_labor: null,
      budget_travel: null,
      budget_props: null,
      budget_equipment: null,
      budget_rental: null,
      budget_crating: null,
      budget_flooring: null,
    },
    categoryActuals: {
      budget_materials: 21400,
    },
  });

  assert.equal(result.type, "threshold");
  if (result.type !== "threshold") return;
  assert.equal(result.metricKey, "category_actual_spend");
  assert.equal(result.scopeKey, "budget_materials");
  assert.equal(result.unit, "currency");
  assert.equal(result.currentValue, 21400);
  assert.equal(result.spotlight.id, "heads_up");
  assert.equal(result.spotlight.threshold, 34000);
  assert.deepEqual(
    result.options.map((option) => option.threshold),
    [34000, 40000, 44000]
  );
});

test("buildProjectNotificationRecommendation defaults vague keep-me-posted requests to a digest bundle", () => {
  const result = buildProjectNotificationRecommendation({
    requestText: "keep me posted on this project",
    project: {
      id: "26144",
      name: "Nissan Texas Letters Repair",
      budget_hrs: 100,
      qbo_total_hours: 62,
      total_budget: 85000,
      total_spent: 21400,
      budget_materials: 40000,
      budget_design: null,
      budget_pm: null,
      budget_shipping: null,
      budget_id_labor: null,
      budget_travel: null,
      budget_props: null,
      budget_equipment: null,
      budget_rental: null,
      budget_crating: null,
      budget_flooring: null,
    },
    categoryActuals: {},
  });

  assert.equal(result.type, "digest");
  if (result.type !== "digest") return;
  assert.equal(result.digestKey, "daily_pm");
  assert.deepEqual(result.defaultSections, [
    "labor_hours",
    "total_spend",
    "spend_by_category",
    "top_changes",
    "flagged_expenses",
  ]);
});

test("buildProjectNotificationRecommendation asks for clarification when labor budget is missing", () => {
  const result = buildProjectNotificationRecommendation({
    requestText: "notify me when labor gets too high",
    project: {
      id: "26144",
      name: "Nissan Texas Letters Repair",
      budget_hrs: null,
      qbo_total_hours: 62,
      total_budget: 85000,
      total_spent: 21400,
      budget_materials: null,
      budget_design: null,
      budget_pm: null,
      budget_shipping: null,
      budget_id_labor: null,
      budget_travel: null,
      budget_props: null,
      budget_equipment: null,
      budget_rental: null,
      budget_crating: null,
      budget_flooring: null,
    },
    categoryActuals: {},
  });

  assert.equal(result.type, "clarify");
  if (result.type !== "clarify") return;
  assert.match(result.message, /labor budget/i);
});
