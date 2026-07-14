import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("project portfolio routes require admin access and support listing, saving, and deleting named portfolios", () => {
  const routePath = join(process.cwd(), "src/app/api/project-portfolios/route.ts");
  const childRoutePath = join(process.cwd(), "src/app/api/project-portfolios/[slug]/route.ts");
  const routeSource = readFileSync(routePath, "utf8");
  const childSource = readFileSync(childRoutePath, "utf8");

  assert.match(routeSource, /requireProjectAdmin\(/, "portfolio route should require admin access");
  assert.match(routeSource, /listSavedPortfolios\(/, "portfolio route should list saved portfolios");
  assert.match(routeSource, /upsertSavedPortfolio\(/, "portfolio route should save or update a named portfolio");

  assert.match(childSource, /requireProjectAdmin\(/, "portfolio child route should require admin access");
  assert.match(childSource, /deleteSavedPortfolio\(/, "portfolio delete route should delete a named portfolio");
  assert.match(childSource, /updateSavedPortfolioAutomation\(/, "portfolio child route should update automation rules for a named portfolio");
});
