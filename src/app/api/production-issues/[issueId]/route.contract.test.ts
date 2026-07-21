import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routePath = join(process.cwd(), "src/app/api/production-issues/[issueId]/route.ts");

test("production issues expose authenticated edit and delete paths", () => {
  assert.ok(existsSync(routePath), "issue detail route should exist");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /requireIssueActor\(request\)/);
  assert.match(source, /from\("production_issues"\)\.update/);
  assert.match(source, /from\("production_issues"\)\.delete/);
});
