import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateCompletionReadiness, COMPLETION_READINESS_ITEMS } from "./project-completion-readiness.ts";

const migration = readFileSync(resolve("supabase/migrations/20260827170000_project_completion_reviews.sql"), "utf8");

test("completion readiness migration persists an auditable per-project review", () => {
  assert.match(migration, /create table if not exists public\.project_completion_reviews/i);
  assert.match(migration, /project_id text primary key/i);
  assert.match(migration, /checklist jsonb/i);
  assert.match(migration, /reviewed_by text/i);
  assert.match(migration, /updated_at timestamptz/i);
});

test("completion is ready only when every required review is confirmed or excepted", () => {
  const checklist = Object.fromEntries(COMPLETION_READINESS_ITEMS.map((item) => [item.key, "confirmed"]));
  assert.equal(evaluateCompletionReadiness(checklist).ready, true);
  checklist.labor_after_close = "pending";
  const result = evaluateCompletionReadiness(checklist);
  assert.equal(result.ready, false);
  assert.deepEqual(result.pending, ["labor_after_close"]);
});

test("explicit exceptions count as reviewed while blank values remain pending", () => {
  const checklist = Object.fromEntries(COMPLETION_READINESS_ITEMS.map((item) => [item.key, "exception"]));
  delete checklist.production_issues;
  assert.deepEqual(evaluateCompletionReadiness(checklist), { ready: false, pending: ["production_issues"], exceptions: COMPLETION_READINESS_ITEMS.filter((item) => item.key !== "production_issues").map((item) => item.key) });
});
