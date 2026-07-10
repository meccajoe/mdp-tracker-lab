import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project subscription evaluator cron route is secret-protected and supports dry-run filters", () => {
  const routePath = join(process.cwd(), "src/app/api/cron/evaluate-project-subscriptions/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /authorization\"\)\?\.replace\("Bearer ", ""\)/, "route should require bearer authorization");
  assert.match(source, /process\.env\.CRON_SECRET/, "route should validate CRON_SECRET");
  assert.match(source, /dryRun/, "route should support dry-run evaluation");
  assert.match(source, /force/, "route should support forcing scheduled digests for testing");
  assert.match(source, /projectId/, "route should support project filtering");
  assert.match(source, /subscriptionId/, "route should support subscription filtering");
  assert.match(source, /evaluateProjectSubscriptions\(/, "route should delegate to the shared evaluator");
});
