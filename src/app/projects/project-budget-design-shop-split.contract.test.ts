import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8");

test("Budget Detail separates shop and designer hours with the approved design formula", () => {
  assert.match(pageSource, /buildProjectBudgetLaborSplit/);
  assert.match(pageSource, /label: "Shop Hours"/);
  assert.match(pageSource, /label: "Designer Hours"/);
  assert.match(pageSource, /laborSplit\[field\.laborKind\]/);
  assert.match(pageSource, /Design sell: \$125\/hr · budget cost: \$25\/hr/);
});
