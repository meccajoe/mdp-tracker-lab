import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("notification modal component falls back to browser-local preview storage when subscription APIs are unavailable", () => {
  const componentPath = join(process.cwd(), "src/components/project-notification-recommendation-card.tsx");
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /localStorage/, "component should use localStorage as a preview fallback before Slack and DB wiring are fully live");
  assert.match(source, /project-subscriptions:/, "component should use a project-scoped localStorage key");
  assert.match(source, /Preview mode: saved locally|local preview mode/i, "component should explain when it is using local preview storage");
});
