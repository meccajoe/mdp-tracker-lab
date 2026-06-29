import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("materials detail client supports canonical field editing and archive/save actions", () => {
  const filePath = join(process.cwd(), "src/app/admin/materials/MaterialDetailClient.tsx");
  const source = readFileSync(filePath, "utf8");

  assert.match(source, /canonical_name|Canonical Name/, "detail client should expose canonical name editing");
  assert.match(source, /Category/, "detail client should expose category editing");
  assert.match(source, /Dimensions/, "detail client should expose dimensions editing");
  assert.match(source, /Thickness/, "detail client should expose thickness editing");
  assert.match(source, /Default Price/, "detail client should expose default price editing");
  assert.match(source, /\/api\/materials\//, "detail client should use the materials detail API");
  assert.match(source, /Save Material|Create Material/, "detail client should expose a save action");
  assert.match(source, /Archive Material|Restore Material/, "detail client should expose archive/restore behavior");
});
