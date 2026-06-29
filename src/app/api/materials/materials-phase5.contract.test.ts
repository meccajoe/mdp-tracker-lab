import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials detail route now returns aliases current vendor prices and audit history", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/[id]/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /material_aliases\(/, "detail route should load material aliases");
  assert.match(source, /material_vendor_prices/, "detail route should still load vendor price rows");
  assert.match(source, /from\("material_change_log"\)/, "detail route should load material audit history");
  assert.match(source, /material_import_batches/, "detail route should include batch context for audit rows");
  assert.match(source, /requireMaterialsAdmin/, "detail route should require admin auth");
});

test("materials search route includes alias-aware search", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/search/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /from\("material_aliases"\)/, "search route should query material aliases for search expansion");
  assert.match(source, /id\.in\.\(/, "search route should merge alias matches back into the material search filter");
});

test("materials vendor price routes support create update and retire flows with audit logging", () => {
  const createRoutePath = join(process.cwd(), "src/app/api/materials/[id]/vendor-prices/route.ts");
  const detailRoutePath = join(process.cwd(), "src/app/api/materials/[id]/vendor-prices/[priceId]/route.ts");
  const createSource = readFileSync(createRoutePath, "utf8");
  const detailSource = readFileSync(detailRoutePath, "utf8");

  assert.match(createSource, /export async function POST/, "vendor price collection route should expose POST");
  assert.match(createSource, /from\("material_vendor_prices"\)[\s\S]*\.insert/, "vendor price POST should insert vendor price rows");
  assert.match(createSource, /from\("material_change_log"\)\.insert/, "vendor price POST should audit changes");
  assert.match(detailSource, /export async function PATCH/, "vendor price detail route should expose PATCH");
  assert.match(detailSource, /export async function DELETE/, "vendor price detail route should expose DELETE");
  assert.match(detailSource, /change_type:\s*"archive"/, "vendor price delete should retire rows instead of hard-deleting history");
});

test("materials alias routes support create update and delete flows with audit logging", () => {
  const createRoutePath = join(process.cwd(), "src/app/api/materials/[id]/aliases/route.ts");
  const detailRoutePath = join(process.cwd(), "src/app/api/materials/[id]/aliases/[aliasId]/route.ts");
  const createSource = readFileSync(createRoutePath, "utf8");
  const detailSource = readFileSync(detailRoutePath, "utf8");

  assert.match(createSource, /export async function POST/, "alias collection route should expose POST");
  assert.match(createSource, /from\("material_aliases"\)[\s\S]*\.insert/, "alias POST should insert alias rows");
  assert.match(detailSource, /export async function PATCH/, "alias detail route should expose PATCH");
  assert.match(detailSource, /export async function DELETE/, "alias detail route should expose DELETE");
  assert.match(detailSource, /from\("material_change_log"\)\.insert/, "alias routes should audit changes");
});

test("materials import batch history routes expose recent batches and batch detail rows", () => {
  const listRoutePath = join(process.cwd(), "src/app/api/materials/import/batches/route.ts");
  const detailRoutePath = join(process.cwd(), "src/app/api/materials/import/batches/[batchId]/route.ts");
  const listSource = readFileSync(listRoutePath, "utf8");
  const detailSource = readFileSync(detailRoutePath, "utf8");

  assert.match(listSource, /export async function GET/, "batch history route should expose GET");
  assert.match(listSource, /from\("material_import_batches"\)/, "batch history route should query import batches");
  assert.match(detailSource, /from\("material_import_rows"\)/, "batch detail route should load batch rows");
  assert.match(detailSource, /from\("material_import_batches"\)/, "batch detail route should load the parent batch");
});
