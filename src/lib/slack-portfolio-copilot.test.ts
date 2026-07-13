import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlackPortfolioConfirmationText,
  buildSlackPortfolioRecommendation,
  buildSlackPortfolioSetupBlocks,
  buildSlackPortfolioSubscriptionListText,
  buildSlackSavedPortfolioListText,
  parseSlackPortfolioCommand,
} from "./slack-portfolio-copilot.ts";

test("parseSlackPortfolioCommand parses digest, exception, save, and management flows", () => {
  assert.deepEqual(parseSlackPortfolioCommand("portfolio"), {
    intent: "setup",
    requestText: "",
    subscriptionId: null,
    scopeType: null,
    scopeJson: {},
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio my-active digest"), {
    intent: "create_digest",
    requestText: "my-active digest",
    subscriptionId: null,
    scopeType: "my_active_projects",
    scopeJson: {},
    exceptionKey: null,
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio my-active over-budget"), {
    intent: "create_exception",
    requestText: "my-active over-budget",
    subscriptionId: null,
    scopeType: "my_active_projects",
    scopeJson: {},
    exceptionKey: "over_budget",
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio pm PM labor-risk"), {
    intent: "create_exception",
    requestText: "pm PM labor-risk",
    subscriptionId: null,
    scopeType: "pm_active_projects",
    scopeJson: { pm_initials: "PM" },
    exceptionKey: "labor_risk",
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio saved client-a digest"), {
    intent: "create_digest",
    requestText: "saved client-a digest",
    subscriptionId: null,
    scopeType: "saved_portfolio",
    scopeJson: { portfolio_slug: "client-a", portfolio_name: "client-a" },
    exceptionKey: null,
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio save client-a 26144 26145"), {
    intent: "save_portfolio",
    requestText: "save client-a 26144 26145",
    subscriptionId: null,
    scopeType: null,
    scopeJson: {},
    portfolioName: "client-a",
    projectIds: ["26144", "26145"],
  });

  assert.deepEqual(parseSlackPortfolioCommand("portfolio saved"), {
    intent: "saved_portfolios",
    requestText: "saved",
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

test("portfolio helpers render setup blocks, saved-portfolio list, and recommendations", () => {
  const blocks = buildSlackPortfolioSetupBlocks();
  assert.equal(blocks.length, 3);
  assert.match(JSON.stringify(blocks), /create_portfolio_subscription/);
  assert.match(buildSlackSavedPortfolioListText([{ name: "Client A", slug: "client-a", project_ids: ["26144"] }]), /client-a/);
  const rec = buildSlackPortfolioRecommendation({ scopeType: "all_active_projects", scopeJson: {}, exceptionKey: "over_budget" });
  assert.match(rec.message, /goes over budget/i);
});

test("buildSlackPortfolioConfirmationText renders create and delete confirmations", () => {
  assert.match(buildSlackPortfolioConfirmationText({ action: "create", scopeType: "all_active_projects", scopeJson: {} }), /all active projects/i);
  assert.equal(buildSlackPortfolioConfirmationText({ action: "delete", subscriptionId: "sub_123" }), "Deleted subscription sub_123.");
});
