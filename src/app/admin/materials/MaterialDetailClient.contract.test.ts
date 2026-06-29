import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials detail client supports canonical field editing alias/vendor management and audit history", () => {
  const filePath = join(process.cwd(), "src/app/admin/materials/MaterialDetailClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.match(source, /canonical_name|Canonical Name/, "detail client should expose canonical name editing");
  assert.match(source, /Category/, "detail client should expose category editing");
  assert.match(source, /Dimensions/, "detail client should expose dimensions editing");
  assert.match(source, /Thickness/, "detail client should expose thickness editing");
  assert.match(source, /Default Price/, "detail client should expose default price editing");
  assert.match(source, /\/api\/materials\//, "detail client should use the materials detail API");
  assert.match(source, /Save Material|Create Material/, "detail client should expose a save action");
  assert.match(source, /Archive Material|Restore Material/, "detail client should expose archive\/restore behavior");
  assert.match(source, /Material Aliases|Add Alias/, "detail client should expose material alias management");
  assert.match(source, /Save Vendor Price|Add Vendor Price/, "detail client should expose vendor price editing controls");
  assert.match(source, /Save \+ Set Default/, "detail client should allow setting a vendor price row as the default price");
  assert.match(source, /Audit History|material_change_log/, "detail client should expose material audit history");
});
