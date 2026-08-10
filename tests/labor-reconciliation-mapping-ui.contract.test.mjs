import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve("src/app/api/admin/labor-reconciliation/route.ts"), "utf8");
const page = readFileSync(resolve("src/app/admin/labor-reconciliation/page.tsx"), "utf8");

test("labor reconciliation API returns Service Item data and durable allocation mappings", () => {
  assert.match(route, /service_item/);
  assert.match(route, /labor_allocation_mappings/);
  assert.match(route, /export async function PUT/);
});

test("labor reconciliation page exposes each log Service Item and an allocation mapping table", () => {
  assert.match(page, /Service Item/);
  assert.match(page, /Allocation mapping/);
  assert.match(page, /Source GL ID/);
  assert.match(page, /Target GL ID/);
});
