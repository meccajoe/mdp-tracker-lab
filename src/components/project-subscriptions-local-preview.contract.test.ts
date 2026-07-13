import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("notification modal component uses the shared Slack-backed subscription store instead of browser-local preview storage", () => {
  const componentPath = join(process.cwd(), "src/components/project-notification-recommendation-card.tsx");
  const source = readFileSync(componentPath, "utf8");

  assert.doesNotMatch(source, /localStorage/, "component should not keep browser-local subscription state now that Slack-backed persistence is live");
  assert.doesNotMatch(source, /project-subscriptions:/, "component should not use a project-scoped local preview key");
  assert.doesNotMatch(source, /Preview mode: saved locally|local preview mode/i, "component should not present a preview-mode fallback once shared persistence is live");
  assert.match(source, /\/api\/projects\/\$\{projectId\}\/subscriptions/, "component should load subscriptions from the shared project subscriptions API");
});
