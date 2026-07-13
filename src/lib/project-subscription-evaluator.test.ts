import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentMetricValue, isDigestDue, type EvaluatableProjectSubscription } from "./project-subscription-evaluator.ts";

const baseSubscription: EvaluatableProjectSubscription = {
  id: "sub-1",
  project_id: "26144",
  created_by_email: "joe@example.com",
  channel: "slack_dm",
  target_json: { slack_user_id: "U123" },
  subscription_type: "metric_threshold_alert",
  scope_type: "project",
  scope_json: { project_id: "26144" },
  metric_key: "total_spent",
  condition_operator: ">=",
  threshold_value: 600,
  rule_json: { unit: "currency", scopeKey: "total_budget" },
  schedule_cron: null,
  status: "active",
  cooldown_minutes: 60,
  summary_text: "Alert when total spend reach $600",
  last_evaluated_at: null,
  last_triggered_at: null,
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
};

const context = {
  project: {
    id: "26144",
    name: "Netflix - Bridgerton Vitrine Deinstallation",
    budget_hrs: 40,
    qbo_total_hours: 6.35,
    total_budget: 735,
    total_spent: 610,
    budget_materials: 300,
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
    budget_materials: 280,
  },
};

test("getCurrentMetricValue reads total spend directly from project context", () => {
  assert.equal(getCurrentMetricValue(baseSubscription, context), 610);
});

test("getCurrentMetricValue calculates category variance percent from scope budget", () => {
  const subscription: EvaluatableProjectSubscription = {
    ...baseSubscription,
    metric_key: "budget_variance_pct",
    rule_json: { unit: "percent", scopeKey: "budget_materials" },
  };

  const result = getCurrentMetricValue(subscription, context);
  assert.equal(Math.round((result ?? 0) * 100) / 100, -6.67);
});

test("getCurrentMetricValue calculates labor budget percentage", () => {
  const subscription: EvaluatableProjectSubscription = {
    ...baseSubscription,
    metric_key: "labor_budget_pct",
    rule_json: { unit: "percent", scopeKey: "budget_hrs" },
  };

  const result = getCurrentMetricValue(subscription, context);
  assert.equal(Math.round((result ?? 0) * 100) / 100, 15.88);
});

test("isDigestDue recognizes the weekday 4pm local digest window once per day", () => {
  const dueAtWindow = isDigestDue({
    scheduleCron: "0 16 * * 1-5",
    lastTriggeredAt: null,
    now: new Date("2026-07-10T21:10:00Z"),
  });
  assert.equal(dueAtWindow, true, "4:10pm CDT Friday should be inside the digest window");

  const alreadyTriggered = isDigestDue({
    scheduleCron: "0 16 * * 1-5",
    lastTriggeredAt: "2026-07-10T21:01:00Z",
    now: new Date("2026-07-10T21:10:00Z"),
  });
  assert.equal(alreadyTriggered, false, "same local day should not re-trigger the digest");

  const wrongHour = isDigestDue({
    scheduleCron: "0 16 * * 1-5",
    lastTriggeredAt: null,
    now: new Date("2026-07-10T18:00:00Z"),
  });
  assert.equal(wrongHour, false, "1pm CDT should not be due yet");
});
