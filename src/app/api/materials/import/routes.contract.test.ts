import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials import preview route parses workbook and stages import rows", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/preview/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function POST/, "preview route should expose POST");
  assert.match(source, /parseMaterialsWorkbook\(/, "preview route should parse the workbook using the materials parser");
  assert.match(source, /from\("material_import_batches"\)/, "preview route should create an import batch record");
  assert.match(source, /from\("material_import_rows"\)/, "preview route should stage parsed import rows");
  assert.match(source, /requireMaterialsAdmin/, "preview route should require admin auth");
  assert.match(source, /status:\s*"preview"/, "preview route should mark the batch as preview status");
  assert.match(source, /summary/, "preview route should return a summary payload");
  assert.match(source, /needs_review|parsed|skipped/, "preview route should classify row statuses");
});

test("materials import commit route upserts catalog rows from staged imports and closes the batch", () => {
  const routePath = join(process.cwd(), "src/app/api/materials/import/commit/route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function POST/, "commit route should expose POST");
  assert.match(source, /from\("material_import_batches"\)/, "commit route should read/update import batches");
  assert.match(source, /from\("material_import_rows"\)/, "commit route should load staged import rows");
  assert.match(source, /from\("materials"\)/, "commit route should upsert materials");
  assert.match(source, /from\("material_vendor_prices"\)/, "commit route should upsert vendor price rows");
  assert.match(source, /from\("vendor_aliases"\)/, "commit route should capture vendor aliases from imported names");
  assert.match(source, /from\("material_change_log"\)/, "commit route should audit imported catalog changes");
  assert.match(source, /status:\s*"committed"/, "commit route should mark a finished batch committed");
  assert.match(source, /status:\s*"imported"/, "commit route should mark imported staging rows as imported");
});
