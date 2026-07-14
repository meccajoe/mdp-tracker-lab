import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("PM starting portfolio automation keeps one active-project portfolio per PM and removes completed jobs", () => {
  const helperPath = join(process.cwd(), "src/lib/project-auto-portfolio-membership.ts");
  const helperSource = readFileSync(helperPath, "utf8");

  assert.match(helperSource, /buildPmStartingPortfolioName/, "helper should define a stable PM portfolio naming convention");
  assert.match(helperSource, /Active Projects/, "helper should create active-project PM portfolios");
  assert.match(helperSource, /upsertSavedPortfolio\(/, "helper should create PM portfolios on demand");
  assert.match(helperSource, /upsertPortfolioProjectMembership\(/, "helper should add projects to the active PM portfolio");
  assert.match(helperSource, /removePortfolioProjectMembership\(/, "helper should remove projects from PM portfolios when no longer active there");
  assert.match(helperSource, /ACTIVE_PROJECT_STATUSES/, "helper should only keep active-ish statuses enrolled in PM portfolios");
});

test("project create and update paths trigger PM starting portfolio automation", () => {
  const paths = [
    "src/app/projects/new/page.tsx",
    "src/app/projects/[id]/edit/page.tsx",
    "src/app/admin/data-entry/page.tsx",
    "src/app/api/webhooks/hubspot/route.ts",
  ];

  for (const relativePath of paths) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.match(source, /syncPmStartingPortfolioMembership\(/, `${relativePath} should trigger PM starting portfolio automation`);
  }
});
