import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project subscriptions routes authenticate, manage the current user's Slack-backed subscriptions, and persist recommendation-backed payloads", () => {
  const routePath = join(process.cwd(), "src/app/api/projects/[id]/subscriptions/route.ts");
  const childRoutePath = join(process.cwd(), "src/app/api/projects/[id]/subscriptions/[subscriptionId]/route.ts");
  const routeSource = readFileSync(routePath, "utf8");
  const childSource = readFileSync(childRoutePath, "utf8");

  assert.match(routeSource, /auth\.getUser\(/, "subscriptions route should require an authenticated user");
  assert.match(routeSource, /from\("project_subscriptions"\)/, "subscriptions route should query project_subscriptions");
  assert.match(routeSource, /buildSubscriptionCreatePayload\(/, "subscriptions route should build inserts from recommendation-backed payloads");
  assert.match(routeSource, /channel:\s*"slack_dm"/, "subscriptions route should create Slack DM subscriptions from the web app");
  assert.match(routeSource, /created_via:\s*"project_modal"/, "subscriptions route should tag subscriptions created from the project modal");
  assert.match(routeSource, /resolveSlackIdentityForProjectModal\(|slack_user_id|slack_email/, "subscriptions route should persist Slack identity metadata for project-modal subscriptions");
  assert.match(routeSource, /const userEmail = auth\.user\.email\.toLowerCase\(\)/, "subscriptions route should normalize the authenticated user's email once");
  assert.match(routeSource, /\.eq\("channel",\s*"slack_dm"\)/, "subscriptions route should list only Slack-backed subscriptions");
  assert.match(routeSource, /\.eq\("created_by_email",\s*userEmail\)/, "subscriptions route should list only the authenticated user's subscriptions");
  assert.match(routeSource, /insert\(/, "subscriptions route should insert subscription rows");
  assert.match(routeSource, /select\(/, "subscriptions route should list subscriptions");

  assert.match(childSource, /auth\.getUser\(/, "child route should require an authenticated user");
  assert.match(childSource, /from\("project_subscriptions"\)/, "child route should update project_subscriptions");
  assert.match(childSource, /const userEmail = auth\.user\.email\.toLowerCase\(\)/, "child route should normalize the authenticated user's email once");
  assert.match(childSource, /\.eq\("channel",\s*"slack_dm"\)/, "child route should only update Slack-backed subscriptions");
  assert.match(childSource, /\.eq\("created_by_email",\s*userEmail\)/, "child route should only manage the authenticated user's subscriptions");
  assert.match(childSource, /getNextStatusForAction\(/, "child route should normalize pause\/resume\/delete actions");
  assert.match(childSource, /update\(/, "child route should update subscription status");
});
