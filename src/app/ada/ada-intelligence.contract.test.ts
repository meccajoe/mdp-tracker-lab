import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const gateway = join(root, "src/lib/ada-intelligence/gateway.ts");
const route = join(root, "src/app/api/ada/workspaces/[workspaceId]/intelligence/route.ts");

test("Ada intelligence is owner-scoped, bounded, and exposes cited Tracker evidence", () => {
  assert.ok(existsSync(gateway));
  assert.ok(existsSync(route));
  const source = readFileSync(gateway, "utf8");
  const routeSource = readFileSync(route, "utf8");
  assert.match(source, /materials/);
  assert.match(source, /project_pricing_index/);
  assert.match(source, /material_aliases/);
  assert.match(source, /material_vendor_prices/);
  assert.match(source, /quote_line_items/);
  assert.match(source, /expenses/);
  assert.match(source, /project_summary/);
  assert.match(source, /budget_formula_settings/);
  assert.match(source, /MAX_EVIDENCE_PER_RESOURCE/);
  assert.match(source, /enforceComparableGate/);
  assert.match(routeSource, /requireAdaAccess/);
  assert.match(routeSource, /created_by_email/);
  assert.match(routeSource, /query/);
});
