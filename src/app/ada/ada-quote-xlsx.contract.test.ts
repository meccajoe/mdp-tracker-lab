import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const builder = join(root, "src/lib/ada-quote-workbook.ts");
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/revisions/[revisionId]/xlsx/route.ts");
test("Ada derives a formula-backed XLSX workbook from an immutable quote revision", () => {
  assert.ok(existsSync(builder)); assert.ok(existsSync(route));
  const source = readFileSync(builder, "utf8"); const routeSource = readFileSync(route, "utf8");
  assert.match(source, /Additional Items/);
  assert.match(source, /Margin Factor/);
  assert.match(source, /SUM\(/);
  assert.match(source, /Internal Cost/);
  assert.match(source, /Sell Price/);
  assert.match(routeSource, /requireAdaAccess/);
  assert.match(routeSource, /created_by_email/);
  assert.match(routeSource, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});
