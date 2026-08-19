import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = process.cwd();
const generation = readFileSync(join(root, "src/lib/ada-quote-generation.ts"), "utf8");
const detail = readFileSync(join(root, "src/components/ada-workspace-detail.tsx"), "utf8");
const viewer = readFileSync(join(root, "src/components/ada-evidence-viewer.tsx"), "utf8");
test("Ada evidence citations can specify and open a PDF page", () => {
  assert.match(generation, /asset:<asset-id>:page:<page-number>/);
  assert.match(detail, /:page:/);
  assert.match(detail, /setSelectedEvidencePage/);
  assert.match(viewer, /initialPage/);
  assert.match(viewer, /#page=/);
  assert.match(viewer, /Page \$\{page\}/);
});
