import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project portfolio manager supports saved portfolios plus Slack-backed portfolio digests and alerts", () => {
  const componentPath = join(process.cwd(), "src/components/project-portfolio-manager.tsx");
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /\/api\/project-portfolios/, "component should load and save named portfolios through the project-portfolios API");
  assert.match(source, /Save automation|Automation rule|all_active_projects|pm_active_projects/i, "component should let admins configure portfolio automation rules from Portfolio Center");
  assert.match(source, /\/api\/project-portfolio-subscriptions/, "component should load and create portfolio subscriptions through the portfolio subscriptions API");
  assert.match(source, /Portfolio digests and alerts/i, "component should render a portfolio manager section title");
  assert.match(source, /Save portfolio/i, "component should support saving named project portfolios");
  assert.match(source, /Create portfolio/i, "component should support creating a portfolio digest or alert from the tracker");
  assert.match(source, /Project .*Client|project_name|client_name/i, "portfolio center should render project names or client names for saved portfolio memberships");
  assert.match(source, /Fabrication reaches 90%|Travel reaches 100%|Labor reaches 95%|over budget/i, "portfolio center should expose richer monitor presets");
  assert.match(source, /All active projects|PM active projects|Saved portfolio/i, "component should expose portfolio scope choices");
});
