import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlackPortfolioConfirmationText,
  buildSlackPortfolioSubscriptionListText,
  parseSlackPortfolioCommand,
} from "./slack-portfolio-copilot.ts";

test("parseSlackPortfolioCommand parses digest creation and management flows", () => {
  assert.deepEqual(parseSlackPortfolioCommand("portfolio my-active digest"), {
    intent: "create_digest",
    requestText: "my-active digest",
    subscriptionId: null,
    scopeType: "my_active_projects",
    scopeJson: {},
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio pm PM digest"), {
    intent: "create_digest",
    requestText: "pm PM digest",
    subscriptionId: null,
    scopeType: "pm_active_projects",
    scopeJson: { pm_initials: "PM" },
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio subscriptions"), {
    intent: "subscriptions",
    requestText: "subscriptions",
    subscriptionId: null,
    scopeType: null,
    scopeJson: {},
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio pause sub_123"), {
    intent: "pause",
    requestText: "pause sub_123",
    subscriptionId: "sub_123",
    scopeType: null,
    scopeJson: {},
  });
});

test("buildSlackPortfolioSubscriptionListText renders scope labels", () => {
  const text = buildSlackPortfolioSubscriptionListText([
    {
      id: "sub_123",
      project_id: null,
      created_by_email: "paul@meccadesign.com",
      channel: "slack_dm",
      target_json: { slack_user_id: "U123" },
      subscription_type: "scheduled_digest",
      scope_type: "pm_active_projects",
      scope_json: { pm_initials: "PM" },
      metric_key: null,
      condition_operator: null,
      threshold_value: null,
      schedule_cron: "0 16 * * 1-5",
      status: "active",
      cooldown_minutes: 60,
      summary_text: "Weekday 4pm portfolio digest — PM active projects",
      last_triggered_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      rule_json: { sections: ["portfolio_health"] },
    },
  ]);

  assert.match(text, /portfolio subscriptions/i);
  assert.match(text, /scope: PM active projects/);
});

test("buildSlackPortfolioConfirmationText renders create and delete confirmations", () => {
  assert.match(buildSlackPortfolioConfirmationText({ action: "create", scopeType: "all_active_projects", scopeJson: {} }), /all active projects/i);
  assert.equal(buildSlackPortfolioConfirmationText({ action: "delete", subscriptionId: "sub_123" }), "Deleted subscription sub_123.");
});
