import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routePath = join(process.cwd(), "src/app/api/production-issues/route.ts");

test("production issues API exposes authenticated list and create paths", () => {
  assert.ok(existsSync(routePath), "production issue collection route should exist");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /requireIssueActor/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /from\("production_issues"\)/);
  assert.match(source, /category/);
  assert.match(source, /severity/);
  assert.match(source, /schedule_impact_days/);
  assert.match(source, /created_by:\s*actor\.actorEmail/);
});
