import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("quote allocation surfaces actual labor, materials, and purchase/other costs", () => {
  assert.match(source, /data-slot="project-quote-allocation-actuals"/);
  assert.match(source, /Actuals to date/);
  assert.match(source, /Labor actual/);
  assert.match(source, /Materials actual/);
  assert.match(source, /Purchase \/ other actual/);
  assert.match(source, /allocationLaborActualHours/);
  assert.match(source, /allocationMaterialsActual/);
  assert.match(source, /allocationNonLmActual/);
});

test("budget detail uses the quote-allocation labor-hours formula when available", () => {
  assert.match(source, /const allocationLaborBudgetHours = quoteAllocationRows\.length > 0 \? quoteAllocationTotals\.labor_hours : null/);
  assert.match(source, /field\.key === "budget_hrs" && allocationLaborBudgetHours != null\s*\? allocationLaborBudgetHours/);
});
