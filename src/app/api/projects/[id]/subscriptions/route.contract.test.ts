import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project subscriptions routes authenticate, read project subscriptions, and persist recommendation-backed subscriptions", () => {
  const routePath = join(process.cwd(), "src/app/api/projects/[id]/subscriptions/route.ts");
  const childRoutePath = join(process.cwd(), "src/app/api/projects/[id]/subscriptions/[subscriptionId]/route.ts");
  const routeSource = readFileSync(routePath, "utf8");
  const childSource = readFileSync(childRoutePath, "utf8");

  assert.match(routeSource, /auth\.getUser\(/, "subscriptions route should require an authenticated user");
  assert.match(routeSource, /from\("project_subscriptions"\)/, "subscriptions route should query project_subscriptions");
  assert.match(routeSource, /buildSubscriptionCreatePayload\(/, "subscriptions route should build inserts from recommendation-backed payloads");
  assert.match(routeSource, /insert\(/, "subscriptions route should insert subscription rows");
  assert.match(routeSource, /select\(/, "subscriptions route should list subscriptions");

  assert.match(childSource, /auth\.getUser\(/, "child route should require an authenticated user");
  assert.match(childSource, /from\("project_subscriptions"\)/, "child route should update project_subscriptions");
  assert.match(childSource, /getNextStatusForAction\(/, "child route should normalize pause\/resume\/delete actions");
  assert.match(childSource, /update\(/, "child route should update subscription status");
});
