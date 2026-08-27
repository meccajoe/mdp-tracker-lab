import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const component = readFileSync("src/components/project-completion-readiness.tsx", "utf8");
const route = readFileSync("src/app/api/projects/[id]/completion-readiness/route.ts", "utf8");
const page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");

test("project overview exposes the persisted completion readiness review", () => {
  assert.match(page, /ProjectCompletionReadiness/);
  assert.match(component, /Completion Readiness/);
  assert.match(component, /No reportable issues/);
  assert.match(component, /Save review/);
});

test("completion review API supports read and auditable update", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /project_completion_reviews/);
  assert.match(route, /reviewed_by/);
});
