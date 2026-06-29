import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials create route inserts canonical materials and logs a create audit row", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function POST/, "route should expose POST for material creation");
  assert.match(source, /from\("materials"\)[\s\S]*\.insert/, "route should insert into materials");
  assert.match(source, /from\("material_change_log"\)\.insert/, "route should write an audit log row");
  assert.match(source, /change_type:\s*"create"/, "route should log create operations as create");
  assert.match(source, /canonical_name/, "route should persist canonical_name");
  assert.match(source, /category/, "route should persist category");
});

test("materials detail route supports GET and PATCH with archive-aware audit logging", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/[id]/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function GET/, "detail route should expose GET for loading a material");
  assert.match(source, /export async function PATCH/, "detail route should expose PATCH for edits/archive");
  assert.match(source, /from\("materials"\)[\s\S]*\.select/, "detail route should load materials from the catalog");
  assert.match(source, /from\("materials"\)[\s\S]*\.update/, "detail route should update materials");
  assert.match(source, /from\("material_change_log"\)\.insert/, "detail route should audit updates");
  assert.match(source, /change_type:\s*isArchiving\s*\?\s*"archive"\s*:\s*"update"|change_type:\s*archiveAction/, "detail route should distinguish archive vs update audit types");
  assert.match(source, /material_vendor_prices/, "detail route should return current vendor price context for editing");
});
