import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = resolve("src/app/api/admin/labor-reconciliation/july-preview/route.ts");
const page = resolve("src/app/admin/labor-reconciliation/page.tsx");

test("July allocation preview route uses roster classification and the allocation-grid helper", () => {
  assert.ok(existsSync(route), "July preview route should exist");
  const source = readFileSync(route, "utf8");
  assert.match(source, /buildJulyLaborAllocationGrid/);
  assert.match(source, /labor_worker_classifications/);
  assert.match(source, /2026-07-01/);
});

test("Labor Reconciliation exposes the July 2026 review-only pilot preview", () => {
  const source = readFileSync(page, "utf8");
  assert.match(source, /July 2026 allocation preview/);
  assert.match(source, /Employee wages/);
  assert.match(source, /Contractor wages/);
  assert.match(source, /july-preview/);
});
