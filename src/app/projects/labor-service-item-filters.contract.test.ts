import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const projectPage = fs.readFileSync(path.join(root, "src/app/projects/[id]/page.tsx"), "utf8");
const laborTable = fs.readFileSync(path.join(root, "src/components/qbo-labor-table.tsx"), "utf8");
const overallPage = fs.readFileSync(path.join(root, "src/app/admin/labor-reconciliation/page.tsx"), "utf8");

test("project labor view exposes service-item tags, filter, and grouping", () => {
  assert.match(projectPage, /laborServiceItemFilter/);
  assert.match(projectPage, /listLaborServiceItemTags\(qboLaborEntries\)/);
  assert.match(projectPage, /matchesLaborServiceItemTag\(e\.service_item, laborServiceItemFilter\)/);
  assert.match(projectPage, />By Service Item</);
  assert.match(laborTable, /view: "employee" \| "date" \| "serviceItem"/);
  assert.match(laborTable, /function ByServiceItemView/);
  assert.match(laborTable, />Service Item</);
});

test("overall labor view filters all-project or selected-project logs by service item", () => {
  assert.match(overallPage, /const \[serviceItem, setServiceItem\] = useState\("all"\)/);
  assert.match(overallPage, /listLaborServiceItemTags\(labor\)/);
  assert.match(overallPage, /matchesLaborServiceItemTag\(row\.service_item, serviceItem\)/);
  assert.match(overallPage, /Service item: All/);
  assert.match(overallPage, /Selected project: All projects/);
  assert.match(overallPage, />Work Type</);
  assert.match(overallPage, /Work Type filter applies only to the labor log summary and table/);
  assert.match(overallPage, /Accounting preview and exports always include all service items/);
});

test("install and dismantle costs stay out of Shop Hours without disappearing from project accounting", () => {
  assert.match(projectPage, /key === "budget_id_labor"/);
  assert.match(projectPage, /group === "install" \|\| group === "dismantle"/);
  assert.match(projectPage, /Unclassified labor:/);
  assert.match(projectPage, /name: "Unclassified Labor"/);
});
