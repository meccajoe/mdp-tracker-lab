import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = resolve("src/app/api/admin/labor-reconciliation/july-preview/route.ts");
const page = resolve("src/app/admin/labor-reconciliation/page.tsx");
const reviewHelper = resolve("src/lib/july-labor-review.ts");

test("July allocation preview route delegates roster, allocation, and tie-out work to the shared review helper", () => {
  assert.ok(existsSync(route), "July preview route should exist");
  const source = readFileSync(route, "utf8");
  const helperSource = readFileSync(reviewHelper, "utf8");
  assert.match(source, /buildJulyLaborReview/);
  assert.match(helperSource, /buildJulyLaborAllocationGrid/);
  assert.match(helperSource, /labor_worker_classifications/);
  assert.match(helperSource, /2026-07-01/);
  assert.match(helperSource, /buildLaborTieOut/);
  assert.match(helperSource, /tieOut/);
});

test("Labor Reconciliation exposes the July 2026 review-only pilot preview", () => {
  const source = readFileSync(page, "utf8");
  assert.match(source, /July 2026 allocation preview/);
  assert.match(source, /Employee wages/);
  assert.match(source, /Contractor wages/);
  assert.match(source, /Tie-out controls/);
  assert.match(source, /Exception rows/);
  assert.match(source, /july-preview/);
  assert.match(source, /Selected project/);
  assert.doesNotMatch(source, /Allocation mapping/);
  assert.doesNotMatch(source, /Save mapping/);
});

test("both labor APIs accept the selected project filter", () => {
  assert.match(readFileSync(resolve("src/app/api/admin/labor-reconciliation/route.ts"), "utf8"), /projectId/);
  assert.match(readFileSync(route, "utf8"), /projectId/);
});
