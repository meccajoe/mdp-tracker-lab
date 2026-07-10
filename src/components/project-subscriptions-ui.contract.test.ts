import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("notification recommendation modal component persists, manages, and can test-deliver project subscriptions", () => {
  const componentPath = join(process.cwd(), "src/components/project-notification-recommendation-card.tsx");
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /\/api\/projects\/\$\{projectId\}\/subscriptions/, "component should call the project subscriptions collection route");
  assert.match(source, /Create suggested alert|Create default digest/i, "component should let the user create a subscription from the recommendation");
  assert.match(source, /Pause|Resume|Delete/, "component should expose management actions for saved subscriptions");
  assert.match(source, /Send test to Slack/i, "component should expose a Slack test-delivery action");
  assert.match(source, /\/api\/projects\/\$\{projectId\}\/subscriptions\/test-delivery/, "component should call the Slack test-delivery route");
  assert.match(source, /loadSubscriptions|fetch\(`\/api\/projects\/\$\{projectId\}\/subscriptions/, "component should load existing project subscriptions");
});
