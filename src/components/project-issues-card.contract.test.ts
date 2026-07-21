import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const cardPath = join(process.cwd(), "src/components/project-issues-card.tsx");
const pagePath = join(process.cwd(), "src/app/projects/[id]/page.tsx");

test("project pages show their logged issues and support project-context logging", () => {
  assert.ok(existsSync(cardPath), "project issues card should exist");
  const card = readFileSync(cardPath, "utf8");
  const page = readFileSync(pagePath, "utf8");

  assert.match(card, /from\("production_issues"\)/);
  assert.match(card, /IssueQuickLogDialog/);
  assert.match(card, /project_id/);
  assert.match(page, /ProjectIssuesCard/);
});
