import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project portfolio subscription routes require admin access and manage Slack-backed portfolio subscriptions", () => {
  const routePath = join(process.cwd(), "src/app/api/project-portfolio-subscriptions/route.ts");
  const childRoutePath = join(process.cwd(), "src/app/api/project-portfolio-subscriptions/[subscriptionId]/route.ts");
  const routeSource = readFileSync(routePath, "utf8");
  const childSource = readFileSync(childRoutePath, "utf8");

  assert.match(routeSource, /requireProjectAdmin\(/, "portfolio subscriptions route should require admin access");
  assert.match(routeSource, /listSlackDmSubscriptions\(/, "portfolio subscriptions route should list Slack-backed portfolio subscriptions");
  assert.match(routeSource, /buildSubscriptionCreatePayload\(/, "portfolio subscriptions route should create shared subscription records");
  assert.match(routeSource, /buildSlackPortfolioRecommendation|portfolio_digest/i, "portfolio subscriptions route should support digest and exception portfolio creation");
  assert.match(routeSource, /channel:\s*"slack_dm"/, "portfolio subscriptions route should persist Slack DM delivery records");

  assert.match(childSource, /requireProjectAdmin\(/, "portfolio subscriptions child route should require admin access");
  assert.match(childSource, /updateSlackDmSubscriptionStatus\(/, "portfolio subscriptions child route should pause resume and delete subscriptions");
});
