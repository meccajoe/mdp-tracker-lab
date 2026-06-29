import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials client renders catalog search controls and actions", () => {
  const filePath = join(process.cwd(), "src/app/admin/materials/MaterialsClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.match(source, /Materials/, "materials page should render a clear Materials heading");
  assert.match(source, /\/api\/materials\/search/, "materials client should query the materials search API");
  assert.match(source, /Search materials|Search by material, vendor, size/i, "materials client should include a search input");
  assert.match(source, /Category/, "materials client should include a category filter");
  assert.match(source, /Vendor/, "materials client should include a vendor filter");
  assert.match(source, /Active|Inactive/, "materials client should include an active state filter");
  assert.match(source, /Add Material/, "materials client should expose an add material action");
  assert.match(source, /Import Workbook|Import/, "materials client should expose workbook import entry");
});
