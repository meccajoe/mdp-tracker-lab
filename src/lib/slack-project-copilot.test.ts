import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlackNotificationBlocks,
  buildSlackProjectResponse,
  buildSlackSubscriptionListResponse,
  parseSlackProjectCommand,
  stripSlackBotMention,
} from "./slack-project-copilot.ts";

const project = {
  id: "26144",
  name: "Nissan Texas Letters Repair",
  budget_hrs: 100,
  qbo_total_hours: 62,
  total_budget: 50000,
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
} as const;

test("parseSlackProjectCommand parses notify requests, subscription commands, and bound-thread followups", () => {
  assert.deepEqual(parseSlackProjectCommand("26144 notify labor too high"), {
    projectId: "26144",
    explicitProject: true,
    intent: "notify",
    requestText: "labor too high",
    subscriptionId: null,
  });

  assert.deepEqual(parseSlackProjectCommand("subscriptions"), {
    projectId: null,
    explicitProject: false,
    intent: "subscriptions",
    requestText: "subscriptions",
    subscriptionId: null,
  });

  assert.deepEqual(parseSlackProjectCommand("pause sub_123"), {
    projectId: null,
    explicitProject: false,
    intent: "pause",
    requestText: "pause sub_123",
    subscriptionId: "sub_123",
  });

  assert.deepEqual(parseSlackProjectCommand("26144"), {
    projectId: "26144",
    explicitProject: true,
    intent: "summary",
    requestText: "summary",
    subscriptionId: null,
  });
});

test("stripSlackBotMention removes the leading app mention", () => {
  assert.equal(stripSlackBotMention("<@U123> 26144 summary"), "26144 summary");
});

test("buildSlackProjectResponse creates a create-alert button for notify recommendations", () => {
  const response = buildSlackProjectResponse({
    command: { projectId: "26144", explicitProject: true, intent: "notify", requestText: "labor too high", subscriptionId: null },
    project,
    categoryActuals: { budget_materials: 21400 },
  });

  assert.match(response.text, /delivery default: slack dm/i);
  assert.ok(response.blocks?.length);
  assert.deepEqual(response.blocks, buildSlackNotificationBlocks({
    project,
    recommendation: {
      type: "threshold",
      metricKey: "qbo_total_hours",
      scopeKey: "budget_hrs",
      unit: "hours",
      currentValue: 62,
      basisValue: 100,
      basisLabel: "Labor budget hours",
      spotlight: { id: "warning", label: "Warning", threshold: 95 },
      options: [
        { id: "heads_up", label: "Heads-up", threshold: 80 },
        { id: "warning", label: "Warning", threshold: 95 },
        { id: "over_budget", label: "Over budget", threshold: 100 },
        { id: "critical", label: "Critical overrun", threshold: 110 },
      ],
      message: "Project 26144 has a labor budget of 100 hours and is currently at 62 hours. I recommend a warning alert at 95 hours.",
    },
  }));
});

test("buildSlackSubscriptionListResponse renders management buttons", () => {
  const response = buildSlackSubscriptionListResponse({
    projectId: "26144",
    projectName: "Nissan Texas Letters Repair",
    subscriptions: [{
      id: "sub_123",
      project_id: "26144",
      created_by_email: "joe@meccadesign.com",
      channel: "slack_dm",
      target_json: { slack_user_id: "U123" },
      subscription_type: "metric_threshold_alert",
      metric_key: "qbo_total_hours",
      condition_operator: ">=",
      threshold_value: 95,
      schedule_cron: null,
      status: "active",
      cooldown_minutes: 60,
      summary_text: "Alert when labor hours reach 95 hrs",
      last_triggered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rule_json: { unit: "hours" },
    }],
  });

  assert.match(response.text, /sub_123/);
  assert.ok(response.blocks?.some((block) => JSON.stringify(block).includes("manage_project_subscription")));
  assert.ok(response.blocks?.some((block) => JSON.stringify(block).includes("Pause")));
});
