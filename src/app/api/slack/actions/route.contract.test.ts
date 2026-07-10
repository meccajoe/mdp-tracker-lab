import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Slack actions route saves and manages subscriptions with DM delivery defaults", () => {
  const routePath = join(process.cwd(), "src/app/api/slack/actions/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /verifySlackRequest\(/, "route should verify Slack signatures");
  assert.match(source, /lookupSlackEmailByUserId\(/, "route should try to resolve the Slack user email");
  assert.match(source, /buildSubscriptionCreatePayload\(/, "route should reuse the shared subscription payload builder");
  assert.match(source, /channel: "slack_dm"/, "route should default Slack-created subscriptions to DM delivery");
  assert.match(source, /listSlackDmSubscriptionsForProject\(/, "route should rebuild the creator's subscription list after actions");
  assert.match(source, /updateSlackDmSubscriptionStatus\(/, "route should support subscription management buttons");
  assert.match(source, /from\("project_subscriptions"\)/, "route should persist into project_subscriptions");
});
