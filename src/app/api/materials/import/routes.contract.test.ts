import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials import preview route parses workbook, matches candidates, and stages review rows", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/preview/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function POST/, "preview route should expose POST");
  assert.match(source, /parseMaterialsWorkbook\(/, "preview route should parse the workbook using the materials parser");
  assert.match(source, /from\("materials"\)/, "preview route should load existing materials for match analysis");
  assert.match(source, /from\("material_import_batches"\)/, "preview route should create an import batch record");
  assert.match(source, /from\("material_import_rows"\)/, "preview route should stage parsed import rows");
  assert.match(source, /requireMaterialsAdmin/, "preview route should require admin auth");
  assert.match(source, /status:\s*"preview"/, "preview route should mark the batch as preview status");
  assert.match(source, /summary/, "preview route should return a summary payload");
  assert.match(source, /needs_review|parsed|skipped/, "preview route should classify row statuses");
});

test("materials import review route supports save approve and skip actions", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/rows/[rowId]/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function PATCH/, "review route should expose PATCH");
  assert.match(source, /save_review|approve|skip/, "review route should support review actions");
  assert.match(source, /from\("material_import_rows"\)/, "review route should update staged import rows");
  assert.match(source, /from\("materials"\)/, "review route should reload materials for re-matching");
});

test("materials import batch detail route supports row pagination for large review queues", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/batches/[batchId]/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /searchParams\.get\("limit"\)|rowLimit/, "batch detail route should accept a row page limit");
  assert.match(source, /searchParams\.get\("offset"\)|rowOffset/, "batch detail route should accept a row page offset");
  assert.match(source, /rowsHasMore|count:\s*"exact"/, "batch detail route should report whether more staged rows remain");
});

test("materials import commit route dedupes current vendor prices, respects review status, and closes the batch", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/commit/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function POST/, "commit route should expose POST");
  assert.match(source, /from\("material_import_batches"\)/, "commit route should read/update import batches");
  assert.match(source, /from\("material_import_rows"\)/, "commit route should load staged import rows");
  assert.match(source, /needs_review/, "commit route should respect unresolved review rows");
  assert.match(source, /from\("materials"\)/, "commit route should upsert materials");
  assert.match(source, /from\("material_vendor_prices"\)/, "commit route should upsert vendor price rows");
  assert.match(source, /dedupedCount|deduped_existing_vendor_price/, "commit route should track deduped vendor price rows");
  assert.match(source, /from\("vendor_aliases"\)/, "commit route should capture vendor aliases from imported names");
  assert.match(source, /from\("material_aliases"\)/, "commit route should capture helpful material aliases");
  assert.match(source, /from\("material_change_log"\)/, "commit route should audit imported catalog changes");
  assert.match(source, /status:\s*"committed"/, "commit route should mark a finished batch committed");
  assert.match(source, /status:\s*"imported"/, "commit route should mark imported staging rows as imported");
});
