import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routePath = join(process.cwd(), "src/app/api/pricing-intelligence/projects/route.ts");

test("pricing intelligence API reads the shared index with safe filters", () => {
  assert.ok(existsSync(routePath), "pricing intelligence projects route should exist");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /requireProjectAdmin/);
  assert.match(source, /from\("project_pricing_index"\)/);
  assert.match(source, /project_type/);
  assert.match(source, /contract_min/);
  assert.match(source, /contract_max/);
  assert.match(source, /limit/);
});
