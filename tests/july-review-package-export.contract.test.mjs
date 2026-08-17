import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = resolve("src/app/api/admin/labor-reconciliation/july-review-package/route.ts");
const page = resolve("src/app/admin/labor-reconciliation/page.tsx");
test("exports the persisted July review package as a workbook from Labor Reconciliation", () => {
  assert.ok(existsSync(route));
  const source = readFileSync(route, "utf8");
  assert.match(source, /labor_allocation_je_reviews/);
  assert.match(source, /XLSX\.write/);
  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(readFileSync(page, "utf8"), /Export July review package/);
});
