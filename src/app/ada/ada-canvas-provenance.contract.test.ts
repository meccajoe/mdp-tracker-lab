import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const generation = readFileSync(join(root, "src/lib/ada-quote-generation.ts"), "utf8");
const canvas = readFileSync(join(root, "src/components/ada-quote-canvas.tsx"), "utf8");
test("Ada quote lines carry build-item grouping, confidence, and evidence provenance", () => {
  assert.match(generation, /buildItem/);
  assert.match(generation, /confidence/);
  assert.match(generation, /evidenceRefs/);
  assert.match(generation, /pricingBasis/);
  assert.match(canvas, /Build item/);
  assert.match(canvas, /Confidence/);
  assert.match(canvas, /Evidence/);
  assert.match(canvas, /Pricing basis/);
});
