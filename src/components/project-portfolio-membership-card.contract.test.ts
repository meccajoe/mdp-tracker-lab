import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project portfolio membership card supports per-project portfolio membership plus monitor selection", () => {
  const componentPath = join(process.cwd(), "src/components/project-portfolio-membership-card.tsx");
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /\/api\/project-portfolios/, "component should load saved portfolios");
  assert.match(source, /\/api\/project-portfolios\/\$\{(?:selectedPortfolioSlug|slug)\}\/projects/, "component should upsert project membership into a specific portfolio");
  assert.match(source, /Add this project to a portfolio|Portfolio membership/i, "component should present a per-project portfolio entry surface");
  assert.match(source, /Open portfolio center|Manage portfolios/, "component should link users to the dedicated portfolio page");
  assert.match(source, /Create a new portfolio with this project|create new portfolio/i, "component should offer a lightweight create-new-portfolio shortcut from the project modal");
  assert.match(source, /client_name|project_name|Client/i, "component should show richer project identity than a raw project id when memberships exist");
  assert.match(source, /monitor|budget|labor/i, "component should expose monitor-specific selections, not just raw membership");
});
