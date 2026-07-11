import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubscriptionCreatePayload,
  buildSubscriptionSummary,
  getNextStatusForAction,
} from "./project-subscriptions.ts";

test("buildSubscriptionCreatePayload creates an active threshold subscription from a threshold recommendation", () => {
  const payload = buildSubscriptionCreatePayload({
    projectId: "26144",
    createdByEmail: "joe@meccadesign.com",
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
      ],
      message: "Project 26144 has a labor budget of 100 hours and is currently at 62 hours. I recommend a warning alert at 95 hours.",
    },
  });

  assert.equal(payload.project_id, "26144");
  assert.equal(payload.scope_type, "project");
  assert.deepEqual(payload.scope_json, { project_id: "26144" });
  assert.equal(payload.created_by_email, "joe@meccadesign.com");
  assert.equal(payload.subscription_type, "metric_threshold_alert");
  assert.equal(payload.metric_key, "qbo_total_hours");
  assert.equal(payload.condition_operator, ">=");
  assert.equal(payload.threshold_value, 95);
  assert.equal(payload.status, "active");
  assert.match(payload.summary_text, /labor hours reach 95 hrs/i);
});

test("buildSubscriptionCreatePayload creates a digest subscription from a digest recommendation", () => {
  const payload = buildSubscriptionCreatePayload({
    projectId: "26144",
    createdByEmail: "joe@meccadesign.com",
    recommendation: {
      type: "digest",
      digestKey: "daily_pm",
      defaultSections: ["labor_hours", "total_spend", "spend_by_category"],
      message: "I can send a daily PM digest.",
    },
  });

  assert.equal(payload.subscription_type, "scheduled_digest");
  assert.equal(payload.metric_key, null);
  assert.equal(payload.schedule_cron, "0 16 * * 1-5");
  assert.match(payload.summary_text, /weekday 4pm/i);
});

test("buildSubscriptionCreatePayload supports Slack DM delivery targets", () => {
  const payload = buildSubscriptionCreatePayload({
    projectId: "26144",
    createdByEmail: "slack:U123",
    channel: "slack_dm",
    targetJson: { delivery: "slack_dm", slack_user_id: "U123" },
    recommendation: {
      type: "threshold",
      metricKey: "qbo_total_hours",
      scopeKey: "budget_hrs",
      unit: "hours",
      currentValue: 62,
      basisValue: 100,
      basisLabel: "Labor budget hours",
      spotlight: { id: "warning", label: "Warning", threshold: 95 },
      options: [{ id: "warning", label: "Warning", threshold: 95 }],
      message: "Project 26144 has a labor budget of 100 hours and is currently at 62 hours. I recommend a warning alert at 95 hours.",
    },
  });

  assert.equal(payload.channel, "slack_dm");
  assert.deepEqual(payload.target_json, { delivery: "slack_dm", slack_user_id: "U123" });
});

test("buildSubscriptionCreatePayload supports portfolio digest scopes", () => {
  const payload = buildSubscriptionCreatePayload({
    createdByEmail: "paul@meccadesign.com",
    channel: "slack_dm",
    targetJson: { delivery: "slack_dm", slack_user_id: "U123" },
    scopeType: "all_active_projects",
    scopeJson: {},
    recommendation: {
      type: "digest",
      digestKey: "portfolio_digest",
      defaultSections: ["portfolio_health"],
      message: "I can send a portfolio digest.",
    },
  });

  assert.equal(payload.project_id, null);
  assert.equal(payload.scope_type, "all_active_projects");
  assert.deepEqual(payload.scope_json, {});
  assert.match(payload.summary_text, /portfolio digest/i);
  assert.match(payload.summary_text, /all active projects/i);
});

test("buildSubscriptionSummary renders clear human-readable labels", () => {
  const summary = buildSubscriptionSummary({
    subscription_type: "metric_threshold_alert",
    metric_key: "qbo_total_hours",
    condition_operator: ">=",
    threshold_value: 95,
    schedule_cron: null,
    rule_json: { unit: "hours" },
  });

  assert.equal(summary, "Alert when labor hours reach 95 hrs");
});

test("buildSubscriptionSummary renders portfolio scope labels for digests", () => {
  const summary = buildSubscriptionSummary({
    subscription_type: "scheduled_digest",
    scope_type: "pm_active_projects",
    scope_json: { pm_initials: "PM" },
    metric_key: null,
    condition_operator: null,
    threshold_value: null,
    schedule_cron: "0 16 * * 1-5",
    rule_json: {},
  });

  assert.equal(summary, "Weekday 4pm portfolio digest — PM active projects");
});

test("getNextStatusForAction supports pause resume and archive actions", () => {
  assert.equal(getNextStatusForAction("pause"), "paused");
  assert.equal(getNextStatusForAction("resume"), "active");
  assert.equal(getNextStatusForAction("delete"), "archived");
});
