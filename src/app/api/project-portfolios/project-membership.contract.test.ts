import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("portfolio project-membership route supports per-project add/update with monitor metadata", () => {
  const routePath = join(process.cwd(), "src/app/api/project-portfolios/[slug]/projects/route.ts");
  assert.equal(existsSync(routePath), true, "portfolio project-membership route should exist");

  const source = readFileSync(routePath, "utf8");
  assert.match(source, /requireProjectAdmin\(/, "project-membership route should require admin access");
  assert.match(source, /upsertPortfolioProjectMembership\(/, "project-membership route should upsert a single project's membership");
  assert.match(source, /removePortfolioProjectMembership\(/, "project-membership route should support removing a project from a portfolio");
  assert.match(source, /ownerEmail/, "project-membership route should support targeting portfolios owned by a different admin");
  assert.match(source, /monitorKeys|monitor_json/, "project-membership route should carry monitor metadata");
});
