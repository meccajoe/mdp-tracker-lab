import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
const editPage = readFileSync("src/app/projects/[id]/edit/page.tsx", "utf8");
const generateRoute = readFileSync("src/app/api/projects/[id]/postmortem/generate/route.ts", "utf8");

test("project page uses one Mark complete action and removes Completion Readiness UI", () => {
  assert.doesNotMatch(page, /ProjectCompletionReadiness/);
  assert.match(page, /Mark complete/);
  assert.match(page, /completeProjectAndGenerate/);
  assert.match(page, /complete_project:\s*true/);
});

test("saving a Completed status from the edit form also starts the post-mortem", () => {
  assert.match(editPage, /initialStatus\s*!==\s*"Completed"\s*&&\s*status\s*===\s*"Completed"/);
  assert.match(editPage, /postmortem\/generate/);
});

test("postmortem generation can atomically start from a completion request", () => {
  assert.match(generateRoute, /complete_project/);
  assert.match(generateRoute, /status:\s*"Completed"/);
  assert.match(generateRoute, /close_date/);
  assert.match(generateRoute, /syncPmStartingPortfolioMembership/);
  assert.match(generateRoute, /status:\s*"generating"/);
});
