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

test("budget detail uses the quote-allocation shop-hours formula when available", () => {
  assert.match(source, /const allocationShopBudgetHours = quoteAllocationRows\.length > 0/);
  assert.match(source, /\.filter\(\(row\) => row\.formula_type !== "design"\)/);
  assert.match(source, /shopBudgetHours: allocationShopBudgetHours \?\? project\.budget_hrs/);
});

test("budget detail does not label quote-allocation hours with a stale labor rate", () => {
  const budgetDetailSource = source.slice(
    source.indexOf('<TabsContent value="budget"'),
    source.indexOf('<TabsContent value="allocation"'),
  );
  assert.doesNotMatch(budgetDetailSource, /@ \$\{LABOR_RATE\}\/hr/);
});

test("overview reports allocation-backed labor, non-labor, and total actual costs", () => {
  assert.match(source, /import \{ buildProjectOverviewSummary \} from "@\/lib\/project-overview-summary"/);
  assert.match(source, /const overviewSummary = quoteAllocationRows\.length > 0/);
  assert.match(source, /buildProjectOverviewSummary\(\{/);
  const overviewSource = source.slice(
    source.indexOf('<TabsContent value="overview"'),
    source.indexOf('<TabsContent value="budget"'),
  );
  assert.match(overviewSource, /Labor hours/);
  assert.match(overviewSource, /Non-labor spend/);
  assert.match(overviewSource, /Total actual cost/);
  assert.doesNotMatch(overviewSource, /Budget Spent/);
});
