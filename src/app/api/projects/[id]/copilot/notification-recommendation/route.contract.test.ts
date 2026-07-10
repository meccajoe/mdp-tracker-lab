import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("project notification recommendation route authenticates and builds grounded recommendations", () => {
  const routePath = join(process.cwd(), "src/app/api/projects/[id]/copilot/notification-recommendation/route.ts");
  assert.equal(existsSync(routePath), true, "notification recommendation route should exist");

  const source = readFileSync(routePath, "utf8");
  assert.match(source, /auth\.getUser\(/, "route should require an authenticated user");
  assert.match(source, /from\("project_summary"\)/, "route should load project summary data");
  assert.match(source, /from\("expenses"\)/, "route should load expense/category actuals for recommendations");
  assert.match(source, /buildProjectNotificationRecommendation\(/, "route should delegate recommendation logic to the shared helper");
  assert.match(source, /NextResponse\.json\(/, "route should return JSON output");
});
